import type {
  EnrollmentMethod,
  EnrollmentStatus,
  Student,
} from "@/types/classroom"
import type { InviteStatus } from "@/util/inviteStatus"

// Stable, position-independent per-row identity. github_id is the most stable
// (survives a username rename); fall back to username, then email. Rows always
// carry at least one of these (parseStudentsCsv filters out fully-empty rows),
// so no index fallback is needed.
export function studentKey(student: Student): string {
  return student.github_id || student.username || student.email
}

const ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  "invited",
  "enrolled",
  "",
]
const ENROLLMENT_METHODS: readonly EnrollmentMethod[] = ["github", "email", ""]

// Narrow a raw CSV row (all-string fields, StudentCsvRow-shaped) into a typed
// Student. The enrollment_status / enrollment_method columns are string-literal
// unions on Student; coerce unknown values to "" rather than letting an
// off-list string masquerade as a valid union member (closes the
// `StudentCsvRow as Student` boundary the mutations used to cast across).
export function toStudent(row: Record<string, string>): Student {
  const status = ENROLLMENT_STATUSES.includes(
    row.enrollment_status as EnrollmentStatus,
  )
    ? (row.enrollment_status as EnrollmentStatus)
    : ""
  const method = ENROLLMENT_METHODS.includes(
    row.enrollment_method as EnrollmentMethod,
  )
    ? (row.enrollment_method as EnrollmentMethod)
    : ""
  return {
    username: row.username ?? "",
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    email: row.email ?? "",
    section: row.section ?? "",
    github_id: row.github_id ?? "",
    enrollment_status: status,
    enrollment_method: method,
    email_hash: row.email_hash ?? "",
    invite_token: row.invite_token ?? "",
    invited_at: row.invited_at ?? "",
    enrolled_at: row.enrolled_at ?? "",
  }
}

// Split a free-text full name into first/last. First token is the first name;
// everything after is the last name. Empty/whitespace input yields empty parts.
export function splitName(name: string): {
  first_name: string
  last_name: string
} {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return { first_name: parts.at(0) ?? "", last_name: parts.slice(1).join(" ") }
}

// Remove the row matching `key` (a studentKey value) from the roster. Used for
// the optimistic unenroll update. Removes ALL rows that collapse to the same
// key: a duplicate-key roster (e.g. two email-only rows sharing an email, or
// two rows with the same github_id) is mirrored by the server's own match
// predicate, and a later refetch restores any survivor.
export function removeFromRoster(current: Student[], key: string): Student[] {
  return current.filter((student) => studentKey(student) !== key)
}

// Flip the rows the teacher just confirmed to "enrolled" for the optimistic
// reconcile update. reconciled carries { username, email } per bound row. A
// row that already has a username is identified by username; an email-only row
// (no username yet) is matched by email. This mirrors the server binding each
// self-report to exactly one row and avoids flipping an unrelated email-only
// row that merely shares an email with a username-reconciled row. Already
// "enrolled" rows are left untouched.
export function applyReconciledToRoster(
  current: Student[],
  reconciled: { username: string; email: string }[],
): Student[] {
  if (reconciled.length === 0) return current
  const byUsername = new Set(
    reconciled.map((r) => r.username.trim().toLowerCase()).filter(Boolean),
  )
  // Only entries WITHOUT a username contribute an email key. A reconciled entry
  // that has a username identifies a username-bearing row; its email belongs to
  // that row, not to email-matching — folding it into byEmail would wrongly
  // flip an unrelated email-only row that merely shares the address.
  const byEmail = new Set(
    reconciled
      .filter((r) => !r.username.trim())
      .map((r) => r.email.trim().toLowerCase())
      .filter(Boolean),
  )
  return current.map((student) => {
    if (student.enrollment_status === "enrolled") return student
    const matched = student.username
      ? byUsername.has(student.username.toLowerCase())
      : Boolean(student.email) && byEmail.has(student.email.toLowerCase())
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

// Partition the roster into the three teacher-facing sections from each row's
// computed invite status, so the sections and the row badges agree exactly:
//  - readyToConfirm: onboarded, repo exists -> confirmable now ("ready").
//  - enrolled:       completed ("member") or enrolled-but-since-removed
//                    ("removed").
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
