import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_GITHUB_SCOPE } from './constants'
import {
  buildGithubAuthorizeUrl,
  exchangeWebCode,
  pollDeviceToken,
  requestDeviceCode
} from './github-oauth-api'
import { fetchGithubUser } from './github-user-api'
import { deriveChallenge, generateVerifier, randomBase64Url } from './pkce'
import {
  clearGithubToken,
  consumeOAuthSession,
  getStoredGithubClientId,
  getStoredGithubScope,
  getStoredGithubToken,
  persistGithubClientId,
  persistGithubToken,
  saveOAuthSession
} from './storage'
import type { DeviceAuthState, GithubAuthScreen } from '.types'

function formatError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)

  if (
    message.toLowerCase().includes('failed to fetch') ||
    message.toLowerCase().includes('networkerror')
  ) {
    return 'Network error reaching the Cloudflare Worker proxy; it may be down or unreachable.'
  }

  return message
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms)

    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

export function useGithubAuth() {
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)

  const [screen, setScreen] = useState<GithubAuthScreen>('config')
  const [clientId, setClientId] = useState('')
  const [scope, setScope] = useState(DEFAULT_GITHUB_SCOPE)
  const [token, setToken] = useState<string | null>(null)
  const [tokenScope, setTokenScope] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [device, setDevice] = useState<DeviceAuthState | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const githubUserQuery = useQuery({
    queryKey: ['github', 'user', token],
    queryFn: () => fetchGithubUser(token!),
    enabled: Boolean(token),
    staleTime: 60_000,
    retry: 1
  })

  const exchangeCodeMutation = useMutation({
    mutationFn: exchangeWebCode
  })

  const requestDeviceCodeMutation = useMutation({
    mutationFn: requestDeviceCode
  })

  useEffect(() => {
    const storedToken = getStoredGithubToken()
    const storedClientId = getStoredGithubClientId()
    const storedScope = getStoredGithubScope()

    setClientId(storedClientId)
    setTokenScope(storedScope)

    if (storedToken) {
      setToken(storedToken)
      setScreen('authed')
    }
  }, [])

  useEffect(() => {
    if (screen !== 'device-prompt') return

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 500)

    return () => window.clearInterval(timer)
  }, [screen])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const returnedState = params.get('state')

    if (!code) return

    window.history.replaceState({}, '', window.location.pathname)

    const {
      verifier,
      expectedState,
      clientId: callbackClientId,
      scope: callbackScope,
    } = consumeOAuthSession()

    if (!returnedState || returnedState !== expectedState) {
      setError('State mismatch -- possible CSRF. Please try signing in again.')
      setScreen('config')
      return
    }

    if (!verifier || !callbackClientId) {
      setError('Missing PKCE verifier or client ID. Please try signing in again.')
      setScreen('config')
      return
    }

    const restoredScope = callbackScope || DEFAULT_GITHUB_SCOPE

    setClientId(callbackClientId)
    setScope(restoredScope)
    persistGithubClientId(callbackClientId)

    setScreen('exchanging')
    setError(null)

    exchangeCodeMutation.mutate(
      {
        clientId: callbackClientId,
        code,
        verifier
      },
      {
        onSuccess: (data) => {
          persistGithubToken(data.access_token, data.scope || '')
          setToken(data.access_token)
          setTokenScope(data.scope || '')
          setScreen('authed')
        },
        onError: (err) => {
          setError(formatError(err))
          setScreen('config')
        }
      }
    )
  }, [])

  const validateConfig = useCallback(() => {
    const trimmedClientId = clientId.trim()
    const trimmedScope = scope.trim() || DEFAULT_GITHUB_SCOPE

    if (!trimmedClientId) {
      setError('OAuth App Client ID is required.')
      return null
    }

    persistGithubClientId(trimmedClientId)
    setClientId(trimmedClientId)
    setScope(trimmedScope)
    setError(null)

    return {
      clientId: trimmedClientId,
      scope: trimmedScope
    }
  }, [clientId, scope])

  const startWebFlow = useCallback(async () => {
    const config = validateConfig()
    if (!config) return

    setScreen('exchanging')

    const verifier = generateVerifier()
    const challenge = await deriveChallenge(verifier)
    const oauthState = randomBase64Url(16)

    saveOAuthSession({
      verifier,
      state: oauthState,
      clientId: config.clientId,
      scope: config.scope
    })

    window.location.href = buildGithubAuthorizeUrl({
      clientId: config.clientId,
      scope: config.scope,
      state: oauthState,
      challenge
    })
  }, [validateConfig])

  const failDeviceFlow = useCallback((message: string) => {
    abortRef.current?.abort()
    abortRef.current = null
    setError(message)
    setDevice(null)
    setScreen('config')
  }, [])

  const startDevicePolling = useCallback(
    async (input: {
      clientId: string
      deviceCode: string
      expiresAt: number
      initialIntervalSeconds: number
    }) => {
      abortRef.current?.abort()

      const controller = new AbortController()
      abortRef.current = controller

      let intervalSeconds = input.initialIntervalSeconds
      let attempts = 0

      while (!controller.signal.aborted) {
        if (Date.now() > input.expiresAt) {
          failDeviceFlow('Device code expired. Please try again.')
          return
        }

        setDevice((current) => 
          current
            ? {
              ...current,
              intervalSeconds,
              nextPollAt: Date.now() + intervalSeconds * 1000
            }
            : current
        )

        await sleep(intervalSeconds * 1000, controller.signal)

        if (controller.signal.aborted) return

        attempts += 1

        setDevice((current) =>
          current
            ? {
              ...current,
              attempts
            }
            : current
        )

        let data

        try {
          data = await pollDeviceToken({
            clientId: input.clientId,
            deviceCode: input.deviceCode,
            signal: controller.signal
          })
        } catch (err) {
          if (controller.signal.aborted) return
          failDeviceFlow(formatError(err))
          return
        }

        if (data.error === 'authorization_pending') continue

        if (data.error === 'slow_down') {
          intervalSeconds += 5
          continue
        }

        if (data.error === 'access_denied') {
          failDeviceFlow('You declined the authorization request.')
          return
        }

        if (data.error === 'expired_token') {
          failDeviceFlow('Device code expired. Please try again.')
          return
        }

        if (data.error) {
          failDeviceFlow(data.error_description || data.error)
          return
        }

        if (!data.access_token) {
          failDeviceFlow('Token endpoint returned no access_token and no error.')
          return
        }

        persistGithubToken(data.access_token, data.scope || '')
        setToken(data.access_token)
        setTokenScope(data.scope || '')
        setDevice(null)
        setScreen('device-success')

        queryClient.prefetchQuery({
          queryKey: ['github', 'user', data.access_token],
          queryFn: () => fetchGithubUser(data.access_token!)
        })

        window.setTimeout(() => {
          setScreen('authed')
        }, 3000)

        return
      }
    },
    [failDeviceFlow, queryClient]
  )

  const startDeviceFlow = useCallback(async () => {
    const config = validateConfig()
    if (!config) return

    setError(null)

    requestDeviceCodeMutation.mutate(config, {
      onSuccess: (data) => {
        const intervalSeconds = data.interval || 5
        const expiresAt = Date.now() + data.expires_in! * 1000

        setDevice({
          userCode: data.user_code!,
          verificationUri: data.verification_uri!,
          deviceCode: data.device_code!,
          expiresAt,
          intervalSeconds,
          attempts: 0,
          nextPollAt: Date.now() + intervalSeconds * 1000,
          progress: 0
        })

        setScreen('device-prompt')

        void startDevicePolling({
          clientId: config.clientId,
          deviceCode: data.device_code!,
          expiresAt,
          initialIntervalSeconds: intervalSeconds
        })
      },
      onError: (err) => {
        failDeviceFlow(formatError(err))
      }
    })
  }, [
    failDeviceFlow,
    requestDeviceCodeMutation,
    startDevicePolling,
    validateConfig
  ])

  const cancelDeviceFlow = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setDevice(null)
    setError(null)
    setScreen('config')
  }, [])

  const markDeviceCodeCopied = useCallback(() => {
    setDevice((current) =>
      current && current.progress < 1
        ? {
          ...current,
          progress: 1
        }
        : current
    )
  }, [])

  const markVerificationOpened = useCallback(() => {
    setDevice((current) =>
      current && current.progress < 2
        ? {
          ...current,
          progress: 2
        }
        : current
    )
  }, [])

  const signOut = useCallback(() => {
    abortRef.current?.abort()
    clearGithubToken()
    setToken(null)
    setTokenScope('')
    setDevice(null)
    setError(null)
    setScreen('config')
    queryClient.removeQueries({ queryKey: ['github'] })
  }, [queryClient])

  const deviceStatus = useMemo(() => {
    if (!device) return null

    const remainingSeconds = Math.max(
      0,
      Math.floor((device.expiresAt - now) / 1000)
    )

    const nextPollSeconds = Math.max(
      0,
      Math.ceil((device.nextPollAt - now) / 1000)
    )

    const minutes = Math.floor(remainingSeconds / 60)
    const seconds = String(remainingSeconds % 60).padStart(2, '0')

    return {
      attempts: device.attempts,
      nextPollSeconds,
      expiresDisplay: `${minutes}:${seconds}`
    }
  }, [device, now])

  return {
    screen,
    clientId,
    setClientId,
    scope,
    setScope,
    token,
    tokenScope,
    error,
    device,
    deviceStatus,
    githubUserQuery,
    isStartingWebFlow: screen === 'exchanging',
    isRequestingDeviceCode: requestDeviceCodeMutation.isPending,
    startWebFlow,
    startDeviceFlow,
    cancelDeviceFlow,
    markDeviceCodeCopied,
    markVerificationOpened,
    signOut
  }
}
