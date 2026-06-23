import type { Student } from "@/types/classroom"

export const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : ""

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
