export const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : ""

export const getName = (key: string, students) => {
  const student = students.find((s) => s.username === key)
  return `${capitalize(student?.first_name)} ${capitalize(student?.last_name.slice(0, 1)) + "."}`
}

export const getInitials = (key: string, students) => {
  const student = students.find((s) => s.username === key)
  return `${capitalize(student?.first_name.slice(0, 1)) + capitalize(student?.last_name.slice(0, 1))}`
}
