import { describe, expect, it } from "vitest"
import {
  applyReconciledToRoster,
  partitionRoster,
  removeFromRoster,
  splitName,
  studentKey,
  toStudent,
} from "./roster"
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

  it("flips an email-only row matched by email", () => {
    const row = student({
      username: "",
      github_id: "",
      email: "bob@x.io",
      enrollment_status: "invited",
    })
    const next = applyReconciledToRoster(
      [row],
      [{ username: "", email: "BOB@x.io" }],
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
