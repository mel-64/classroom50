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

export const DEFAULT_GITHUB_SCOPE = "read:user read:org repo workflow admin:org"

// An org's OAuth app policy page, where owners approve apps or relax the
// restriction.
export const githubOrgOAuthPolicyUrl = (org: string) =>
  `https://github.com/organizations/${org}/settings/oauth_application_policy`

// Public OAuth app identifier (not a secret); injected at build time.
export const GITHUB_OAUTH_CLIENT_ID: string =
  import.meta.env.VITE_GITHUB_CLIENT_ID ?? ""

// Per-app authorization page where a user can review or request org access.
// GitHub keys this page by the app's client ID, so reuse GITHUB_OAUTH_CLIENT_ID
// rather than hardcoding a separate value. Returns null when no client ID is
// configured so callers can omit the link.
export const githubOAuthAppConnectionUrl = (
  clientId: string = GITHUB_OAUTH_CLIENT_ID,
): string | null =>
  clientId
    ? `https://github.com/settings/connections/applications/${clientId}`
    : null

export const GITHUB_OAUTH_WORKER_BASE =
  import.meta.env.VITE_GITHUB_OAUTH_WORKER_BASE ??
  "https://tiny-bonus-7dc1.fifty-foundation.workers.dev"
