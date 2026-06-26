// Deterministic naming for the email-first onboarding flow. A student invited
// by email (before their GitHub account is known) self-reports their identity
// by creating an onboarding repo from inside an authenticated session. The repo
// name is derived deterministically from the invited email so the teacher can
// fetch it directly (GET /repos/{org}/<name>) without scanning the org.
//
// The repo name is an opaque pointer, NOT a reversible encoding of the email:
// the authoritative email lives inside .classroom50-onboarding.yaml (exact,
// unmunged), alongside the GitHub-attested username/id. Both the student-create
// path and the teacher-reconcile path import these helpers so the two sides are
// guaranteed to compute the same name.

export const ONBOARDING_REPO_PREFIX = "classroom50-onboarding-"

// Path of the self-report payload committed into the onboarding repo.
export const ONBOARDING_YAML_PATH = ".classroom50-onboarding.yaml"

// Canonical form used for hashing so the same human inbox maps to one name.
// Lowercase + trim only: we deliberately do NOT strip Gmail-style `+tags` or
// dots, because those transforms are provider-specific and would collapse
// genuinely distinct addresses (rongxinliu.g@ vs rongxinliu-g@) onto one repo.
// Whatever the teacher typed at invite time is hashed verbatim (post-normalize)
// and the student onboarding link carries that same email, so the two agree.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Minimal email shape check — a single `@` with non-empty local and domain
// parts and a dotted domain. Deliberately permissive (GitHub, not us, is the
// real validator at invite time); this only catches obvious typos before we
// commit a row and fire an invite.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim())
}

// Lower-cased hex SHA-256 of the normalized email, truncated to 16 chars
// (64 bits). Collision risk is negligible for a classroom, and hex is always a
// valid repo-name segment. Async because Web Crypto's subtle.digest returns a
// Promise.
export async function emailHash(email: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeEmail(email))
  const digest = await crypto.subtle.digest("SHA-256", data)
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return hex.slice(0, 16)
}

// Repo name from an already-computed hash. Sync, so the reconcile loop (which
// reads email_hash from the roster) avoids re-hashing every row.
export function onboardingRepoNameFromHash(hash: string): string {
  return `${ONBOARDING_REPO_PREFIX}${hash}`
}

// Repo name keyed on the immutable GitHub user id, used when the student is
// already on the classroom team (the username invite flow, where the roster row
// carries github_id). The teacher reconciles such rows by looking the repo up
// directly from the row's github_id — no email hashing needed.
export function onboardingRepoNameByGithubId(
  githubId: number | string,
): string {
  return `${ONBOARDING_REPO_PREFIX}ghid-${githubId}`
}

// Repo name from a raw email. Async (awaits emailHash); use at invite/onboard
// time where the email is the input.
export async function onboardingRepoName(email: string): Promise<string> {
  return onboardingRepoNameFromHash(await emailHash(email))
}

// All plausible onboarding repo names for a roster row. The student picks the
// name at onboarding time based on classroom-team access (github-id name when
// on the team, else email-hash name), which can diverge from what the roster
// row looks like now (e.g. a username-invited student who onboarded before the
// team-add propagated created the email-hash repo). So callers that must find
// or delete the repo should try every candidate, not just one. Deduped; order
// is a hint only.
export function onboardingRepoCandidates(row: {
  github_id?: string
  email_hash?: string
}): string[] {
  const names: string[] = []
  if (row.github_id) names.push(onboardingRepoNameByGithubId(row.github_id))
  if (row.email_hash) names.push(onboardingRepoNameFromHash(row.email_hash))
  return Array.from(new Set(names))
}

// Self-report payload committed to ONBOARDING_YAML_PATH inside the onboarding
// repo. github_username/github_id come from the authenticated session (GitHub-
// attested, unforgeable); email and name are student-supplied (claimed).
export type OnboardingPayload = {
  email: string
  first_name: string
  last_name: string
  github_username: string
  github_id: number
  classroom: string
  created_at: string
}
