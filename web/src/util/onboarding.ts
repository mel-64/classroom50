// Onboarding repo name: `onboarding-<github-id>`. One per student per org,
// derivable from the public github-id. Reconcile never trusts the name — it
// matches on the YAML payload (invite_token, github_id, email) and the commit
// author. The name is guessable, so a squat is possible; the author check limits
// the damage and submitOnboarding surfaces an unwritable squat as a clear error.
// (An earlier design used a random suffix; dropped for a simpler lifecycle.)

import { bytesToHex } from "./hex"

export const ONBOARDING_REPO_PREFIX = "onboarding-"

// Path of the self-report payload committed into the onboarding repo.
export const ONBOARDING_YAML_PATH = ".classroom50-onboarding.yaml"

// 128 bits of CSPRNG randomness as 32-char lowercase hex (unguessable,
// collision-proof). Backs the invite token.
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

// Onboarding repo name: prefix + github-id. One repo per student per org;
// directly derivable, so reconcile/lookup can both list by prefix and
// reconstruct the exact name. Trust still comes from the commit-author check,
// never the name.
export function onboardingRepoName(githubId: number | string): string {
  return `${ONBOARDING_REPO_PREFIX}${githubId}`
}

// The classroom team slug a STUDENT must guess (the authoritative slug is in the
// private classroom.json they can't read). Safe-degrade: on a slug collision the
// derived slug 404s -> "you're all set" reads false -> falls back to the form,
// and re-onboarding is idempotent, so a miss never grants false access. The
// teacher side ignores this and reads the real slug via resolveClassroomTeam.
export function classroomTeamSlugHeuristic(classroom: string): string {
  return `classroom50-${classroom}`
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
// (or email), given the payload email's precomputed hash. A student could
// self-report a DIFFERENT person's email in the YAML; this binding stops a
// wrong-person self-report being folded into someone else's row. Last-resort key (after invite_token and github_id);
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
