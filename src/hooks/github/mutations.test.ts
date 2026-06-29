import { describe, expect, it, vi } from "vitest"

import {
  buildClassroomUpdate,
  editClassroom,
  ensurePages,
  ensureWorkflowPermissions,
} from "./mutations"
import { GitHubAPIError } from "./errors"
import type { GitHubClient } from "./client"

// classroom.json is a strict cross-binary contract (the Go gh-teacher CLI
// round-trips it with DisallowUnknownFields), so the edit merge must (a) only
// write fields the caller actually changed and (b) preserve everything else —
// including unknown/future fields a sibling binary wrote. Mirrors the
// present/absent discipline of util/yaml.test.ts.
describe("buildClassroomUpdate", () => {
  const base = {
    schema: "classroom50/classroom/v1",
    name: "Intro CS",
    short_name: "intro-cs",
    term: "Fall 2026",
    org: "acme",
  }

  it("writes a field only when provided; omits it otherwise", () => {
    expect(buildClassroomUpdate(base, { name: "Renamed" })).toEqual({
      ...base,
      name: "Renamed",
    })
    // A name-only edit leaves term untouched.
    const out = buildClassroomUpdate(base, { name: "Renamed" })
    expect(out.term).toBe("Fall 2026")
  })

  it("archive writes active:false; unarchive writes active:true (not delete)", () => {
    const archived = buildClassroomUpdate(base, { active: false })
    expect(archived.active).toBe(false)

    // Unarchiving an already-archived record overwrites false with true.
    const unarchived = buildClassroomUpdate(
      { ...base, active: false },
      { active: true },
    )
    expect(unarchived.active).toBe(true)
  })

  it("a pure archive toggle preserves the persisted name/term", () => {
    const out = buildClassroomUpdate(base, { active: false })
    expect(out.name).toBe("Intro CS")
    expect(out.term).toBe("Fall 2026")
    expect(out.active).toBe(false)
  })

  it("a name/term edit does NOT introduce an active key on a legacy record", () => {
    // Legacy classroom.json never wrote `active`; editing name/term must not
    // add it (absent = active).
    const out = buildClassroomUpdate(base, { name: "X", term: "Y" })
    expect("active" in out).toBe(false)
  })

  it("preserves unknown/future fields written by a sibling binary", () => {
    const withUnknown = {
      ...base,
      future_field: "from-newer-cli",
      nested: { a: 1 },
    }
    const out = buildClassroomUpdate(withUnknown, { active: false })
    expect(out.future_field).toBe("from-newer-cli")
    expect(out.nested).toEqual({ a: 1 })
  })

  it("omits every optional field when none are provided (identity merge)", () => {
    expect(buildClassroomUpdate(base, {})).toEqual(base)
  })

  it("writes onboarding_cleanup only when provided", () => {
    expect(buildClassroomUpdate(base, { onboarding_cleanup: "keep" })).toEqual({
      ...base,
      onboarding_cleanup: "keep",
    })
    expect("onboarding_cleanup" in buildClassroomUpdate(base, {})).toBe(false)
  })
})

// editClassroom enforces "archived classrooms are read-only" on the write path
// — the authoritative guard, not just UI gating. The gate must (a) refuse a
// settings edit (name/term/onboarding_cleanup) on an archived classroom even
// when a crafted payload bundles `active: false` to re-assert the archived
// state, and (b) let a genuine unarchive (active: true) through. editClassroom
// does I/O via getBranchRef/getCommit/getClassroomJson/createBlob/
// createTreeFromEntries/createCommit/updateRef, all on the GitHubClient, so we
// stub a path-routing fake client.
describe("editClassroom archived read-only guard", () => {
  // A fake client routing each git/contents path to a canned response. The
  // archived classroom.json is returned by the contents endpoint; if the guard
  // is bypassed, createBlob's POST to git/blobs fires (which we assert against).
  const makeClient = (archivedRecord: Record<string, unknown>) => {
    const blobPost = vi.fn()
    const requestRaw = vi.fn().mockImplementation((path: string) => {
      if (path.includes("/contents/")) {
        return Promise.resolve(JSON.stringify(archivedRecord))
      }
      return Promise.reject(new Error(`unexpected requestRaw: ${path}`))
    })
    const request = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith("/git/ref/heads/main")) {
        return Promise.resolve({ object: { sha: "base-sha" } })
      }
      if (path.includes("/git/commits/")) {
        return Promise.resolve({ tree: { sha: "base-tree-sha" } })
      }
      if (path.endsWith("/git/blobs")) {
        blobPost()
        return Promise.resolve({ sha: "blob-sha" })
      }
      if (path.endsWith("/git/trees")) {
        return Promise.resolve({ sha: "tree-sha" })
      }
      if (path.endsWith("/git/commits")) {
        return Promise.resolve({ sha: "new-commit-sha" })
      }
      if (path.endsWith("/git/refs/heads/main")) {
        return Promise.resolve({})
      }
      return Promise.reject(new Error(`unexpected request: ${path}`))
    })
    const client = { request, requestRaw } as unknown as GitHubClient
    return { client, blobPost }
  }

  const archived = {
    short_name: "cs101",
    name: "CS 101",
    term: "Fall",
    active: false,
  }

  it("refuses a name/term edit on an archived classroom (no active sent)", async () => {
    const { client, blobPost } = makeClient(archived)
    await expect(
      editClassroom(client, { org: "acme", slug: "cs101", name: "Renamed" }),
    ).rejects.toThrow(/read-only/i)
    // Fail-closed BEFORE any write — no blob was created.
    expect(blobPost).not.toHaveBeenCalled()
  })

  it("refuses a settings edit even when active:false is bundled in (bypass closed)", async () => {
    const { client, blobPost } = makeClient(archived)
    await expect(
      editClassroom(client, {
        org: "acme",
        slug: "cs101",
        name: "Renamed",
        active: false,
      }),
    ).rejects.toThrow(/read-only/i)
    expect(blobPost).not.toHaveBeenCalled()
  })

  it("allows a pure unarchive (active:true) on an archived classroom", async () => {
    const { client, blobPost } = makeClient(archived)
    await expect(
      editClassroom(client, { org: "acme", slug: "cs101", active: true }),
    ).resolves.toMatchObject({ newCommitSha: "new-commit-sha" })
    // Unarchive proceeds to write.
    expect(blobPost).toHaveBeenCalledTimes(1)
  })

  it("allows an unarchive bundled with a settings edit (active:true + name)", async () => {
    const { client, blobPost } = makeClient(archived)
    await expect(
      editClassroom(client, {
        org: "acme",
        slug: "cs101",
        active: true,
        name: "Reopened",
      }),
    ).resolves.toMatchObject({ newCommitSha: "new-commit-sha" })
    expect(blobPost).toHaveBeenCalledTimes(1)
  })

  it("allows a normal edit on an active classroom", async () => {
    const { client, blobPost } = makeClient({
      short_name: "cs101",
      name: "CS 101",
      term: "Fall",
      active: true,
    })
    await expect(
      editClassroom(client, { org: "acme", slug: "cs101", name: "Renamed" }),
    ).resolves.toMatchObject({ newCommitSha: "new-commit-sha" })
    expect(blobPost).toHaveBeenCalledTimes(1)
  })
})

// ensurePages (the re-run/init write path) must agree with checkPages (the
// audit read path) on the same org — they decide status from the same live
// read-back, so a re-run can't warn about a Pages site the audit shows green.
describe("ensurePages alignment with checkPages", () => {
  const notFound = () =>
    new GitHubAPIError({
      status: 404,
      url: "x",
      message: "Not Found",
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

  const conflict = () =>
    new GitHubAPIError({
      status: 409,
      url: "x",
      message: "Conflict",
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

  // pagesLive is what GET /pages returns after the writes (the source of truth).
  function makeClient(opts: {
    enablePost?: () => Promise<unknown>
    visibilityPut?: () => Promise<unknown>
    pagesLive: unknown | GitHubAPIError
  }): GitHubClient {
    return {
      request: <T>(path: string, options?: { method?: string }) => {
        const method = options?.method ?? "GET"
        if (path.endsWith("/pages") && method === "POST") {
          return (opts.enablePost?.() ?? Promise.resolve({})) as Promise<T>
        }
        if (path.endsWith("/pages") && method === "PUT") {
          return (opts.visibilityPut?.() ?? Promise.resolve({})) as Promise<T>
        }
        if (path.endsWith("/pages") && method === "GET") {
          if (opts.pagesLive instanceof GitHubAPIError) {
            return Promise.reject(opts.pagesLive) as Promise<T>
          }
          return Promise.resolve(opts.pagesLive) as Promise<T>
        }
        return Promise.reject(
          new Error(`unexpected: ${method} ${path}`),
        ) as Promise<T>
      },
      requestRaw: () => Promise.reject(new Error("unexpected requestRaw")),
    }
  }

  it("reports complete when the site is already public, even if the visibility PUT 422s", async () => {
    const client = makeClient({
      enablePost: () => Promise.reject(conflict()), // already enabled
      visibilityPut: () => Promise.reject(notFound()), // re-run PUT rejected
      pagesLive: { build_type: "workflow", public: true }, // but live is correct
    })
    const result = await ensurePages(client, "acme", "classroom50")
    expect(result.status).toBe("complete")
    expect(result.message).toMatch(/public/i)
  })

  it("warns with an explanatory message when the site is genuinely not public", async () => {
    const client = makeClient({
      visibilityPut: () => Promise.reject(notFound()),
      pagesLive: { build_type: "workflow", public: false },
    })
    const result = await ensurePages(client, "acme", "classroom50")
    expect(result.status).toBe("warning")
    expect(result.message.length).toBeGreaterThan(0)
  })
})

// A 409 on the repo workflow-permissions PUT means write is disabled by an
// org/enterprise policy — benign (skeleton workflows declare their own
// permissions), so ensureWorkflowPermissions must report a managed-by-policy
// warning, never throw a hard error.
describe("ensureWorkflowPermissions org-policy conflict", () => {
  function conflict() {
    return new GitHubAPIError({
      status: 409,
      url: "x",
      message:
        "Write permissions for workflows are disabled by the organization",
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

  function makeClient(repoReadback: { default_workflow_permissions: string }) {
    const client: GitHubClient = {
      request: <T>(path: string, options?: { method?: string }) => {
        const method = options?.method ?? "GET"
        if (path.endsWith("/actions/permissions/workflow")) {
          if (method === "PUT") return Promise.reject(conflict()) as Promise<T>
          return Promise.resolve(repoReadback) as Promise<T>
        }
        return Promise.reject(
          new Error(`unexpected: ${method} ${path}`),
        ) as Promise<T>
      },
      requestRaw: () => Promise.reject(new Error("unexpected requestRaw")),
    }
    return client
  }

  it("returns a managed-by-policy complete (not a warning or throw) on a 409", async () => {
    const client = makeClient({ default_workflow_permissions: "read" })
    const result = await ensureWorkflowPermissions(
      client,
      "acme",
      "classroom50",
    )
    // Org-managed read is acceptable and shown green, matching the audit — no
    // warning badge for a state the preflight checklist reports as OK.
    expect(result.status).toBe("complete")
    expect(result.managedByOrgPolicy).toBe(true)
    expect(result.message.length).toBeGreaterThan(0)
  })
})
