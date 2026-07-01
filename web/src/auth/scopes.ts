import { DEFAULT_GITHUB_SCOPE } from "./constants"

export const REQUIRED_SCOPES = DEFAULT_GITHUB_SCOPE.split(/\s+/).filter(Boolean)

// GitHub normalizes granted scopes and a broader scope implies narrower ones.
// We encode each grantable scope -> the set of scopes it also satisfies, so a
// token granted `repo` covers `repo:status`, a token granted `admin:org`
// covers `read:org`, etc. The map is intentionally small and focused on the
// scopes in DEFAULT_GITHUB_SCOPE; unknown granted scopes simply satisfy
// themselves. Keep this biased toward over-satisfying: a missed gap is a softer
// failure than a spurious banner a re-auth can't clear.
const SCOPE_IMPLICATIONS: Record<string, readonly string[]> = {
  repo: [
    "repo:status",
    "repo_deployment",
    "public_repo",
    "repo:invite",
    "security_events",
  ],
  "admin:org": ["write:org", "read:org", "manage_runners:org"],
  "write:org": ["read:org"],
  user: ["read:user", "user:email", "user:follow"],
}

// Expand a raw granted-scope string (space- or comma-delimited) into the full
// set of scopes it satisfies, including implied sub-scopes.
export function expandScopes(granted: string): Set<string> {
  const direct = granted.split(/[\s,]+/).filter(Boolean)
  const expanded = new Set<string>()

  for (const scope of direct) {
    expanded.add(scope)
    for (const implied of SCOPE_IMPLICATIONS[scope] ?? []) {
      expanded.add(implied)
    }
  }

  return expanded
}

// Required scopes not satisfied by the expanded granted set. Empty granted ->
// every required scope is reported missing; callers decide whether an absent
// signal should suppress the warning entirely (see useMissingScopes).
export function missingScopes(granted: string): string[] {
  const have = expandScopes(granted)
  return REQUIRED_SCOPES.filter((scope) => !have.has(scope))
}
