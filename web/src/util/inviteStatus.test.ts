import { describe, expect, it } from "vitest"
import {
  buildInviteStatusLookup,
  type OnboardingSelfReport,
} from "./inviteStatus"
import { emailHash } from "@/util/onboarding"
import type { Student } from "@/types/classroom"
import type { GitHubOrgInvitation, GitHubUser } from "@/hooks/github/types"

const student = (overrides: Partial<Student> = {}): Student => ({
  username: "octocat",
  first_name: "Mona",
  last_name: "Lisa",
  email: "octocat@example.com",
  section: "",
  github_id: "583231",
  ...overrides,
})

const member = (overrides: Partial<GitHubUser> = {}): GitHubUser =>
  ({
    login: "octocat",
    id: 583231,
    ...overrides,
  }) as GitHubUser

const invitation = (
  overrides: Partial<GitHubOrgInvitation> = {},
): GitHubOrgInvitation => ({
  id: 1,
  login: "octocat",
  email: "octocat@example.com",
  role: "direct_member",
  created_at: "2026-01-01T00:00:00Z",
  failed_at: null,
  failed_reason: null,
  ...overrides,
})

// Build a self-report with a precomputed email_hash (the reader computes this).
const report = async (
  overrides: Partial<OnboardingSelfReport> & {
    email: string
    github_id: string
  },
): Promise<OnboardingSelfReport> => ({
  github_username: "octocat",
  first_name: "Mona",
  last_name: "Lisa",
  ...overrides,
  email_hash: overrides.email_hash ?? (await emailHash(overrides.email)),
})

describe("buildInviteStatusLookup", () => {
  it("classifies an active member by numeric id", () => {
    const lookup = buildInviteStatusLookup([member()], [], [])
    expect(lookup(student()).status).toBe("member")
  })

  it("matches members case-insensitively on login when id differs", () => {
    const lookup = buildInviteStatusLookup(
      [member({ id: 999, login: "OctoCat" })],
      [],
      [],
    )
    expect(lookup(student({ github_id: "" })).status).toBe("member")
  })

  it("classifies a pending invitation", () => {
    const lookup = buildInviteStatusLookup([], [invitation()], [])
    const result = lookup(student())
    expect(result.status).toBe("pending")
    expect(result.invitationId).toBe(1)
    expect(result.invitedAt).toBe("2026-01-01T00:00:00Z")
  })

  it("classifies an expired invitation and exposes its id for cancel", () => {
    const lookup = buildInviteStatusLookup(
      [],
      [],
      [invitation({ id: 42, failed_at: "2026-01-08T00:00:00Z" })],
    )
    const result = lookup(student())
    expect(result.status).toBe("expired")
    expect(result.invitationId).toBe(42)
    expect(result.invitedAt).toBe("2026-01-01T00:00:00Z")
  })

  it("matches a pending invite by email when login is null", () => {
    const lookup = buildInviteStatusLookup(
      [],
      [invitation({ login: null })],
      [],
    )
    expect(lookup(student()).status).toBe("pending")
  })

  it("returns none when the student is nowhere", () => {
    const lookup = buildInviteStatusLookup([], [], [])
    expect(lookup(student()).status).toBe("none")
  })

  it("prefers member over a stale failed invitation", () => {
    const lookup = buildInviteStatusLookup(
      [member()],
      [],
      [invitation({ failed_at: "2026-01-08T00:00:00Z" })],
    )
    expect(lookup(student()).status).toBe("member")
  })

  it("keeps an enrolled row a member when its github_id is in the org", () => {
    const lookup = buildInviteStatusLookup([member()], [], [])
    expect(lookup(student({ enrollment_status: "enrolled" })).status).toBe(
      "member",
    )
  })

  it("marks an enrolled row 'removed' when its github_id left the org", () => {
    // Completeness stays CSV-owned, but membership presence is verified against
    // the live org members: an enrolled student no longer in the org surfaces
    // as "removed" ("Not in organization") rather than silently "member".
    const lookup = buildInviteStatusLookup([], [], [])
    expect(lookup(student({ enrollment_status: "enrolled" })).status).toBe(
      "removed",
    )
  })

  it("classifies an invited-but-unreconciled row as onboarding", () => {
    const lookup = buildInviteStatusLookup([], [], [])
    const emailRow = student({
      username: "",
      github_id: "",
      enrollment_status: "invited",
    })
    expect(lookup(emailRow).status).toBe("onboarding")
  })

  it("classifies an invited row as 'ready' when an onboarding report matches by github_id", async () => {
    const row = student({ enrollment_status: "invited" })
    const lookup = buildInviteStatusLookup(
      [],
      [],
      [],
      [await report({ github_id: "583231", email: "octocat@example.com" })],
      [row],
    )
    expect(lookup(row).status).toBe("ready")
  })

  it("surfaces the matched onboarding self-report on a 'ready' row", async () => {
    const rpt = await report({
      github_id: "583231",
      email: "octocat@example.com",
    })
    const row = student({ enrollment_status: "invited" })
    const lookup = buildInviteStatusLookup([], [], [], [rpt], [row])
    const result = lookup(row)
    expect(result.status).toBe("ready")
    expect(result.selfReport).toEqual(rpt)
  })

  it("classifies an email-invited row (no github_id) as 'ready' when a report matches by email", async () => {
    const row = student({
      username: "",
      github_id: "",
      enrollment_status: "invited",
      email: "octocat@example.com",
      email_hash: await emailHash("octocat@example.com"),
    })
    const lookup = buildInviteStatusLookup(
      [],
      [],
      [],
      // Report email differs only in case; email_hash normalizes to match.
      [await report({ github_id: "999", email: "Octocat@Example.com" })],
      [row],
    )
    expect(lookup(row).status).toBe("ready")
  })

  it("becomes 'ready' by invite_token even when github_id and email differ", async () => {
    // The token is reconcile's strongest key; the badge must honor it too.
    const token = "a".repeat(32)
    const row = student({
      username: "",
      github_id: "",
      enrollment_status: "invited",
      email: "roster@example.com",
      email_hash: await emailHash("roster@example.com"),
      invite_token: token,
    })
    const lookup = buildInviteStatusLookup(
      [],
      [],
      [],
      [
        await report({
          github_id: "999",
          email: "typo@example.com",
          invite_token: token,
        }),
      ],
      [row],
    )
    expect(lookup(row).status).toBe("ready")
  })

  it("does NOT mark ambiguous email rows 'ready' (two rows share an email)", async () => {
    // Two email-first rows with the same email: the shared matcher refuses to
    // guess, so neither is 'ready' (matches reconcile's ambiguity handling).
    const hash = await emailHash("shared@example.com")
    const rowA = student({
      username: "",
      github_id: "",
      enrollment_status: "invited",
      email: "shared@example.com",
      email_hash: hash,
    })
    const rowB = student({
      username: "",
      github_id: "",
      enrollment_status: "invited",
      email: "shared@example.com",
      email_hash: hash,
    })
    const lookup = buildInviteStatusLookup(
      [],
      [],
      [],
      [await report({ github_id: "999", email: "shared@example.com" })],
      [rowA, rowB],
    )
    expect(lookup(rowA).status).toBe("onboarding")
    expect(lookup(rowB).status).toBe("onboarding")
  })

  it("stays 'onboarding' when no onboarding report matches the row", async () => {
    const row = student({
      username: "",
      github_id: "",
      enrollment_status: "invited",
      email: "octocat@example.com",
      email_hash: await emailHash("octocat@example.com"),
    })
    const lookup = buildInviteStatusLookup(
      [],
      [],
      [],
      [await report({ github_id: "111", email: "someone-else@example.com" })],
      [row],
    )
    expect(lookup(row).status).toBe("onboarding")
  })

  it("shows a username-invited org member as onboarding until reconciled", () => {
    // Even though the student is an active org member, an unreconciled row is
    // still awaiting onboarding under the hybrid model.
    const lookup = buildInviteStatusLookup([member()], [], [])
    expect(lookup(student({ enrollment_status: "invited" })).status).toBe(
      "onboarding",
    )
  })

  it("surfaces a still-pending invite on an unreconciled row", () => {
    const lookup = buildInviteStatusLookup([], [invitation()], [])
    expect(lookup(student({ enrollment_status: "invited" })).status).toBe(
      "pending",
    )
  })

  it("does not treat a plain unmatched row as onboarding", () => {
    const lookup = buildInviteStatusLookup([], [], [])
    const emailRow = student({
      username: "",
      github_id: "",
      enrollment_status: "",
    })
    expect(lookup(emailRow).status).toBe("none")
  })
})
