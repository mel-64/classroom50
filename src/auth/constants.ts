export const GITHUB_AUTH_STORAGE = {
  TOKEN: "gh_access_token",
  CLIENT_ID: "gh_client_id",
  SCOPE_GRANTED: "gh_scope_granted",
} as const

export const GITHUB_AUTH_SESSION = {
  VERIFIER: "gh_pkce_verifier",
  STATE: "gh_oauth_state",
  CLIENT_ID: "gh_oauth_client_id",
  SCOPE: "gh_oauth_scope",
} as const

export const DEFAULT_GITHUB_SCOPE = "read:user read:org repo"

export const GITHUB_OAUTH_WORKER_BASE =
  import.meta.env.VITE_GITHUB_OAUTH_WORKER_BASE ??
  "https://tiny-bonus-7dc1.fifty-foundation.workers.dev"
