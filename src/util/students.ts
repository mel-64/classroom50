import type { Student } from "@/types/classroom"

export const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : ""

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

  const { first_name, last_name } = student

  if (!first_name && !last_name) {
    return ""
  }

  if (!first_name) return capitalize(last_name)
  if (!last_name) return capitalize(first_name)

  return `${capitalize(first_name)} ${capitalize(last_name)}`
}

export const getInitials = (key: string, students: Student[]) => {
  const student = findByUsername(key, students)
  if (!student) return ""
  const { first_name, last_name } = student

  return `${capitalize(first_name.slice(0, 1)) + capitalize(last_name.slice(0, 1))}`
}

// A student's section by username, or "" if unknown/unset.
export const getSection = (key: string, students: Student[]): string =>
  findByUsername(key, students)?.section?.trim() ?? ""
