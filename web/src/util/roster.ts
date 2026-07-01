import type {
  EnrollmentMethod,
  EnrollmentStatus,
  Student,
} from "@/types/classroom"
import type { InviteStatus } from "@/util/inviteStatus"
import { normalizeStudentRow, splitName } from "@/api/mutations/students"
import { studentKey } from "@/util/identity"

// Re-exported so UI callers keep importing splitName/studentKey from the roster
// util while the single canonical implementations live elsewhere (splitName
// alongside the CSV write path; studentKey in @/util/identity).
export { splitName, studentKey }

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

// Flip reconciled rows to "enrolled" for the optimistic update — a deliberate
// STRICT SUBSET of the server's binding (the server already decided; a refetch
// corrects anything we can't re-identify). Username rows match by username,
// email-only rows by email under the same one-to-one guard. Enrolled rows untouched.
export function applyReconciledToRoster(
  current: Student[],
  reconciled: { username: string; email: string }[],
): Student[] {
  if (reconciled.length === 0) return current
  // An email-only cached row may only claim a reconciled entry whose username
  // matches no other cached row — mirrors the server's one-to-one binding so we
  // don't flip an unrelated row that merely shares an address.
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

// The single source of truth for "how many students are enrolled (GitHub org
// members)". When live status has settled, trust the partition (members +
// removed). Otherwise — a non-owner whose invitations endpoint 403s, or a
// terminal members failure — fall back to the CSV `enrollment_status` column,
// which is the only signal available without owner-only endpoints. Pure so both
// the roster header and the empty-roster warning share one definition and can't
// drift.
export function countEnrolled(
  status: {
    statusAvailable: boolean
    statusLoading: boolean
    partition: RosterPartition
  },
  students: Student[],
): number {
  return status.statusAvailable && !status.statusLoading
    ? status.partition.enrolled.length
    : students.filter((s) => s.enrollment_status === "enrolled").length
}

export type EmptyRosterDecision = {
  show: boolean
  hasRosterRows: boolean
  isLoading: boolean
}

// Pure decision for the empty-roster warning, kept React-free (no hooks) so the
// branches are unit-testable in isolation — mirroring resolveTeacherVerdict.
// `enrolledCount` must already be computed via countEnrolled from the same
// roster status.
export function resolveEmptyRosterWarning(input: {
  studentsLoading: boolean
  statusAvailable: boolean
  statusLoading: boolean
  enrolledCount: number
  rosterRowCount: number
}): EmptyRosterDecision {
  // Gate on load so the banner never flashes: decide only once the roster and
  // (when available) live status have settled.
  const isLoading =
    input.studentsLoading || (input.statusAvailable && input.statusLoading)
  return {
    show: !isLoading && input.enrolledCount === 0,
    hasRosterRows: input.rosterRowCount > 0,
    isLoading,
  }
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
