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

// Lowercase hex of a byte array. Shared by the invite-token generator and the
// email hasher so the Uint8Array -> hex transform lives in one place.
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// Optional per-student invite token. When a teacher sends a student a unique
// secure onboarding link, we generate this random token, store it on the
// roster row, and bake it into BOTH the link and the onboarding repo name
// (`classroom50-onboarding-tok-<token>`). Unlike the email hash, the token is
// NOT derivable from public info — only someone the teacher handed the link to
// can create the correctly-named repo, which closes the pre-squat / roster-row
// hijack on the secure-link flow. The classroom-wide link omits it (email-hash
// naming), trading that guarantee for one shared link; reconcile's
// email-consistency check still applies in both modes.
export function generateInviteToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

// Token names are validated before they ever flow into a repo-name segment or
// a URL, so a hand-edited/garbage value can't produce a malformed repo name.
const INVITE_TOKEN_PATTERN = /^[0-9a-f]{32}$/

export function isValidInviteToken(token: string): boolean {
  return INVITE_TOKEN_PATTERN.test(token.trim())
}

// Repo name keyed on a teacher-issued invite token (the secure-link flow).
export function onboardingRepoNameByToken(token: string): string {
  return `${ONBOARDING_REPO_PREFIX}tok-${token}`
}

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
  return bytesToHex(new Uint8Array(digest)).slice(0, 16)
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
// name at onboarding time based on the secure token (if the teacher sent a
// unique link), else classroom-team access (github-id name when on the team,
// else email-hash name), which can diverge from what the roster row looks like
// now (e.g. a username-invited student who onboarded before the team-add
// propagated created the email-hash repo). So callers that must find or delete
// the repo should try every candidate, not just one. Token name first (most
// specific), then github-id, then email-hash. Deduped; order is a hint only.
export function onboardingRepoCandidates(row: {
  github_id?: string
  email_hash?: string
  invite_token?: string
}): string[] {
  const names: string[] = []
  if (row.invite_token) names.push(onboardingRepoNameByToken(row.invite_token))
  if (row.github_id) names.push(onboardingRepoNameByGithubId(row.github_id))
  if (row.email_hash) names.push(onboardingRepoNameFromHash(row.email_hash))
  return Array.from(new Set(names))
}

// The stable key a reconcile run uses to match a resolved self-report back to
// its roster row. Computed identically at resolve time and at commit time so
// the two phases can never drift (a drift would silently no-op reconciliation).
// github_id wins when present (username/reconciled rows); else the email hash
// (email-first rows). Returns undefined for a row with no key to match on.
export function reconcileRowKey(row: {
  github_id?: string
  email_hash?: string
}): string | undefined {
  if (row.github_id) return `id:${row.github_id}`
  if (row.email_hash) return `email:${row.email_hash}`
  return undefined
}

// A roster row is reconcilable when it isn't already reconciled and carries a
// key to look its onboarding repo up by. Shared by reconcileOnboarding's target
// filter and the UI's pending-count badge so they can never disagree.
export function isReconcilableRow(row: {
  enrollment_status?: string
  github_id?: string
  email_hash?: string
}): boolean {
  return (
    row.enrollment_status !== "reconciled" &&
    Boolean(row.email_hash || row.github_id)
  )
}

// Whether a self-report payload's claimed email matches the email the roster
// row was invited under. The repo name is a guessable function of the email
// (email-hash flow), so a member could pre-create the repo and self-report
// their OWN genuine identity under a victim's email-derived name — the
// commit-author check alone passes that. Binding the payload email back to the
// invited row's email_hash (or email) is what stops a self-report for the wrong
// person from being folded into someone else's row.
export async function payloadEmailMatchesRow(
  payloadEmail: string,
  row: { email?: string; email_hash?: string },
): Promise<boolean> {
  const normalized = normalizeEmail(payloadEmail)
  if (row.email_hash) {
    return (await emailHash(normalized)) === row.email_hash
  }
  if (row.email?.trim()) {
    return normalized === normalizeEmail(row.email)
  }
  // A github_id-keyed row with no email on file can't be email-checked here;
  // the caller falls back to the commit-author identity check for those.
  return true
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
