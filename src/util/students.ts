import type { Student } from "@/types/classroom"

export const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : ""

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

export const getName = (key: string, students: Student[]) => {
  const student = students.find((s) => s.username === key)
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
  const student = students.find((s) => s.username === key)
  if (!student) return ""
  const { first_name, last_name } = student

  return `${capitalize(first_name.slice(0, 1)) + capitalize(last_name.slice(0, 1))}`
}
