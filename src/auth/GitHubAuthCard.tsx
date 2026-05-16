import { DEFAULT_GITHUB_SCOPE } from './constants'
import { useGithubAuth } from './useGithubAuth'
import { GitHubAuthedPanel } from './GitHubAuthedPanel'
import { GitHubDevicePrompt } from './GitHubDevicePrompt'

function GitHubMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 98 96" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
    </svg>
  )
}

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

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-base-300 bg-[linear-gradient(hsl(var(--bc)/0.08)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--bc)/0.08)_1px,transparent_1px)] bg-[size:40px_40px] px-4 py-8">
      <section className="card w-full max-w-lg border border-base-content/10 bg-base-100 shadow-2xl">
        <header className="card-title border-b border-base-content/10 px-7 py-5">
          <GitHubMark />
          <h1 className="font-serif text-2xl italic">
            GitHub <span className="text-success">OAuth</span> Login
          </h1>
        </header>

        <div className="card-body">
          {auth.screen === 'authed' ? (
            <GitHubAuthedPanel
              user={auth.githubUserQuery.data}
              isLoadingUser={auth.githubUserQuery.isLoading}
              token={auth.token}
              tokenScope={auth.tokenScope}
              onSignOut={auth.signOut}
            />
          ) : auth.screen === 'exchanging' ? (
            <LoadingScreen label="Exchanging code for access token..." />
          ) : auth.screen === 'device-success' ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-success text-3xl font-bold text-success-content">
                ✓
              </div>
              <div>
                <h2 className="font-serif text-2xl italic">
                  Authentication successful
                </h2>
                <p className="mt-2 flex items-center justify-center gap-2 text-sm text-base-content/60">
                  Loading your profile...
                </p>
              </div>
            </div>
          ) : auth.screen === 'device-prompt' && auth.device ? (
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
                  <span>⚠</span>
                  <span>{auth.error}</span>
                </div>
              ) : null}

              <label className="form-control">
                <div className="label">
                  <span className="label-text text-xs font-bold uppercase tracking-widest opacity-70">
                    OAuth App Client ID
                  </span>
                </div>

                <input
                  className="input input-bordered font-mono"
                  value={auth.clientID}
                  placeholder="0v23li..."
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => auth.setClientId(event.target.value)}
                />

                <div className="label items-start">
                  <span className="label-text-alt min-w-0 w-full whitespace-normal break-words leading-relaxed opacity-60">
                    Create one at{' '}
                    <a
                      className="link link-info break-words"
                      href="https://github.com/settings/developers"
                      target="_blank"
                      rel="noreferrer"
                    >
                      github.com/settings/developers ↗
                    </a>
                    . For Web Flow, set callback URL to{' '}
                    <code className="break-all rounded bg-base-300 px-1 py-0.5">
                      {typeof window === 'undefined'
                        ? '/'
                        : window.location.origin + window.location.pathname}
                    </code>
                    .
                  </span>
                </div>
              </label>

              <label className="form-control">
                <div className="label mt-6">
                  <span className="label-text text-xs font-bold uppercase tracking-widest opacity-70">
                    Scopes
                  </span>
                </div>

                <input
                  className="input input-bordered font-mono"
                  value={auth.scope}
                  placeholder={DEFAULT_GITHUB_SCOPE}
                  spellCheck={false}
                  onChange={(event) => auth.setScope(event.target.value)}
                />
              </label>

              <div className="space-y-3 mt-6">
                <button
                  className="btn btn-success w-full"
                  type="submit"
                  disabled={auth.isStartingWebFlow}
                >
                  {auth.isStartingWebFlow ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <GitHubMark className="size-4" />
                  )}
                  Sign in Web Flow
                </button>

                <button
                  className="btn btn-outline w-full"
                  type="button"
                  disabled={auth.isRequestingDeviceCode}
                  onClick={() => void auth.startDeviceFlow()}
                >
                  {auth.isRequestingDeviceCode ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : null}
                  Sign in Device Flow
                </button>
              </div>
            </form>
          )}
        </div>

        <footer className="flex items-center justify-center gap-4 border-t border-base-content/10 px-7 py-4 text-xs text-base-content/50">
          <span className="badge badge-success badge-outline">
            ✓ Web + Device flows
          </span>
          <a
            className="link-hover"
            href="https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps"
            target="_blank"
            rel="noreferrer"
          >
            GitHub OAuth docs ↗
          </a>
        </footer>
      </section>
    </main>
  )
}
