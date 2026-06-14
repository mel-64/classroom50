const dueDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

// Read side. Accepts RFC 3339 timestamps (the schema/CLI format, e.g.
// 2026-06-10T13:00:00-04:00) as well as legacy bare YYYY-MM-DD values. Never
// throws: a single bad value must not unmount the whole assignments page.
export const formatDueDate = (dateString: string): string => {
  // Bare YYYY-MM-DD parses as UTC midnight, which can render as the previous
  // day in negative offsets. Pin it to local midnight to avoid the shift.
  const normalized = dateString.includes("T")
    ? dateString
    : `${dateString}T00:00:00`

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return "Invalid date"
  }

  return dueDateFormatter.format(date)
}

const pad = (n: number) => String(n).padStart(2, "0")

// Write side. Converts a bare YYYY-MM-DD (from <input type="date">) into a
// schema-compliant RFC 3339 timestamp pinned to 23:59:00 in the local timezone
// (e.g. 2026-06-10 -> 2026-06-10T23:59:00-04:00). Values that already carry a
// time component are passed through unchanged.
export const toRfc3339DueDate = (dateOnly: string): string => {
  if (dateOnly.includes("T")) {
    return dateOnly
  }

  const [year, month, day] = dateOnly.split("-").map(Number)
  const date = new Date(year, month - 1, day, 23, 59, 0)

  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const absMinutes = Math.abs(offsetMinutes)
  const offset = `${sign}${pad(Math.floor(absMinutes / 60))}:${pad(
    absMinutes % 60,
  )}`

  return `${year}-${pad(month)}-${pad(day)}T23:59:00${offset}`
}
