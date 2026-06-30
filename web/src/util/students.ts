import type { Student } from "@/types/classroom"

export const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : ""

// Single source of truth for "is this row enrolled?" — the teacher has
// confirmed the student's GitHub identity. Only an explicit "enrolled" counts;
// "invited" and legacy ("") rows are NOT enrolled. The edit modal's email lock,
// the inviteStatus classifier, and the updateStudent server guard all key off
// this so they can't drift (a divergent definition would let the server accept
// an email change the UI locked, or vice versa).
export const isEnrolledRow = (row: { enrollment_status?: string }): boolean =>
  row.enrollment_status === "enrolled"

// Find a roster student by username, case-insensitively — GitHub logins are
// case-insensitive and scores.json logins can differ in case from the CSV, so
// an exact `===` would drop the name/section for a real student.
const findByUsername = (key: string, students: Student[]) => {
  const k = key.trim().toLowerCase()
  return students.find((s) => s.username.trim().toLowerCase() === k)
}

// A minimal Student carrying only the username; fallback when a row's username
// isn't on the roster.
export const placeholderStudent = (username: string): Student => ({
  username,
  first_name: "",
  last_name: "",
  email: "",
  section: "",
  github_id: "",
})

// The roster Student for a username, or a placeholder so callers always get one.
export const resolveStudent = (key: string, students: Student[]): Student =>
  findByUsername(key, students) ?? placeholderStudent(key)

// Whether a GitHub account is the same person as a roster student: numeric id
// first, then case-insensitive login (the CSV may predate id capture).
export const isSameGitHubUser = (
  account: { id: number; login: string } | null | undefined,
  student: { github_id?: string; username: string },
): boolean => {
  if (!account) return false
  return (
    String(account.id) === String(student.github_id) ||
    account.login.toLowerCase() === student.username.trim().toLowerCase()
  )
}

// Parse a roster row's github_id into a positive numeric GitHub id, or null
// when it's absent/non-numeric. GitHub ids are positive integers; the CSV stores
// them as strings.
export const parseGitHubId = (githubId: string): number | null => {
  const id = Number(githubId)
  return Number.isFinite(id) && id > 0 ? id : null
}

export const getName = (key: string, students: Student[]) => {
  const student = findByUsername(key, students)
  if (!student) return ""
  return nameFromParts(student.first_name, student.last_name)
}

// Display name from self-reported names (onboarding YAML). CSV stays
// authoritative; callers use this only to fill a row that has no CSV name yet.
// Empty when neither name is present.
export const nameFromParts = (
  firstName?: string,
  lastName?: string,
): string => {
  const first = firstName?.trim() ?? ""
  const last = lastName?.trim() ?? ""
  if (!first && !last) return ""
  if (!first) return capitalize(last)
  if (!last) return capitalize(first)
  return `${capitalize(first)} ${capitalize(last)}`
}

export const getInitials = (key: string, students: Student[]) => {
  const student = findByUsername(key, students)
  if (!student) return ""
  return initialsFromParts(student.first_name, student.last_name)
}

// Avatar initials from self-reported names, mirroring getInitials. Empty when
// neither name is present.
export const initialsFromParts = (
  firstName?: string,
  lastName?: string,
): string => {
  const first = capitalize((firstName ?? "").trim().slice(0, 1))
  const last = capitalize((lastName ?? "").trim().slice(0, 1))
  return `${first}${last}`
}

// A student's section by username, or "" if unknown/unset.
export const getSection = (key: string, students: Student[]): string =>
  findByUsername(key, students)?.section?.trim() ?? ""
