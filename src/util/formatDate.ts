import type { DueMeta } from "@/types/classroom"

const dueDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

// `undefined` locale uses the viewer's locale, so the timezone abbreviation is
// region-correct ("BST", not "GMT+1" as a fixed `en-US` would render).
const dueDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
})

// Legacy bare calendar date (YYYY-MM-DD), vs a full RFC 3339 timestamp.
const isBareDate = (dateString: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(dateString)

// Pin bare dates to local midnight so they don't shift a day in negative offsets.
const parseDueDate = (dateString: string): Date => {
  const normalized = isBareDate(dateString)
    ? `${dateString}T00:00:00`
    : dateString
  return new Date(normalized)
}

export const formatDueDate = (dateString: string): string => {
  const date = parseDueDate(dateString)
  if (Number.isNaN(date.getTime())) {
    return "Invalid date"
  }

  return dueDateFormatter.format(date)
}

// Bare dates have no time, so fall back to date-only instead of a misleading
// midnight deadline.
export const formatDueDateTime = (dateString: string): string => {
  if (isBareDate(dateString)) {
    return formatDueDate(dateString)
  }

  const date = parseDueDate(dateString)
  if (Number.isNaN(date.getTime())) {
    return "Invalid date"
  }

  return dueDateTimeFormatter.format(date)
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
// gh-teacher's --due: local wall time becomes a UTC instant, with the
// pre-normalization local value/offset/zone in due_meta. Accepts
// `YYYY-MM-DDTHH:MM` and bare `YYYY-MM-DD` (pinned to 23:59 local); anything
// else is stored verbatim.
export const buildDueFields = (dueInput: string): DueFields => {
  const dateOnly = isBareDate(dueInput)
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
  // `new Date` rolls over out-of-range components (Feb 30 -> Mar 2) instead of
  // returning NaN; reject anything that didn't round-trip so `due` can't
  // silently disagree with due_meta.input.
  const rolledOver =
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute
  if (Number.isNaN(local.getTime()) || rolledOver) {
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
