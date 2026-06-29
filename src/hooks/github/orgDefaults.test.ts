import { describe, expect, it, vi } from "vitest"

import { repairOrgDefaults } from "./orgChecks"
import { GitHubAPIError } from "./errors"
import type { GitHubClient } from "./client"
import { memberDefaultSettings } from "@/orgPolicy/desiredState"

// repairOrgDefaults mirrors the CLI's applyOrgMemberDefaults: a combined PATCH,
// a per-field 403/422 fallback, a secondary-rate-limit abort, and an
// authoritative read-back via classifyDefaults. The fake client records the
// PATCH bodies and serves a configurable org read-back.

function rateLimited(): GitHubAPIError {
  return new GitHubAPIError({
    status: 403,
    url: "x",
    message: "secondary rate limit",
    body: null,
    rateLimit: {
      limit: 60,
      remaining: 0,
      used: 60,
      reset: null,
      resource: null,
      retryAfter: 60,
    },
  })
}

function httpError(status: number): GitHubAPIError {
  return new GitHubAPIError({
    status,
    url: "x",
    message: `status ${status}`,
    body: null,
    rateLimit: {
      limit: null,
      remaining: null,
      used: null,
      reset: null,
      resource: null,
      retryAfter: null,
    },
  })
}

type ClientOpts = {
  // What the combined PATCH should do: resolve, or reject with an error.
  combinedPatch?: () => Promise<unknown>
  // Per-field PATCH behavior keyed by field, defaulting to resolve.
  perField?: Record<string, () => Promise<unknown>>
  // The org read-back the GET returns.
  readback: Record<string, unknown>
}

function makeClient(opts: ClientOpts) {
  const patchBodies: Array<Record<string, unknown>> = []
  let patchCount = 0

  const request = vi
    .fn()
    .mockImplementation((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
      if (path === "/orgs/acme" && (!options || options.method === "GET" || !options.method)) {
        return Promise.resolve(opts.readback)
      }
      if (path === "/orgs/acme" && options?.method === "PATCH") {
        patchCount += 1
        const body = options.body ?? {}
        patchBodies.push(body)
        const keys = Object.keys(body)
        // A single-key body is a per-field PATCH; multi-key is the combined one.
        if (keys.length === 1) {
          const handler = opts.perField?.[keys[0]]
          return handler ? handler() : Promise.resolve({})
        }
        return opts.combinedPatch ? opts.combinedPatch() : Promise.resolve({})
      }
      return Promise.reject(new Error(`unexpected: ${path}`))
    })

  const client: GitHubClient = {
    request: request as unknown as GitHubClient["request"],
    requestRaw: () => Promise.reject(new Error("unexpected requestRaw")),
  }
  return { client, patchBodies, getPatchCount: () => patchCount }
}

function enforced(plan: string | undefined): Record<string, unknown> {
  const live: Record<string, unknown> = {}
  for (const s of memberDefaultSettings(plan)) live[s.field] = s.value
  return live
}

describe("repairOrgDefaults", () => {
  it("applies a single combined PATCH and reports complete when read-back is clean", async () => {
    const { client, patchBodies } = makeClient({ readback: enforced("team") })
    const result = await repairOrgDefaults(client, "acme", "team")
    expect(result.ok).toBe(true)
    expect(result.transient).toBe(false)
    expect(result.unenforced).toHaveLength(0)
    // One combined PATCH, no per-field.
    expect(patchBodies).toHaveLength(1)
    expect(Object.keys(patchBodies[0]).length).toBe(12)
  })

  it("sends only 12 fields on a team plan", async () => {
    const { client, patchBodies } = makeClient({ readback: enforced("team") })
    await repairOrgDefaults(client, "acme", "team")
    expect(Object.keys(patchBodies[0])).not.toContain(
      "members_can_create_public_repositories",
    )
  })

  it("falls back per-field on a 422 and classifies residual state", async () => {
    const live = enforced("team")
    // A critical field stays drifted after the fallback (silently rejected).
    live.members_can_delete_repositories = true
    const { client, getPatchCount } = makeClient({
      combinedPatch: () => Promise.reject(httpError(422)),
      perField: {
        members_can_delete_repositories: () => Promise.reject(httpError(422)),
      },
      readback: live,
    })
    const result = await repairOrgDefaults(client, "acme", "team")
    // 1 combined + 12 per-field attempts.
    expect(getPatchCount()).toBe(13)
    expect(result.ok).toBe(false)
    expect(result.unenforced.map((s) => s.field)).toContain(
      "members_can_delete_repositories",
    )
  })

  it("reports criticalMissed when read-back shows a silently-ignored field (200 PATCH)", async () => {
    const live = enforced("team")
    live.members_can_change_repo_visibility = true // silently not applied
    const { client } = makeClient({ readback: live })
    const result = await repairOrgDefaults(client, "acme", "team")
    expect(result.ok).toBe(false)
    expect(result.unenforced.map((s) => s.field)).toContain(
      "members_can_change_repo_visibility",
    )
  })

  it("aborts as transient on a secondary-rate-limit without falling back per-field", async () => {
    const { client, getPatchCount } = makeClient({
      combinedPatch: () => Promise.reject(rateLimited()),
      readback: enforced("team"),
    })
    const result = await repairOrgDefaults(client, "acme", "team")
    expect(result.transient).toBe(true)
    expect(result.ok).toBe(false)
    // Only the one combined PATCH was attempted (no per-field amplification).
    expect(getPatchCount()).toBe(1)
  })

  it("does not manufacture a checklist when the read-back fails", async () => {
    const client: GitHubClient = {
      request: vi.fn().mockImplementation((_path: string, options?: { method?: string }) => {
        if (options?.method === "PATCH") return Promise.resolve({})
        return Promise.reject(httpError(500)) // read-back fails
      }) as unknown as GitHubClient["request"],
      requestRaw: () => Promise.reject(new Error("x")),
    }
    const result = await repairOrgDefaults(client, "acme", "team")
    expect(result.ok).toBe(true)
    expect(result.unenforced).toHaveLength(0)
  })
})
