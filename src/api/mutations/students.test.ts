import { describe, expect, it, vi } from "vitest"
import Papa from "papaparse"

import {
  enrollStudentInClassroom,
  markStudentEnrolledWithConflictRetry,
} from "./students"
import type { GitHubClient } from "@/hooks/github/client"

// These exercise the #65 fix: an already-org-member student must land directly
// as `enrolled` (not stuck "invited"/awaiting), and the per-row "mark enrolled"
// path must (a) refuse a non-member and (b) write the canonical enrolled shape.
//
// Both functions do I/O via the GitHubClient, so we stub a path-routing fake
// client (same approach as classrooms.test.ts) and assert on the students.csv
// content committed to git/trees.

type CommittedCsv = { content: string | null }

// Build a fake client that serves a starting students.csv and captures the CSV
// written to the git tree. `membershipState` is what GET memberships returns.
const makeClient = (opts: {
  startingCsv: string
  membershipState?: "active" | "pending" | null
  user?: {
    login: string
    id: number
    name?: string | null
    email?: string | null
  }
}) => {
  const committed: CommittedCsv = { content: null }
  const membershipState = opts.membershipState ?? null

  const requestRaw = vi.fn().mockImplementation((path: string) => {
    if (path.includes("/contents/") && path.includes("classroom.json")) {
      // getClassroomJson (resolveClassroomTeam) reads raw JSON; no team -> default slug.
      return Promise.resolve(JSON.stringify({ short_name: "cs101" }))
    }
    return Promise.reject(new Error(`unexpected requestRaw: ${path}`))
  })

  // getRawFile returns a base64 GitHub contents file object via client.request.
  const csvFile = () => ({
    type: "file" as const,
    encoding: "base64" as const,
    content: Buffer.from(
      committed.content ?? opts.startingCsv,
      "utf-8",
    ).toString("base64"),
  })

  const request = vi
    .fn()
    .mockImplementation((path: string, options?: { body?: unknown }) => {
      if (path.includes("/contents/") && path.includes("students.csv")) {
        return Promise.resolve(csvFile())
      }
      if (path.startsWith("/users/")) {
        const u = opts.user ?? { login: "alice", id: 42 }
        return Promise.resolve({ name: null, email: null, ...u })
      }
      if (path.includes("/memberships/") && !path.includes("/teams/")) {
        if (membershipState === null) {
          return Promise.reject(new Error("404 not a member"))
        }
        return Promise.resolve({ state: membershipState })
      }
      if (path.includes("/git/ref/heads/main") || path.includes("/git/ref/")) {
        return Promise.resolve({ object: { sha: "base-sha" } })
      }
      if (path.includes("/git/commits/")) {
        return Promise.resolve({ tree: { sha: "base-tree-sha" } })
      }
      if (path.endsWith("/git/trees")) {
        const tree = (
          options?.body as { tree?: { path: string; content?: string }[] }
        )?.tree
        const csvEntry = tree?.find((t) => t.path.includes("students.csv"))
        if (csvEntry?.content) committed.content = csvEntry.content
        return Promise.resolve({ sha: "tree-sha" })
      }
      if (path.endsWith("/git/commits")) {
        return Promise.resolve({ sha: "new-commit-sha" })
      }
      if (path.endsWith("/git/refs/heads/main")) {
        return Promise.resolve({})
      }
      if (path.includes("/invitations")) {
        return Promise.resolve({})
      }
      if (path.includes("/teams/")) {
        return Promise.resolve({ state: "active" })
      }
      return Promise.reject(new Error(`unexpected request: ${path}`))
    })

  const client = { request, requestRaw } as unknown as GitHubClient
  return { client, committed }
}

const HEADER =
  "username,first_name,last_name,email,section,github_id,enrollment_status,enrollment_method,email_hash,invite_token,invited_at,enrolled_at\n"

const rowsFromCsv = (csv: string) =>
  Papa.parse(csv, { header: true, skipEmptyLines: true }).data as Record<
    string,
    string
  >[]

describe("enrollStudentInClassroom — already-member writes enrolled directly (#65)", () => {
  it("writes enrollment_status 'enrolled' + enrolled_at when the user is already an active org member", async () => {
    const { client, committed } = makeClient({
      startingCsv: HEADER,
      membershipState: "active",
      user: { login: "alice", id: 42 },
    })

    await enrollStudentInClassroom(client, {
      org: "acme",
      classroom: "cs101",
      username: "alice",
    })

    const rows = rowsFromCsv(committed.content!)
    const alice = rows.find((r) => r.username === "alice")
    expect(alice?.enrollment_status).toBe("enrolled")
    expect(alice?.enrolled_at).toBeTruthy()
  })

  it("writes 'invited' (not enrolled) when the user is not yet a member", async () => {
    const { client, committed } = makeClient({
      startingCsv: HEADER,
      membershipState: null,
      user: { login: "bob", id: 43 },
    })

    await enrollStudentInClassroom(client, {
      org: "acme",
      classroom: "cs101",
      username: "bob",
    })

    const rows = rowsFromCsv(committed.content!)
    const bob = rows.find((r) => r.username === "bob")
    expect(bob?.enrollment_status).toBe("invited")
    expect(bob?.enrolled_at).toBeFalsy()
  })
})

describe("markStudentEnrolledWithConflictRetry — member-guarded manual confirm (#65)", () => {
  const invitedRow =
    "alice,Alice,A,alice@x.edu,,42,invited,github,,tok-1,2026-01-01T00:00:00Z,\n"

  it("refuses to mark a non-member enrolled (guard throws, no write)", async () => {
    const { client, committed } = makeClient({
      startingCsv: HEADER + invitedRow,
      membershipState: null, // not a member
    })

    await expect(
      markStudentEnrolledWithConflictRetry(client, {
        org: "acme",
        classroom: "cs101",
        username: "alice",
        github_id: "42",
      }),
    ).rejects.toThrow(/not an active member/i)

    // No students.csv write happened.
    expect(committed.content).toBeNull()
  })

  it("writes enrolled + enrolled_at for a verified active member", async () => {
    const { client, committed } = makeClient({
      startingCsv: HEADER + invitedRow,
      membershipState: "active",
    })

    const result = await markStudentEnrolledWithConflictRetry(client, {
      org: "acme",
      classroom: "cs101",
      username: "alice",
      github_id: "42",
    })

    expect(result.alreadyEnrolled).toBe(false)
    const rows = rowsFromCsv(committed.content!)
    const alice = rows.find((r) => r.username === "alice")
    expect(alice?.enrollment_status).toBe("enrolled")
    expect(alice?.enrolled_at).toBeTruthy()
    // Preserved fields.
    expect(alice?.email).toBe("alice@x.edu")
    expect(alice?.github_id).toBe("42")
  })

  it("throws when the row does not exist", async () => {
    const { client } = makeClient({
      startingCsv: HEADER,
      membershipState: "active",
    })

    await expect(
      markStudentEnrolledWithConflictRetry(client, {
        org: "acme",
        classroom: "cs101",
        username: "ghost",
        github_id: "999",
      }),
    ).rejects.toThrow(/does not exist in roster/i)
  })
})
