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

// Builds the `due`/`due_meta` pair from the form's due input, mirroring
// gh-teacher's --due: the local wall time becomes a UTC instant (RFC3339 `Z`),
// with the pre-normalization local value/offset/zone in due_meta. Accepts
// `YYYY-MM-DDTHH:MM` (datetime-local) and bare `YYYY-MM-DD` (pinned to 23:59
// local); anything else (already zoned/unparseable) is stored verbatim.
export const buildDueFields = (dueInput: string): DueFields => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dueInput)
  const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(dueInput)

  if (!dateOnly && !localDateTime) {
    // Already carries a zone/offset, or isn't a shape we normalize.
    return { due: dueInput }
  }

  let year: number,
    month: number,
    day: number,
    hour = 23,
    minute = 59
  if (dateOnly) {
    ;[year, month, day] = dueInput.split("-").map(Number)
  } else {
    const [datePart, timePart] = dueInput.split("T")
    ;[year, month, day] = datePart.split("-").map(Number)
    ;[hour, minute] = timePart.split(":").map(Number)
  }

  const local = new Date(year, month - 1, day, hour, minute, 0)
  if (Number.isNaN(local.getTime())) {
    return { due: dueInput }
  }

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const due_meta: DueMeta = {
    input: `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`,
    ...(zone ? { zone } : {}),
    offset: formatOffset(local),
    source: "auto-detected",
  }

  return {
    due: local.toISOString().replace(/\.\d{3}Z$/, "Z"),
    due_meta,
  }
}
