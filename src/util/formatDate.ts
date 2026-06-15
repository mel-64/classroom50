import type { DueMeta } from "@/types/classroom"

const dueDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

// Formats a due date for display. Accepts RFC 3339 timestamps (incl. UTC `Z`)
// and legacy bare YYYY-MM-DD values; returns a fallback instead of throwing.
export const formatDueDate = (dateString: string): string => {
  // Pin bare dates to local midnight so they don't shift a day in negative offsets.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? `${dateString}T00:00:00`
    : dateString
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return "Invalid date"
  }

  return dueDateFormatter.format(date)
}

const pad = (n: number) => String(n).padStart(2, "0")

const formatOffset = (date: Date): string => {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const abs = Math.abs(offsetMinutes)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

export type DueFields = { due: string; due_meta?: DueMeta }

// Builds the `due`/`due_meta` pair for assignments.json from a <input type="date">
// value, mirroring gh-teacher's --due normalization: the picked date is pinned to
// 23:59:00 in the browser's local zone, stored as a UTC instant, and the
// pre-normalization local value/offset/zone are recorded in due_meta. Inputs that
// aren't a bare YYYY-MM-DD are stored verbatim without provenance.
export const buildDueFields = (dueInput: string): DueFields => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueInput)) {
    return { due: dueInput }
  }

  const [year, month, day] = dueInput.split("-").map(Number)
  const local = new Date(year, month - 1, day, 23, 59, 0)
  if (Number.isNaN(local.getTime())) {
    return { due: dueInput }
  }

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const due_meta: DueMeta = {
    input: `${year}-${pad(month)}-${pad(day)}T23:59:00`,
    ...(zone ? { zone } : {}),
    offset: formatOffset(local),
    source: "auto-detected",
  }

  return {
    due: local.toISOString().replace(/\.\d{3}Z$/, "Z"),
    due_meta,
  }
}
