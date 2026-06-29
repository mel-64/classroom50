import type {
  EnrollmentMethod,
  EnrollmentStatus,
  Student,
} from "@/types/classroom"
import type { InviteStatus } from "@/util/inviteStatus"
import { normalizeStudentRow, splitName } from "@/api/mutations/students"

// Re-exported so UI callers keep importing splitName from the roster util while
// the single canonical implementation lives alongside the CSV write path.
export { splitName }

// Stable, position-independent per-row identity. Prefer github_id (survives a
// rename), then username, then email. Rows always carry at least one
// (parseStudentsCsv drops fully-empty rows), so no index fallback is needed.
export function studentKey(student: Student): string {
  return student.github_id || student.username || student.email
}

const ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  "invited",
  "enrolled",
  "",
]
const ENROLLMENT_METHODS: readonly EnrollmentMethod[] = ["github", "email", ""]

// Narrow a raw CSV row into a typed Student. Defaulting + trimming of every
// column is delegated to the canonical normalizeStudentRow (one column list,
// shared with the write path); toStudent only narrows enrollment_status/method
// to their string-literal unions, coercing an unknown/off-list value to "".
export function toStudent(row: Record<string, string>): Student {
  const normalized = normalizeStudentRow(row)
  const status = ENROLLMENT_STATUSES.includes(
    normalized.enrollment_status as EnrollmentStatus,
  )
    ? (normalized.enrollment_status as EnrollmentStatus)
    : ""
  const method = ENROLLMENT_METHODS.includes(
    normalized.enrollment_method as EnrollmentMethod,
  )
    ? (normalized.enrollment_method as EnrollmentMethod)
    : ""
  return { ...normalized, enrollment_status: status, enrollment_method: method }
}

// Remove rows matching `key` for the optimistic unenroll update. Removes ALL
// rows that collapse to the same key (mirroring the server's match predicate);
// a later refetch restores any survivor.
export function removeFromRoster(current: Student[], key: string): Student[] {
  return current.filter((student) => studentKey(student) !== key)
}

// Flip reconciled rows to "enrolled" for the optimistic update. Username-bearing
// rows match by username; email-only rows match by email. Already-enrolled rows
// untouched.
export function applyReconciledToRoster(
  current: Student[],
  reconciled: { username: string; email: string }[],
): Student[] {
  if (reconciled.length === 0) return current
  // An email-only cached row may only claim a reconciled entry whose username
  // does NOT already match another cached row. That guard reproduces the
  // server's one-self-report-to-one-row binding and avoids flipping an unrelated
  // email-only row that merely shares an address with a username-reconciled row.
  const cachedUsernames = new Set(
    current.map((s) => s.username.trim().toLowerCase()).filter(Boolean),
  )
  const byUsername = new Set(
    reconciled.map((r) => r.username.trim().toLowerCase()).filter(Boolean),
  )
  const claimableEmails = new Set(
    reconciled
      .filter((r) => !cachedUsernames.has(r.username.trim().toLowerCase()))
      .map((r) => r.email.trim().toLowerCase())
      .filter(Boolean),
  )
  return current.map((student) => {
    if (student.enrollment_status === "enrolled") return student
    const matched = student.username
      ? byUsername.has(student.username.toLowerCase())
      : Boolean(student.email) &&
        claimableEmails.has(student.email.toLowerCase())
    return matched
      ? { ...student, enrollment_status: "enrolled" as const }
      : student
  })
}

export type RosterPartition = {
  readyToConfirm: Student[]
  awaitingEnrollment: Student[]
  enrolled: Student[]
}

// Whether the roster can render without a row flashing in the wrong section.
// True once members + invitations (statusLoading) have settled and — when
// status is available — the self-reports query has loaded or errored (an error
// surfaces its own warning, must not spin forever). Non-owners never fetch
// reports, so status settling is enough. Pure for unit-testability.
export function isRosterReady(input: {
  statusLoading: boolean
  statusAvailable: boolean
  reportsLoaded: boolean
  reportsErrored: boolean
}): boolean {
  return (
    !input.statusLoading &&
    (!input.statusAvailable || input.reportsLoaded || input.reportsErrored)
  )
}

// Partition the roster into the three teacher-facing sections from each row's
// invite status, so sections and row badges agree exactly:
//  - readyToConfirm: onboarded, confirmable now ("ready").
//  - enrolled:       "member" or enrolled-but-since-removed ("removed").
//  - awaitingEnrollment: everything else (invited, not yet onboarded).
export function partitionRoster(
  students: Student[],
  statusOf: (student: Student) => InviteStatus | undefined,
): RosterPartition {
  const readyToConfirm: Student[] = []
  const awaitingEnrollment: Student[] = []
  const enrolled: Student[] = []
  students.forEach((student) => {
    const status = statusOf(student)
    if (status === "ready") {
      readyToConfirm.push(student)
    } else if (status === "member" || status === "removed") {
      enrolled.push(student)
    } else {
      awaitingEnrollment.push(student)
    }
  })
  return { readyToConfirm, awaitingEnrollment, enrolled }
}
