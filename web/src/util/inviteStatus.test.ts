import { describe, expect, it } from "vitest"
import { buildInviteStatusLookup } from "./inviteStatus"
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

  it("classifies an invited row as 'ready' when an onboarding report matches by github_id", () => {
    const lookup = buildInviteStatusLookup(
      [],
      [],
      [],
      [
        {
          github_id: "583231",
          email: "octocat@example.com",
          github_username: "octocat",
        },
      ],
    )
    expect(lookup(student({ enrollment_status: "invited" })).status).toBe(
      "ready",
    )
  })

  it("surfaces the matched onboarding self-report on a 'ready' row", () => {
    const report = {
      github_id: "583231",
      email: "octocat@example.com",
      first_name: "Mona",
      last_name: "Lisa",
      github_username: "octocat",
    }
    const lookup = buildInviteStatusLookup([], [], [], [report])
    const result = lookup(student({ enrollment_status: "invited" }))
    expect(result.status).toBe("ready")
    expect(result.selfReport).toEqual(report)
  })

  it("classifies an email-invited row (no github_id) as 'ready' when a report matches by email", () => {
    const lookup = buildInviteStatusLookup(
      [],
      [],
      [],
      [
        {
          github_id: "999",
          email: "Octocat@Example.com",
          github_username: "octocat",
        },
      ],
    )
    const emailRow = student({
      username: "",
      github_id: "",
      enrollment_status: "invited",
    })
    expect(lookup(emailRow).status).toBe("ready")
  })

  it("stays 'onboarding' when no onboarding report matches the row", () => {
    const lookup = buildInviteStatusLookup(
      [],
      [],
      [],
      [
        {
          github_id: "111",
          email: "someone-else@example.com",
          github_username: "someone-else",
        },
      ],
    )
    const emailRow = student({
      username: "",
      github_id: "",
      enrollment_status: "invited",
    })
    expect(lookup(emailRow).status).toBe("onboarding")
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
