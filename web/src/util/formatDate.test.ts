import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildDueFields,
  formatDueDate,
  formatDueDateTime,
  isPastDue,
} from "./formatDate"

describe("formatDueDate", () => {
  it("formats a bare YYYY-MM-DD as a date with no time", () => {
    expect(formatDueDate("2026-06-23")).toBe("Jun 23, 2026")
  })

  it("formats an RFC 3339 UTC timestamp", () => {
    // en-US date-only formatter, so the exact day depends only on the instant.
    expect(formatDueDate("2026-06-23T12:00:00Z")).toContain("2026")
  })

  it("returns a fallback for an unparseable string", () => {
    expect(formatDueDate("not-a-date")).toBe("Invalid date")
  })

  it("returns a fallback for an out-of-range calendar date", () => {
    expect(formatDueDate("2026-13-45")).toBe("Invalid date")
  })
})

describe("formatDueDateTime", () => {
  it("falls back to date-only for a bare YYYY-MM-DD (no misleading midnight)", () => {
    expect(formatDueDateTime("2026-06-23")).toBe(formatDueDate("2026-06-23"))
  })

  it("includes a time component for a full timestamp", () => {
    const out = formatDueDateTime("2026-06-23T23:59:00Z")
    // Wall-clock time + timezone abbreviation are locale/TZ-dependent, so just
    // assert a time-like "HH:MM" pattern is present rather than an exact string.
    expect(out).toMatch(/\d{1,2}:\d{2}/)
  })

  it("returns a fallback for an unparseable timestamp", () => {
    expect(formatDueDateTime("2026-06-23T99:99:99Z")).toBe("Invalid date")
  })
})

describe("isPastDue", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("treats a bare date as past due only after local end-of-day", () => {
    // Same calendar day as the deadline: must NOT be past due (the bug this
    // guards against flagged it past due at local midnight, ~24h early).
    vi.setSystemTime(new Date(2026, 5, 23, 9, 0, 0)) // local 2026-06-23 09:00
    expect(isPastDue("2026-06-23")).toBe(false)

    // Just before local end-of-day: still not past due.
    vi.setSystemTime(new Date(2026, 5, 23, 23, 59, 0))
    expect(isPastDue("2026-06-23")).toBe(false)

    // The next local day: now past due.
    vi.setSystemTime(new Date(2026, 5, 24, 0, 0, 1))
    expect(isPastDue("2026-06-23")).toBe(true)
  })

  it("compares a full timestamp against the current instant", () => {
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"))
    expect(isPastDue("2026-06-23T11:59:00Z")).toBe(true)
    expect(isPastDue("2026-06-23T12:01:00Z")).toBe(false)
  })

  it("returns false for an unparseable date instead of throwing", () => {
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"))
    expect(isPastDue("not-a-date")).toBe(false)
    expect(isPastDue("2026-13-45")).toBe(false)
  })
})

describe("buildDueFields", () => {
  it("pins a bare date to 23:59 local and records due_meta", () => {
    const { due, due_meta } = buildDueFields("2026-06-23")
    expect(due).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    expect(due_meta?.input).toBe("2026-06-23T23:59:00")
    expect(due_meta?.source).toBe("auto-detected")
  })

  it("stores an already-zoned input verbatim", () => {
    expect(buildDueFields("2026-06-23T23:59:00Z")).toEqual({
      due: "2026-06-23T23:59:00Z",
    })
  })

  it("stores a rolled-over (invalid) calendar date verbatim", () => {
    // Feb 30 rolls over in `new Date`, so it is rejected and kept as-is.
    expect(buildDueFields("2026-02-30")).toEqual({ due: "2026-02-30" })
  })
})
