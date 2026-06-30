import { describe, expect, it } from "vitest"
import {
  applyReconciledToRoster,
  countEnrolled,
  isRosterReady,
  partitionRoster,
  removeFromRoster,
  resolveEmptyRosterWarning,
  splitName,
  studentKey,
  toStudent,
} from "./roster"
import type { RosterPartition } from "./roster"
import type { Student } from "@/types/classroom"
import type { InviteStatus } from "@/util/inviteStatus"

const student = (overrides: Partial<Student> = {}): Student => ({
  username: "octocat",
  first_name: "Mona",
  last_name: "Lisa",
  email: "octocat@example.com",
  section: "",
  github_id: "583231",
  enrollment_status: "invited",
  ...overrides,
})

describe("studentKey", () => {
  it("prefers github_id, then username, then email", () => {
    expect(
      studentKey(student({ github_id: "1", username: "a", email: "e" })),
    ).toBe("1")
    expect(
      studentKey(student({ github_id: "", username: "a", email: "e" })),
    ).toBe("a")
    expect(
      studentKey(student({ github_id: "", username: "", email: "e@x.io" })),
    ).toBe("e@x.io")
  })
})

describe("splitName", () => {
  it("splits first token as first name, rest as last name", () => {
    expect(splitName("Ada Lovelace")).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
    })
    expect(splitName("Mary Ann Evans")).toEqual({
      first_name: "Mary",
      last_name: "Ann Evans",
    })
  })

  it("returns empty parts for empty/whitespace and single token", () => {
    expect(splitName("")).toEqual({ first_name: "", last_name: "" })
    expect(splitName("   ")).toEqual({ first_name: "", last_name: "" })
    expect(splitName("Ada")).toEqual({ first_name: "Ada", last_name: "" })
  })

  it("treats null as empty (GitHub display name may be null)", () => {
    expect(splitName(null)).toEqual({ first_name: "", last_name: "" })
  })
})

describe("toStudent", () => {
  it("passes through valid enrollment_status / enrollment_method", () => {
    const row = {
      username: "x",
      first_name: "",
      last_name: "",
      email: "x@y.io",
      section: "",
      github_id: "9",
      enrollment_status: "enrolled",
      enrollment_method: "github",
      email_hash: "",
      invite_token: "",
      invited_at: "",
      enrolled_at: "",
    }
    const s = toStudent(row)
    expect(s.enrollment_status).toBe("enrolled")
    expect(s.enrollment_method).toBe("github")
  })

  it("coerces an off-list enrollment_status/method to empty string", () => {
    const s = toStudent({
      username: "x",
      enrollment_status: "bogus",
      enrollment_method: "carrier-pigeon",
    } as unknown as Record<string, string>)
    expect(s.enrollment_status).toBe("")
    expect(s.enrollment_method).toBe("")
    // Missing columns default to "".
    expect(s.email).toBe("")
    expect(s.username).toBe("x")
  })

  it('coerces the removed legacy "onboarded" status to empty string', () => {
    // "onboarded" was dropped from EnrollmentStatus; a legacy CSV row carrying
    // it must not masquerade as a valid status.
    const s = toStudent({
      username: "x",
      enrollment_status: "onboarded",
    } as unknown as Record<string, string>)
    expect(s.enrollment_status).toBe("")
  })

  it("trims every field via the canonical normalizer (one defaulting rule)", () => {
    // toStudent now delegates defaulting + trimming to normalizeStudentRow, so
    // padded CSV cells are trimmed (the old toStudent skipped this).
    const s = toStudent({
      username: "  octocat  ",
      first_name: " Mona ",
      email: " octocat@x.io ",
      github_id: " 42 ",
      enrollment_status: " enrolled ",
    } as unknown as Record<string, string>)
    expect(s.username).toBe("octocat")
    expect(s.first_name).toBe("Mona")
    expect(s.email).toBe("octocat@x.io")
    expect(s.github_id).toBe("42")
    expect(s.enrollment_status).toBe("enrolled")
  })
})

describe("isRosterReady", () => {
  it("is false while members/invitations are still loading", () => {
    expect(
      isRosterReady({
        statusLoading: true,
        statusAvailable: true,
        reportsLoaded: false,
        reportsErrored: false,
      }),
    ).toBe(false)
  })

  it("is ready for a non-owner once status settles, without waiting on reports", () => {
    expect(
      isRosterReady({
        statusLoading: false,
        statusAvailable: false,
        reportsLoaded: false,
        reportsErrored: false,
      }),
    ).toBe(true)
  })

  it("is ready for an owner once reports load", () => {
    expect(
      isRosterReady({
        statusLoading: false,
        statusAvailable: true,
        reportsLoaded: true,
        reportsErrored: false,
      }),
    ).toBe(true)
  })

  it("is ready (not stuck) when reports error", () => {
    expect(
      isRosterReady({
        statusLoading: false,
        statusAvailable: true,
        reportsLoaded: false,
        reportsErrored: true,
      }),
    ).toBe(true)
  })

  it("is NOT ready for an owner while reports are still pending (the flash case)", () => {
    expect(
      isRosterReady({
        statusLoading: false,
        statusAvailable: true,
        reportsLoaded: false,
        reportsErrored: false,
      }),
    ).toBe(false)
  })
})

describe("removeFromRoster", () => {
  it("removes the row matching the key", () => {
    const a = student({ github_id: "1", username: "a" })
    const b = student({ github_id: "2", username: "b" })
    expect(removeFromRoster([a, b], "1")).toEqual([b])
  })

  it("removes an email-only row by its email key", () => {
    const emailOnly = student({ github_id: "", username: "", email: "e@x.io" })
    const other = student({ github_id: "2", username: "b" })
    expect(removeFromRoster([emailOnly, other], "e@x.io")).toEqual([other])
  })

  it("removes all rows that collapse to the same key (mirrors server match)", () => {
    const dup1 = student({ github_id: "", username: "", email: "shared@x.io" })
    const dup2 = student({ github_id: "", username: "", email: "shared@x.io" })
    const keep = student({ github_id: "9", username: "c" })
    expect(removeFromRoster([dup1, dup2, keep], "shared@x.io")).toEqual([keep])
  })
})

describe("applyReconciledToRoster", () => {
  it("flips a username-bearing row matched by username", () => {
    const row = student({
      username: "alice",
      github_id: "1",
      enrollment_status: "invited",
    })
    const next = applyReconciledToRoster(
      [row],
      [{ username: "Alice", email: "alice@x.io" }],
    )
    expect(next[0].enrollment_status).toBe("enrolled")
  })

  it("flips an email-only row matched by email (production shape: reconciled entry carries the attested username)", () => {
    const row = student({
      username: "",
      github_id: "",
      email: "bob@x.io",
      enrollment_status: "invited",
    })
    // Reconcile always reports a non-empty github_username, even when the row
    // was bound via the email path. The email-only cached row still has no
    // local username, so it must match by email.
    const next = applyReconciledToRoster(
      [row],
      [{ username: "bob-gh", email: "BOB@x.io" }],
    )
    expect(next[0].enrollment_status).toBe("enrolled")
  })

  it("does NOT flip an unrelated email-only row sharing an email with a username-reconciled row", () => {
    const usernameRow = student({
      username: "carol",
      github_id: "5",
      email: "shared@x.io",
      enrollment_status: "invited",
    })
    const emailOnlyRow = student({
      username: "",
      github_id: "",
      email: "shared@x.io",
      enrollment_status: "invited",
    })
    // Reconcile bound only the username row.
    const next = applyReconciledToRoster(
      [usernameRow, emailOnlyRow],
      [{ username: "carol", email: "shared@x.io" }],
    )
    expect(next[0].enrollment_status).toBe("enrolled")
    expect(next[1].enrollment_status).toBe("invited")
  })

  it("leaves already-enrolled rows untouched and is a no-op for empty input", () => {
    const enrolled = student({ enrollment_status: "enrolled" })
    expect(applyReconciledToRoster([enrolled], [])).toEqual([enrolled])
    const next = applyReconciledToRoster(
      [enrolled],
      [{ username: "octocat", email: "octocat@example.com" }],
    )
    expect(next[0].enrollment_status).toBe("enrolled")
  })
})

describe("partitionRoster", () => {
  it("buckets rows by status: ready / member|removed / else", () => {
    const ready = student({ github_id: "1" })
    const memberRow = student({ github_id: "2" })
    const removedRow = student({ github_id: "3" })
    const awaitingRow = student({ github_id: "4" })
    const unknownRow = student({ github_id: "5" })

    const statuses: Record<string, InviteStatus> = {
      "1": "ready",
      "2": "member",
      "3": "removed",
      "4": "pending",
    }
    const result = partitionRoster(
      [ready, memberRow, removedRow, awaitingRow, unknownRow],
      (s) => statuses[s.github_id],
    )
    expect(result.readyToConfirm).toEqual([ready])
    expect(result.enrolled).toEqual([memberRow, removedRow])
    // pending and undefined-status both fall through to awaiting.
    expect(result.awaitingEnrollment).toEqual([awaitingRow, unknownRow])
  })
})

const partition = (
  overrides: Partial<RosterPartition> = {},
): RosterPartition => ({
  readyToConfirm: [],
  awaitingEnrollment: [],
  enrolled: [],
  ...overrides,
})

describe("countEnrolled", () => {
  it("uses the live partition when status is available and settled", () => {
    const enrolled = [student({ github_id: "1" }), student({ github_id: "2" })]
    const count = countEnrolled(
      {
        statusAvailable: true,
        statusLoading: false,
        partition: partition({ enrolled }),
      },
      // CSV column disagrees on purpose: the live partition must win.
      [student({ enrollment_status: "invited" })],
    )
    expect(count).toBe(2)
  })

  it("falls back to the CSV enrolled column when status is unavailable (non-owner)", () => {
    const students = [
      student({ github_id: "1", enrollment_status: "enrolled" }),
      student({ github_id: "2", enrollment_status: "invited" }),
      student({ github_id: "3", enrollment_status: "enrolled" }),
    ]
    const count = countEnrolled(
      // Non-owner: partition would be empty, but the CSV fallback is used.
      { statusAvailable: false, statusLoading: false, partition: partition() },
      students,
    )
    expect(count).toBe(2)
  })

  it("falls back to the CSV column while live status is still loading", () => {
    const students = [student({ enrollment_status: "enrolled" })]
    const count = countEnrolled(
      { statusAvailable: true, statusLoading: true, partition: partition() },
      students,
    )
    expect(count).toBe(1)
  })
})

describe("resolveEmptyRosterWarning", () => {
  const base = {
    studentsLoading: false,
    statusAvailable: true,
    statusLoading: false,
    enrolledCount: 0,
    rosterRowCount: 0,
  }

  it("shows the warning only once settled with zero enrolled students", () => {
    expect(resolveEmptyRosterWarning(base)).toMatchObject({
      show: true,
      hasRosterRows: false,
      isLoading: false,
    })
  })

  it("never shows (no flash) while the roster is still loading", () => {
    expect(
      resolveEmptyRosterWarning({ ...base, studentsLoading: true }).show,
    ).toBe(false)
  })

  it("never shows (no flash) while live status is loading and available", () => {
    expect(
      resolveEmptyRosterWarning({ ...base, statusLoading: true }).show,
    ).toBe(false)
  })

  it("ignores statusLoading when status is unavailable (non-owner settles on the roster)", () => {
    // statusLoading=true but statusAvailable=false -> not gated by status.
    expect(
      resolveEmptyRosterWarning({
        ...base,
        statusAvailable: false,
        statusLoading: true,
      }).show,
    ).toBe(true)
  })

  it("hides the warning when at least one student is enrolled", () => {
    expect(resolveEmptyRosterWarning({ ...base, enrolledCount: 1 }).show).toBe(
      false,
    )
  })

  it("reports hasRosterRows so callers can distinguish empty vs invited-only", () => {
    // Rows exist but nobody is enrolled -> warn, with the 'invited' copy branch.
    expect(
      resolveEmptyRosterWarning({
        ...base,
        rosterRowCount: 30,
        enrolledCount: 0,
      }),
    ).toMatchObject({ show: true, hasRosterRows: true })
  })
})
