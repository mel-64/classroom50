import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { AlertTriangle, CheckCircle, GraduationCap } from "lucide-react"
import GitHub from "@/assets/github.svg?react"

import { useGithubAuth } from "./useGithubAuth"
import { GitHubAuthedPanel } from "./GitHubAuthedPanel"
import { GitHubDevicePrompt } from "./GitHubDevicePrompt"

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center text-base-content/60">
      <span className="loading loading-spinner loading-lg" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function GitHubAuthCard() {
  const auth = useGithubAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.screen !== "success") return

    const timer = window.setTimeout(() => {
      void navigate({ to: "/" })
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [auth.screen, navigate])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4 py-8">
      <section className="card w-full max-w-lg rounded-xl border border-[#eee] bg-base-100 shadow-sm">
        <header className="flex items-center gap-4 border-b border-base-200 px-7 py-6">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <GraduationCap className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Classroom 50</h1>
            <p className="mt-1 text-sm text-base-content/60">
              Sign in with your GitHub account to continue.
            </p>
          </div>
        </header>

        <div className="card-body">
          {auth.screen === "authed" ? (
            <GitHubAuthedPanel
              user={auth.user}
              isLoadingUser={auth.isLoadingUser}
              token={auth.token}
              tokenScope={auth.tokenScope}
              onSignOut={auth.signOut}
            />
          ) : auth.screen === "exchanging" ? (
            <LoadingScreen label="Exchanging code for access token..." />
          ) : auth.screen === "success" ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle className="size-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  Authentication successful
                </h2>
                <p className="mt-2 text-sm text-base-content/60">
                  Redirecting you to the app...
                </p>
              </div>
            </div>
          ) : auth.screen === "device-prompt" && auth.device ? (
            <GitHubDevicePrompt
              device={auth.device}
              status={auth.deviceStatus}
              onCancel={auth.cancelDeviceFlow}
              onCodeCopied={auth.markDeviceCodeCopied}
              onVerificationOpened={auth.markVerificationOpened}
            />
          ) : (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault()
                void auth.startWebFlow()
              }}
            >
              {auth.error ? (
                <div className="alert alert-error items-start text-sm">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{auth.error}</span>
                </div>
              ) : null}

              <div className="space-y-3">
                <button
                  className="btn btn-primary w-full"
                  type="submit"
                  disabled={auth.isStartingWebFlow}
                >
                  {auth.isStartingWebFlow ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <GitHub className="size-4" />
                  )}
                  Sign in with GitHub
                </button>

                <button
                  className="btn btn-outline btn-primary w-full"
                  type="button"
                  disabled={auth.isRequestingDeviceCode}
                  onClick={() => void auth.startDeviceFlow()}
                >
                  {auth.isRequestingDeviceCode ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : null}
                  Use a device code instead
                </button>
              </div>
            </form>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-base-200 px-7 py-4 text-xs text-base-content/50">
          <span>Manage assignments and submissions via GitHub.</span>
          <a
            className="link-hover shrink-0"
            href="https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps"
            target="_blank"
            rel="noreferrer"
          >
            GitHub OAuth docs
          </a>
        </footer>
      </section>
    </main>
  )
}
