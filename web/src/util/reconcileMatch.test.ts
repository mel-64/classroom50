import { describe, expect, it } from "vitest"
import { matchReportToRow, bindReportsToRows } from "./reconcileMatch"
import { emailHash } from "@/util/onboarding"

type Row = {
  id: string
  invite_token?: string
  github_id?: string
  email?: string
  email_hash?: string
}

const claimSet = () => {
  const claimed = new Set<Row>()
  return {
    isClaimed: (r: Row) => claimed.has(r),
    claim: (r: Row) => claimed.add(r),
  }
}

describe("matchReportToRow", () => {
  it("prefers invite_token over github_id and email", async () => {
    const token = "a".repeat(32)
    const rows: Row[] = [
      { id: "byToken", invite_token: token, email: "other@x.edu" },
      { id: "byId", github_id: "42" },
    ]
    const { isClaimed } = claimSet()
    const result = matchReportToRow(
      {
        invite_token: token,
        github_id: "42",
        email: "who@x.edu",
        emailHash: await emailHash("who@x.edu"),
      },
      rows,
      { isClaimed, emailKeyOf: (r) => r.email_hash ?? "" },
    )
    expect(result).toBeDefined()
    if (!result || "ambiguous" in result) throw new Error("expected a match")
    expect(result.row.id).toBe("byToken")
    expect(result.by).toBe("token")
    expect(result.value).toBe(token)
  })

  it("ignores a malformed invite_token and falls to github_id", async () => {
    const rows: Row[] = [{ id: "byId", github_id: "42" }]
    const result = matchReportToRow(
      {
        invite_token: "not-a-valid-token",
        github_id: "42",
        email: "a@x.edu",
        emailHash: await emailHash("a@x.edu"),
      },
      rows,
      { isClaimed: () => false, emailKeyOf: (r) => r.email_hash ?? "" },
    )
    if (!result || "ambiguous" in result) throw new Error("expected a match")
    expect(result.by).toBe("github_id")
    expect(result.value).toBe("42")
  })

  it("matches by github_id when no token", async () => {
    const rows: Row[] = [{ id: "byId", github_id: "99" }]
    const result = matchReportToRow(
      {
        github_id: "99",
        email: "a@x.edu",
        emailHash: await emailHash("a@x.edu"),
      },
      rows,
      { isClaimed: () => false, emailKeyOf: (r) => r.email_hash ?? "" },
    )
    if (!result || "ambiguous" in result) throw new Error("expected a match")
    expect(result.row.id).toBe("byId")
    expect(result.by).toBe("github_id")
  })

  it("matches by email_hash for an email-first row (no token, no github_id)", async () => {
    const hash = await emailHash("student@x.edu")
    const rows: Row[] = [{ id: "byEmail", email_hash: hash }]
    const result = matchReportToRow(
      {
        github_id: "1",
        email: "Student@X.edu",
        emailHash: await emailHash("Student@X.edu"),
      },
      rows,
      { isClaimed: () => false, emailKeyOf: (r) => r.email_hash ?? "" },
    )
    if (!result || "ambiguous" in result) throw new Error("expected a match")
    expect(result.row.id).toBe("byEmail")
    expect(result.by).toBe("email")
    expect(result.value).toBe(hash)
  })

  it("does NOT email-match a row that also carries a token or github_id", async () => {
    const hash = await emailHash("student@x.edu")
    // Row has the matching email_hash but ALSO a github_id -> excluded from the
    // email pass (it should have matched by github_id, but the report's id is
    // different, so no match at all).
    const rows: Row[] = [{ id: "guarded", github_id: "777", email_hash: hash }]
    const result = matchReportToRow(
      { github_id: "1", email: "student@x.edu", emailHash: hash },
      rows,
      { isClaimed: () => false, emailKeyOf: (r) => r.email_hash ?? "" },
    )
    expect(result).toBeUndefined()
  })

  it("returns ambiguous when 2+ email-first rows share the email", async () => {
    const hash = await emailHash("dup@x.edu")
    const rows: Row[] = [
      { id: "a", email_hash: hash },
      { id: "b", email_hash: hash },
    ]
    const result = matchReportToRow(
      { github_id: "1", email: "dup@x.edu", emailHash: hash },
      rows,
      { isClaimed: () => false, emailKeyOf: (r) => r.email_hash ?? "" },
    )
    expect(result && "ambiguous" in result && result.count).toBe(2)
  })

  it("skips a row already claimed by an earlier match", async () => {
    const rows: Row[] = [{ id: "byId", github_id: "42" }]
    const { isClaimed, claim } = claimSet()
    claim(rows[0])
    const result = matchReportToRow(
      {
        github_id: "42",
        email: "a@x.edu",
        emailHash: await emailHash("a@x.edu"),
      },
      rows,
      { isClaimed, emailKeyOf: (r) => r.email_hash ?? "" },
    )
    expect(result).toBeUndefined()
  })
})

describe("bindReportsToRows (one-to-one, first report wins)", () => {
  it("binds each row at most once and lets the first report win", async () => {
    const token = "b".repeat(32)
    const rows: Row[] = [{ id: "target", invite_token: token, github_id: "42" }]
    const reports = [
      // First report claims by token.
      {
        invite_token: token,
        github_id: "100",
        email: "first@x.edu",
        emailHash: await emailHash("first@x.edu"),
      },
      // Second report would match the same row by github_id, but it's claimed.
      {
        github_id: "42",
        email: "second@x.edu",
        emailHash: await emailHash("second@x.edu"),
      },
    ]
    const bound = bindReportsToRows(reports, rows, (r) => r.email_hash ?? "")
    expect(bound.size).toBe(1)
    const match = bound.get(rows[0])
    expect(match?.by).toBe("token")
    expect(match?.report.github_id).toBe("100")
  })

  it("does not let one identity claim two rows via two reports", async () => {
    const rows: Row[] = [
      { id: "r1", github_id: "42" },
      { id: "r2", email_hash: await emailHash("x@x.edu") },
    ]
    const reports = [
      {
        github_id: "42",
        email: "x@x.edu",
        emailHash: await emailHash("x@x.edu"),
      },
      // Same github_id again -> skipped entirely.
      {
        github_id: "42",
        email: "x@x.edu",
        emailHash: await emailHash("x@x.edu"),
      },
    ]
    const bound = bindReportsToRows(reports, rows, (r) => r.email_hash ?? "")
    expect(bound.size).toBe(1)
    expect(bound.get(rows[0])?.by).toBe("github_id")
    expect(bound.get(rows[1])).toBeUndefined()
  })
})
