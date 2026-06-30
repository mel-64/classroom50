import { describe, expect, it, vi } from "vitest"

import { assertClassroomNotArchived } from "./classrooms"
import { GitHubAPIError, type GitHubRateLimit } from "@/hooks/github/errors"
import type { GitHubClient } from "@/hooks/github/client"

// assertClassroomNotArchived is the authoritative write-path guard fanned out
// across ~11 assignment + roster mutations, so its branch matrix is
// behaviour-critical: archived => throw, legacy/missing (404) => allow,
// transient read failure => fail-closed with an actionable message (after one
// retry). It does I/O via getClassroomJson -> client.requestRaw, so we stub a
// minimal GitHubClient rather than the whole module.

const emptyRateLimit: GitHubRateLimit = {
  limit: null,
  remaining: null,
  used: null,
  reset: null,
  resource: null,
  retryAfter: null,
}

const apiError = (status: number, rateLimit: Partial<GitHubRateLimit> = {}) =>
  new GitHubAPIError({
    status,
    url: "/repos/acme/classroom50/contents/cs101/classroom.json",
    message: `HTTP ${status}`,
    body: null,
    rateLimit: { ...emptyRateLimit, ...rateLimit },
  })

// A client whose requestRaw returns the given classroom.json body (as the
// serialized string getClassroomJson will JSON.parse).
const clientReturning = (body: unknown): GitHubClient => ({
  request: vi.fn(),
  requestRaw: vi.fn().mockResolvedValue(JSON.stringify(body)),
})

// A client whose requestRaw rejects on every call with the given error.
const clientRejecting = (err: unknown): GitHubClient => ({
  request: vi.fn(),
  requestRaw: vi.fn().mockRejectedValue(err),
})

describe("assertClassroomNotArchived", () => {
  it("throws when the classroom is archived (active: false)", async () => {
    const client = clientReturning({ short_name: "cs101", active: false })
    await expect(
      assertClassroomNotArchived(client, "acme", "cs101"),
    ).rejects.toThrow(/archived/i)
  })

  it("resolves when the classroom is active (active: true)", async () => {
    const client = clientReturning({ short_name: "cs101", active: true })
    await expect(
      assertClassroomNotArchived(client, "acme", "cs101"),
    ).resolves.toBeUndefined()
  })

  it("resolves for a legacy classroom with no active field", async () => {
    const client = clientReturning({ short_name: "cs101" })
    await expect(
      assertClassroomNotArchived(client, "acme", "cs101"),
    ).resolves.toBeUndefined()
  })

  it("fails OPEN on a 404 (missing/legacy classroom.json reads as active)", async () => {
    const client = clientRejecting(apiError(404))
    await expect(
      assertClassroomNotArchived(client, "acme", "cs101"),
    ).resolves.toBeUndefined()
    // A 404 is determinate, so it must not trigger the transient retry.
    expect(client.requestRaw).toHaveBeenCalledTimes(1)
  })

  it("fails CLOSED with an actionable message on a persistent 5xx (retried once)", async () => {
    const client = clientRejecting(apiError(503))
    await expect(
      assertClassroomNotArchived(client, "acme", "cs101"),
    ).rejects.toThrow(/couldn't verify/i)
    // One retry on a transient read => two attempts total.
    expect(client.requestRaw).toHaveBeenCalledTimes(2)
  })

  it("recovers when a transient 5xx succeeds on the retry", async () => {
    const requestRaw = vi
      .fn()
      .mockRejectedValueOnce(apiError(500))
      .mockResolvedValueOnce(
        JSON.stringify({ short_name: "cs101", active: true }),
      )
    const client: GitHubClient = { request: vi.fn(), requestRaw }
    await expect(
      assertClassroomNotArchived(client, "acme", "cs101"),
    ).resolves.toBeUndefined()
    expect(requestRaw).toHaveBeenCalledTimes(2)
  })

  it("treats a rate-limit (429) as transient and fails closed after the retry", async () => {
    const client = clientRejecting(apiError(429))
    await expect(
      assertClassroomNotArchived(client, "acme", "cs101"),
    ).rejects.toThrow(/couldn't verify/i)
    expect(client.requestRaw).toHaveBeenCalledTimes(2)
  })
})
