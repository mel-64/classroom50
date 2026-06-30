import { describe, expect, it, vi } from "vitest"

import {
  buildClassroomUpdate,
  editClassroom,
  ensurePages,
  ensureWorkflowPermissions,
  triggerRegrade,
  validateServiceToken,
  REGRADE_WORKFLOW,
} from "./mutations"
import { GitHubAPIError } from "./errors"
import { createGitHubClient } from "./client"

// validateServiceToken builds its own client from the pasted token via
// createGitHubClient; mock the module so the test can drive that client's
// `request` to simulate GitHub's repo-permissions read.
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>()
  return { ...actual, createGitHubClient: vi.fn() }
})
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

// triggerRegrade dispatches regrade.yaml in <org>/classroom50, snapshotting the
// newest dispatch run id first so the caller can bind to its own run. We assert
// the dispatch payload shape (the cross-binary input contract with the CLI's
// regrade.yaml) and the sinceRunId snapshot behavior.
describe("triggerRegrade", () => {
  type Call = { path: string; init?: { method?: string; body?: unknown } }

  const makeClient = (opts: { baselineRunId: number | null }) => {
    const calls: Call[] = []
    const request = vi
      .fn()
      .mockImplementation((path: string, init?: unknown) => {
        calls.push({ path, init: init as Call["init"] })
        // getRepo: GET /repos/{org}/classroom50
        if (/^\/repos\/[^/]+\/classroom50$/.test(path)) {
          return Promise.resolve({ default_branch: "trunk" })
        }
        // baseline newest dispatch run
        if (path.includes(`/workflows/${REGRADE_WORKFLOW}/runs`)) {
          return Promise.resolve({
            workflow_runs:
              opts.baselineRunId === null ? [] : [{ id: opts.baselineRunId }],
          })
        }
        // the dispatch POST
        if (path.includes(`/workflows/${REGRADE_WORKFLOW}/dispatches`)) {
          return Promise.resolve(undefined)
        }
        return Promise.reject(new Error(`unexpected request: ${path}`))
      })
    const client = { request } as unknown as GitHubClient
    return { client, calls }
  }

  const findDispatch = (calls: Call[]) =>
    calls.find((c) => c.path.includes("/dispatches"))

  it("dispatches with classroom + assignment and snapshots the baseline run id", async () => {
    const { client, calls } = makeClient({ baselineRunId: 42 })
    const result = await triggerRegrade(client, {
      org: "acme",
      classroom: "cs101",
      assignment: "hello",
    })

    expect(result.sinceRunId).toBe(42)
    const dispatch = findDispatch(calls)
    expect(dispatch).toBeDefined()
    expect(dispatch?.init?.method).toBe("POST")
    expect(dispatch?.init?.body).toEqual({
      // default_branch from getRepo is used as the dispatch ref.
      ref: "trunk",
      inputs: { classroom: "cs101", assignment: "hello" },
    })
  })

  it("includes the owner input only when scoping to a single student", async () => {
    const { client, calls } = makeClient({ baselineRunId: null })
    const result = await triggerRegrade(client, {
      org: "acme",
      classroom: "cs101",
      assignment: "hello",
      owner: "alice",
    })

    // No prior dispatch runs -> null baseline.
    expect(result.sinceRunId).toBeNull()
    const dispatch = findDispatch(calls)
    expect(dispatch?.init?.body).toEqual({
      ref: "trunk",
      inputs: { classroom: "cs101", assignment: "hello", owner: "alice" },
    })
  })

  it("requires org, classroom, and assignment", async () => {
    const { client } = makeClient({ baselineRunId: null })
    await expect(
      triggerRegrade(client, {
        org: undefined,
        classroom: "cs101",
        assignment: "hello",
      }),
    ).rejects.toThrow(/org/)
    await expect(
      triggerRegrade(client, {
        org: "acme",
        classroom: undefined,
        assignment: "hello",
      }),
    ).rejects.toThrow(/classroom/)
    await expect(
      triggerRegrade(client, {
        org: "acme",
        classroom: "cs101",
        assignment: undefined,
      }),
    ).rejects.toThrow(/assignment/)
  })
})

// validateServiceToken now asserts the token can WRITE the classroom50 repo
// (permissions.push) — regrade needs write, not just the read collect needs.
// It reads GET /repos/{org}/classroom50 as the pasted token (via a mocked
// createGitHubClient) and rejects a read-only token with an actionable hint.
describe("validateServiceToken", () => {
  const mockTokenClient = (impl: (path: string) => Promise<unknown>) => {
    const request = vi.fn().mockImplementation(impl)
    vi.mocked(createGitHubClient).mockReturnValue({
      request,
    } as unknown as ReturnType<typeof createGitHubClient>)
    return request
  }

  const rateLimit = {
    limit: null,
    remaining: null,
    used: null,
    reset: null,
    resource: null,
    retryAfter: null,
  }
  const apiError = (status: number) =>
    new GitHubAPIError({
      status,
      url: "/repos/acme/classroom50",
      message: `http ${status}`,
      body: {},
      rateLimit,
    })

  it("accepts a token with write access (permissions.push true)", async () => {
    mockTokenClient((path) => {
      expect(path).toBe("/repos/acme/classroom50")
      return Promise.resolve({ permissions: { push: true } })
    })
    await expect(
      validateServiceToken("github_pat_x", "acme"),
    ).resolves.toBeUndefined()
  })

  it("rejects a read-only token (permissions.push false) with a write hint", async () => {
    mockTokenClient(() => Promise.resolve({ permissions: { push: false } }))
    await expect(validateServiceToken("github_pat_x", "acme")).rejects.toThrow(
      /lacks write access|Read and write/,
    )
  })

  it("maps a 403 to the actionable scope hint", async () => {
    mockTokenClient(() => Promise.reject(apiError(403)))
    await expect(validateServiceToken("github_pat_x", "acme")).rejects.toThrow(
      /Read and write/,
    )
  })

  it("maps a 401 to invalid/expired/revoked", async () => {
    mockTokenClient(() => Promise.reject(apiError(401)))
    await expect(validateServiceToken("github_pat_x", "acme")).rejects.toThrow(
      /invalid, expired, or revoked/,
    )
  })

  it("requires an org and a non-empty token", async () => {
    await expect(validateServiceToken("tok", undefined)).rejects.toThrow(/org/)
    await expect(validateServiceToken("   ", "acme")).rejects.toThrow(
      /Enter a token/,
    )
  })
})
