import { describe, expect, it, vi } from "vitest"

import {
  TeardownMarkerError,
  TeardownRateLimitError,
  TeardownScopeError,
  executeTeardown,
  planTeardown,
} from "./teardown"
import { GitHubAPIError } from "@/hooks/github/errors"
import type { GitHubClient } from "@/hooks/github/client"

// Teardown mirrors the CLI: marker-gated (refuse orgs without classroom50),
// delete ALL org repos, marker deleted last (re-runnable), 403 = scope wall.
// The fake client serves the marker probe + repo list and records DELETEs.

function notFound(): GitHubAPIError {
  return new GitHubAPIError({
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
}

function forbidden(): GitHubAPIError {
  return new GitHubAPIError({
    status: 403,
    url: "x",
    message: "Forbidden",
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

// A secondary-rate-limit 403: same status as the scope wall, but carries
// rate-limit signal (retryAfter / remaining:0) so isRateLimited is true.
function rateLimited403(): GitHubAPIError {
  return new GitHubAPIError({
    status: 403,
    url: "x",
    message: "Forbidden (secondary rate limit)",
    body: null,
    rateLimit: {
      limit: null,
      remaining: 0,
      used: null,
      reset: null,
      resource: null,
      retryAfter: 0,
    },
  })
}

function serverError(): GitHubAPIError {
  return new GitHubAPIError({
    status: 500,
    url: "x",
    message: "Server Error",
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

type Opts = {
  markerExists: boolean
  repos: string[]
  deleteForbidden?: boolean
  // Repos that fail every DELETE with the given error kind.
  failRepos?: Record<string, "rate-limit" | "scope" | "server">
}

function makeClient(opts: Opts) {
  const deletes: string[] = []
  const request = vi
    .fn()
    .mockImplementation((path: string, options?: { method?: string }) => {
      const method = options?.method ?? "GET"
      // Marker probe / single-repo GET.
      if (method === "GET" && /\/repos\/[^/]+\/classroom50$/.test(path)) {
        return opts.markerExists
          ? Promise.resolve({ name: "classroom50" })
          : Promise.reject(notFound())
      }
      // Org repo list (paginated).
      if (
        method === "GET" &&
        path.includes("/orgs/") &&
        path.includes("/repos")
      ) {
        return Promise.resolve(opts.repos.map((name) => ({ name })))
      }
      // Repo delete.
      if (method === "DELETE") {
        if (opts.deleteForbidden) return Promise.reject(forbidden())
        const repo = path.split("/").pop() ?? ""
        const kind = opts.failRepos?.[repo]
        if (kind === "rate-limit") return Promise.reject(rateLimited403())
        if (kind === "scope") return Promise.reject(forbidden())
        if (kind === "server") return Promise.reject(serverError())
        deletes.push(repo)
        return Promise.resolve(undefined)
      }
      return Promise.reject(new Error(`unexpected: ${method} ${path}`))
    })

  const client: GitHubClient = {
    request: request as unknown as GitHubClient["request"],
    requestRaw: () => Promise.reject(new Error("unexpected requestRaw")),
  }
  return { client, deletes }
}

describe("planTeardown", () => {
  it("refuses an org without the classroom50 marker repo", async () => {
    const { client } = makeClient({ markerExists: false, repos: [] })
    await expect(planTeardown(client, "acme")).rejects.toBeInstanceOf(
      TeardownMarkerError,
    )
  })

  it("orders the marker repo last in the plan", async () => {
    const { client } = makeClient({
      markerExists: true,
      repos: ["classroom50", "cs101-hw1-alice", "cs101-hw1-bob"],
    })
    const plan = await planTeardown(client, "acme")
    expect(plan.repoNames[plan.repoNames.length - 1]).toBe("classroom50")
    expect(plan.repoNames).toHaveLength(3)
  })
})

describe("executeTeardown", () => {
  it("deletes all repos with the marker last", async () => {
    const { client, deletes } = makeClient({
      markerExists: true,
      repos: ["classroom50", "cs101-hw1-alice", "cs101-hw1-bob"],
    })
    const plan = await planTeardown(client, "acme")
    const result = await executeTeardown(client, plan)
    expect(result.deleted).toHaveLength(3)
    expect(result.failed).toHaveLength(0)
    // Marker deleted last.
    expect(deletes[deletes.length - 1]).toBe("classroom50")
  })

  it("surfaces the delete_repo scope wall on a 403", async () => {
    const { client } = makeClient({
      markerExists: true,
      repos: ["classroom50", "cs101-hw1-alice"],
      deleteForbidden: true,
    })
    const plan = await planTeardown(client, "acme")
    await expect(executeTeardown(client, plan)).rejects.toBeInstanceOf(
      TeardownScopeError,
    )
  })

  it("does not throw scope error when there is nothing but the marker", async () => {
    const { client, deletes } = makeClient({
      markerExists: true,
      repos: ["classroom50"],
    })
    const plan = await planTeardown(client, "acme")
    const result = await executeTeardown(client, plan)
    expect(result.deleted).toEqual(["classroom50"])
    expect(deletes).toEqual(["classroom50"])
  })

  it("treats a secondary-rate-limit 403 as retryable, not the scope wall", async () => {
    // A repo that always rate-limits (403 + retryAfter) exhausts retries; it
    // must surface as TeardownRateLimitError, never TeardownScopeError.
    const { client } = makeClient({
      markerExists: true,
      repos: ["classroom50", "cs101-hw1-alice"],
      failRepos: { "cs101-hw1-alice": "rate-limit" },
    })
    const plan = await planTeardown(client, "acme")
    await expect(executeTeardown(client, plan)).rejects.toBeInstanceOf(
      TeardownRateLimitError,
    )
  })

  it("preserves the marker when a non-marker delete fails (re-runnable)", async () => {
    // A non-marker repo fails with a non-403 (500). The marker must NOT be
    // deleted, so a re-run still passes the marker gate.
    const { client, deletes } = makeClient({
      markerExists: true,
      repos: ["classroom50", "cs101-hw1-alice", "cs101-hw1-bob"],
      failRepos: { "cs101-hw1-alice": "server" },
    })
    const plan = await planTeardown(client, "acme")
    const result = await executeTeardown(client, plan)
    expect(result.failed).toContain("cs101-hw1-alice")
    // Marker was preserved (never deleted) because a non-marker delete failed.
    expect(deletes).not.toContain("classroom50")
    expect(result.deleted).not.toContain("classroom50")
  })

  it("re-enumerates at execution so a repo created after planning is still deleted", async () => {
    // The plan is captured when the modal opens; a repo can be created during
    // the type-to-confirm pause. executeTeardown must re-list, not trust it.
    const deletes: string[] = []
    let listCalls = 0
    const request = vi
      .fn()
      .mockImplementation((path: string, options?: { method?: string }) => {
        const method = options?.method ?? "GET"
        if (method === "GET" && /\/repos\/[^/]+\/classroom50$/.test(path)) {
          return Promise.resolve({ name: "classroom50" })
        }
        if (
          method === "GET" &&
          path.includes("/orgs/") &&
          path.includes("/repos")
        ) {
          listCalls++
          // planTeardown sees one repo; by execution a second has appeared.
          const repos =
            listCalls === 1
              ? ["classroom50", "cs101-hw1-alice"]
              : ["classroom50", "cs101-hw1-alice", "cs101-hw1-late"]
          return Promise.resolve(repos.map((name) => ({ name })))
        }
        if (method === "DELETE") {
          deletes.push(path.split("/").pop() ?? "")
          return Promise.resolve(undefined)
        }
        return Promise.reject(new Error(`unexpected: ${method} ${path}`))
      })
    const client: GitHubClient = {
      request: request as unknown as GitHubClient["request"],
      requestRaw: () => Promise.reject(new Error("unexpected requestRaw")),
    }
    const plan = await planTeardown(client, "acme")
    expect(plan.repoNames).not.toContain("cs101-hw1-late")
    const result = await executeTeardown(client, plan)
    // The repo created after planning is deleted, and the marker is still last.
    expect(result.deleted).toEqual(
      expect.arrayContaining([
        "cs101-hw1-alice",
        "cs101-hw1-late",
        "classroom50",
      ]),
    )
    expect(deletes[deletes.length - 1]).toBe("classroom50")
  })

  it("retries a transient delete failure and recovers", async () => {
    // First DELETE on the repo fails transiently (500), the retry succeeds.
    let aliceAttempts = 0
    const deletes: string[] = []
    const request = vi
      .fn()
      .mockImplementation((path: string, options?: { method?: string }) => {
        const method = options?.method ?? "GET"
        if (method === "GET" && /\/repos\/[^/]+\/classroom50$/.test(path)) {
          return Promise.resolve({ name: "classroom50" })
        }
        if (
          method === "GET" &&
          path.includes("/orgs/") &&
          path.includes("/repos")
        ) {
          return Promise.resolve(
            ["classroom50", "cs101-hw1-alice"].map((name) => ({ name })),
          )
        }
        if (method === "DELETE") {
          const repo = path.split("/").pop() ?? ""
          if (repo === "cs101-hw1-alice" && aliceAttempts === 0) {
            aliceAttempts++
            return Promise.reject(serverError())
          }
          deletes.push(repo)
          return Promise.resolve(undefined)
        }
        return Promise.reject(new Error(`unexpected: ${method} ${path}`))
      })
    const client: GitHubClient = {
      request: request as unknown as GitHubClient["request"],
      requestRaw: () => Promise.reject(new Error("unexpected requestRaw")),
    }
    const plan = await planTeardown(client, "acme")
    const result = await executeTeardown(client, plan)
    expect(result.failed).toHaveLength(0)
    expect(result.deleted).toEqual(
      expect.arrayContaining(["cs101-hw1-alice", "classroom50"]),
    )
    // Marker still deleted last after the retry recovery.
    expect(deletes[deletes.length - 1]).toBe("classroom50")
  })
})
