// Onboarding repo name: `classroom50-onboarding-<github-id>-<random-hash>`. The
// random suffix makes the name unguessable (squat-proof) and unique per
// onboarding. It's NOT a lookup key (suffix isn't teacher-derivable): reconcile
// lists by prefix and matches each self-report to a row purely on the YAML
// payload (invite_token, then github_id, then email).

export const ONBOARDING_REPO_PREFIX = "classroom50-onboarding-"

// Path of the self-report payload committed into the onboarding repo.
export const ONBOARDING_YAML_PATH = ".classroom50-onboarding.yaml"

// Lowercase hex of a byte array.
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// 128 bits of CSPRNG randomness as 32-char lowercase hex (unguessable,
// collision-proof). Backs both the invite token and the onboarding suffix.
function random128BitHex(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

// Optional per-student invite token for a teacher-issued secure link. Unlike
// the classroom-wide link it's not derivable from public info; written into the
// self-report YAML (NOT the repo name), where reconcile uses it as the
// strongest match key, closing the email-row hijack for secure-link students.
export function generateInviteToken(): string {
  return random128BitHex()
}

// Validate token names before they flow into a YAML field or URL.
const INVITE_TOKEN_PATTERN = /^[0-9a-f]{32}$/

export function isValidInviteToken(token: string): boolean {
  return INVITE_TOKEN_PATTERN.test(token.trim())
}

// Random suffix for an onboarding repo name: unguessable + collision-proof so
// the name can't be pre-squatted by another org member. Fresh per attempt.
export function generateOnboardingSuffix(): string {
  return random128BitHex()
}

// Onboarding repo name: prefix + github-id + random suffix. Later lookups must
// list by `onboardingRepoPrefixForGithubId` (the name isn't recomputable
// without the suffix).
export function onboardingRepoName(
  githubId: number | string,
  randomSuffix: string,
): string {
  return `${ONBOARDING_REPO_PREFIX}${githubId}-${randomSuffix}`
}

// Prefix matching every onboarding repo a github-id could have created. Used to
// find a student's own repo(s) when the random suffix isn't known.
export function onboardingRepoPrefixForGithubId(
  githubId: number | string,
): string {
  return `${ONBOARDING_REPO_PREFIX}${githubId}-`
}

// Canonical form for hashing/comparison. Lowercase + trim only: deliberately do
// NOT strip Gmail-style `+tags` or dots, since those are provider-specific and
// would collapse genuinely distinct addresses onto one key.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Minimal email shape check. Deliberately permissive (GitHub is the real
// validator at invite time); only catches obvious typos before committing.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim())
}

// SHA-256 of the normalized email, truncated to 16 hex chars. Cached on the
// row as `email_hash` so reconcile can match an email-first self-report without
// storing the raw email twice. Async per Web Crypto's subtle.digest.
export async function emailHash(email: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeEmail(email))
  const digest = await crypto.subtle.digest("SHA-256", data)
  return bytesToHex(new Uint8Array(digest)).slice(0, 16)
}

// A row is reconcilable when not yet enrolled and carrying a key to look its
// self-report up by (github_id or email). Shared with the UI's pending-count
// badge so it can't drift from what reconcile resolves.
export function isReconcilableRow(row: {
  enrollment_status?: string
  github_id?: string
  email_hash?: string
}): boolean {
  return (
    row.enrollment_status !== "enrolled" &&
    Boolean(row.email_hash || row.github_id)
  )
}

// Whether a self-report's claimed email matches the invited row's email_hash
// (or email), given the payload email's precomputed hash. The repo name is
// unguessable, but a student could self-report a DIFFERENT person's email in
// the YAML; this binding stops a wrong-person self-report being folded into
// someone else's row. Last-resort key (after invite_token and github_id);
// falls through to true for a github_id-keyed row with no email, where the
// caller relies on the commit-author identity check. Synchronous so a caller
// matching one payload against many rows hashes the payload email only once.
export function rowMatchesEmailHash(
  row: { email?: string; email_hash?: string },
  payloadEmail: string,
  payloadEmailHash: string,
): boolean {
  if (row.email_hash) {
    return payloadEmailHash === row.email_hash
  }
  if (row.email?.trim()) {
    return normalizeEmail(payloadEmail) === normalizeEmail(row.email)
  }
  return true
}

// Async convenience wrapper that hashes the payload email itself. Prefer
// rowMatchesEmailHash with a precomputed hash when matching against many rows.
export async function payloadEmailMatchesRow(
  payloadEmail: string,
  row: { email?: string; email_hash?: string },
): Promise<boolean> {
  return rowMatchesEmailHash(
    row,
    payloadEmail,
    await emailHash(normalizeEmail(payloadEmail)),
  )
}

// Self-report payload committed to ONBOARDING_YAML_PATH. github_username/
// github_id are GitHub-attested (unforgeable); email and name are claimed.
// invite_token is set only for secure-link onboarding — strongest match key.
export type OnboardingPayload = {
  email: string
  first_name: string
  last_name: string
  github_username: string
  github_id: number
  classroom: string
  created_at: string
  invite_token?: string
}
