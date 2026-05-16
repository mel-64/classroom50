import type { GithubUser } from './types'

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
  user: GithubUser | undefined
  isLoadingUser: boolean
  token: string | null
  tokenScope: string
  onSignOut: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="alert alert-success items-start text-sm">
        <span>/</span>
        <span>
          Signed in - token stored in{' '}
          <code className="font-mono">localStorage</code>
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        {user?.avatar_url ? (
          <img
            className="size-20 rounded-full border-2 border-success object-cover"
            src={user.avatar_url}
            alt=""
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-full border-2 border-success bg-base-300 text-2xl opacity-70">
            ◉
          </div>
        )}

        {isLoadingUser && !user ? (
          <div className="text-sm text-base-content/60">Fetching profile...</div>
        ) : user ? (
          <div>
            <div className="font-serif text-2xl italic">
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

        <div className="w-full rounded-box border border-base-content/10 bg-base-300 p-3 text-left font-mono text-xs text-base-content/60">
          <strong className="text-success">gh_access_token</strong> →{' '}
          {previewToken(token)}
        </div>

        <div className="w-full rounded-box border border-base-content/10 bg-base-300 p-3 text-left font-mono text-xs text-base-content/60">
          <strong className="text-success">granted scopes</strong> →{' '}
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
