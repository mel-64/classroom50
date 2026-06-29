import { describe, expect, it, vi } from "vitest"
import {
  pagesAssignmentUrl,
  classroomsIndexUrl,
  listAllOrgMembers,
} from "./queries"
import type { GitHubClient } from "./client"
import type { GitHubUser } from "./types"

describe("pagesAssignmentUrl", () => {
  it("builds the plain classroom path when no secret is set", () => {
    expect(pagesAssignmentUrl("acme", "cs50")).toBe(
      "https://acme.github.io/classroom50/cs50/assignments.json",
    )
  })

  it("treats an empty/undefined secret as the plain path", () => {
    expect(pagesAssignmentUrl("acme", "cs50", "")).toBe(
      "https://acme.github.io/classroom50/cs50/assignments.json",
    )
    expect(pagesAssignmentUrl("acme", "cs50", undefined)).toBe(
      "https://acme.github.io/classroom50/cs50/assignments.json",
    )
  })

  it("inserts the capability-URL secret segment when present", () => {
    expect(pagesAssignmentUrl("acme", "cs50", "a1b2c3d4")).toBe(
      "https://acme.github.io/classroom50/cs50/a1b2c3d4/assignments.json",
    )
  })
})

describe("classroomsIndexUrl", () => {
  it("never carries a classroom or secret segment (public index)", () => {
    expect(classroomsIndexUrl("acme")).toBe(
      "https://acme.github.io/classroom50/classrooms-index.json",
    )
  })
})

describe("listAllOrgMembers (#76 — pages to completion)", () => {
  const member = (id: number): GitHubUser =>
    ({ id, login: `u${id}` }) as GitHubUser

  const makeClient = (pages: GitHubUser[][]) => {
    const requested: string[] = []
    const request = vi.fn().mockImplementation((path: string) => {
      requested.push(path)
      const match = path.match(/[?&]page=(\d+)/)
      const page = match ? Number(match[1]) : 1
      return Promise.resolve(pages[page - 1] ?? [])
    })
    const client = { request } as unknown as GitHubClient
    return { client, requested }
  }

  it("returns a single short page in one request", async () => {
    const { client, requested } = makeClient([[member(1), member(2)]])
    const all = await listAllOrgMembers(client, "acme")
    expect(all.map((m) => m.id)).toEqual([1, 2])
    expect(requested).toHaveLength(1)
  })

  it("pages until a short page, concatenating results", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => member(i + 1))
    const shortPage = [member(101)]
    const { client, requested } = makeClient([fullPage, shortPage])
    const all = await listAllOrgMembers(client, "acme")
    expect(all).toHaveLength(101)
    expect(requested).toHaveLength(2)
  })

  it("returns an empty array for an empty org in one request", async () => {
    const { client, requested } = makeClient([[]])
    const all = await listAllOrgMembers(client, "acme")
    expect(all).toEqual([])
    expect(requested).toHaveLength(1)
  })

  it("stops at the page cap if a server keeps returning full pages", async () => {
    // A misbehaving server that ignores `page` and always returns 100 items
    // must not loop unbounded; paginateAll caps at 100 pages.
    const request = vi
      .fn()
      .mockResolvedValue(Array.from({ length: 100 }, (_, i) => member(i + 1)))
    const client = { request } as unknown as GitHubClient
    const all = await listAllOrgMembers(client, "acme")
    expect(request).toHaveBeenCalledTimes(100)
    expect(all).toHaveLength(100 * 100)
  })
})
