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
})
