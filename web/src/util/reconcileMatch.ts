import { isValidInviteToken, rowMatchesEmailHash } from "@/util/onboarding"

// The one self-report -> roster-row matcher, shared by teacher reconcile
// (api/mutations/students.ts) and the UI "ready" badge (util/inviteStatus.ts) so
// the two can't drift (the badge once ignored invite_token/email_hash and
// disagreed with reconcile).

// How a report bound to a row, strongest key first. "username" is reconcile's
// membership-pass key (not produced here); kept in the union so the reconcile
// commit phase can record it too.
export type MatchBy = "token" | "github_id" | "email" | "username"

// Structural so both StudentCsvRow (raw strings) and the typed Student satisfy it.
export type MatchableRow = {
  invite_token?: string
  github_id?: string
  email?: string
  email_hash?: string
}

// emailHash is precomputed so the matcher stays sync (the UI classifier reuses it).
export type MatchableReport = {
  invite_token?: string
  github_id: string
  email: string
  emailHash: string
}

export type MatchResult<Row> =
  | { row: Row; by: MatchBy; value: string }
  // Email alone matched 2+ rows — never guess; the caller resolves it manually.
  | { ambiguous: true; count: number }
  | undefined

// Match a verified self-report to at most one row: invite_token, then github_id,
// then email_hash. `isClaimed` enforces the caller's one-to-one binding
// ("first report wins"). The email pass excludes rows carrying a token/github_id
// AND requires an email key — else rowMatchesEmailHash's keyless-true fallthrough
// would bind an unrelated report to a keyless row. emailKeyOf is the stable value
// recorded for an email match so a re-match after a CSV re-read still agrees.
export function matchReportToRow<Row extends MatchableRow>(
  report: MatchableReport,
  rows: Row[],
  opts: {
    isClaimed: (row: Row) => boolean
    emailKeyOf: (row: Row) => string
  },
): MatchResult<Row> {
  const token =
    report.invite_token && isValidInviteToken(report.invite_token)
      ? report.invite_token.trim()
      : undefined

  if (token) {
    const row = rows.find((r) => !opts.isClaimed(r) && r.invite_token === token)
    if (row) return { row, by: "token", value: token }
  }

  const byId = rows.find(
    (r) => !opts.isClaimed(r) && r.github_id === report.github_id,
  )
  if (byId) return { row: byId, by: "github_id", value: report.github_id }

  const emailCandidates = rows.filter((r) => {
    if (opts.isClaimed(r)) return false
    if (r.invite_token || r.github_id) return false
    if (!r.email_hash && !r.email?.trim()) return false
    return rowMatchesEmailHash(r, report.email, report.emailHash)
  })
  if (emailCandidates.length === 1) {
    const row = emailCandidates[0]
    return { row, by: "email", value: opts.emailKeyOf(row) }
  }
  if (emailCandidates.length > 1) {
    return { ambiguous: true, count: emailCandidates.length }
  }

  return undefined
}

// One-to-one binding of many reports to many rows, in report order (first report
// wins, each row bound once). The primitive the UI "ready" badge builds on so it
// can't diverge from reconcile's precedence/ambiguity handling; reconcile keeps
// its own loop (interleaved author verification/cleanup) but calls the same
// matchReportToRow.
export function bindReportsToRows<
  Row extends MatchableRow,
  Report extends MatchableReport,
>(
  reports: Report[],
  rows: Row[],
  emailKeyOf: (row: Row) => string,
): Map<Row, { report: Report; by: MatchBy; value: string }> {
  const bound = new Map<Row, { report: Report; by: MatchBy; value: string }>()
  const claimedIds = new Set<string>()
  for (const report of reports) {
    // A second report from an already-bound identity can't claim another row.
    if (report.github_id && claimedIds.has(report.github_id)) continue
    const result = matchReportToRow(report, rows, {
      isClaimed: (row) => bound.has(row),
      emailKeyOf,
    })
    if (!result || "ambiguous" in result) continue
    bound.set(result.row, { report, by: result.by, value: result.value })
    if (report.github_id) claimedIds.add(report.github_id)
  }
  return bound
}
