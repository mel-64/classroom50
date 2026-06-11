import { CheckCircle } from 'lucide-react'

import type { GitHubUser } from '@/hooks/github/types'

function previewToken(token: string | null) {
  if (!token) return ''
  return `${token.slice(0, 8)}${'·'.repeat(18)}${token.slice(-4)}`
}

export function GitHubAuthedPanel({
  user,
  isLoadingUser,
  token,
  tokenScope,
  onSignOut
}: {
  user: GitHubUser | null
  isLoadingUser: boolean
  token: string | null
  tokenScope: string
  onSignOut: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="alert alert-success items-start text-sm">
        <CheckCircle className="size-4 shrink-0" />
        <span>
          Signed in - token stored in{' '}
          <code className="font-mono">localStorage</code>
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        {user?.avatar_url ? (
          <img
            className="size-20 rounded-full border border-base-300 object-cover"
            src={user.avatar_url}
            alt=""
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-full border border-base-300 bg-base-200 text-2xl opacity-70">
            ◉
          </div>
        )}

        {isLoadingUser && !user ? (
          <div className="text-sm text-base-content/60">Fetching profile...</div>
        ) : user ? (
          <div>
            <div className="text-xl font-bold tracking-tight">
              {user.name || user.login}
            </div>
            <div className="text-sm text-base-content/60">@{user.login}</div>
            {user.bio ? (
              <p className="mt-2 text-sm text-base-content/60">{user.bio}</p>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-base-content/60">
            Profile unavailable
          </div>
        )}

        <div className="w-full rounded-xl border border-[#eee] bg-base-200 p-3 text-left font-mono text-xs text-base-content/60">
          <strong className="text-base-content">gh_access_token</strong> →{' '}
          {previewToken(token)}
        </div>

        <div className="w-full rounded-xl border border-[#eee] bg-base-200 p-3 text-left font-mono text-xs text-base-content/60">
          <strong className="text-base-content">granted scopes</strong> →{' '}
          {tokenScope || '(none reported)'}
        </div>
      </div>

      <div className="divider" />

      <button className="btn btn-outline w-full" onClick={onSignOut}>
        Sign out & clear token
      </button>
    </div>
  )
}
