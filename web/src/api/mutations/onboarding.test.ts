import { describe, expect, it, vi } from "vitest"
import { submitOnboarding } from "./onboarding"
import { GitHubAPIError } from "@/hooks/github/errors"
import type { GitHubClient } from "@/hooks/github/client"
import { parseOnboardingYaml } from "@/util/yaml"

// submitOnboarding is the student write path: accept the pending invite, create
// (or reuse) onboarding-<id>, commit the self-report YAML, then downgrade to
// read. These tests pin the risk-bearing branches: happy create+commit, the
// squat (no-push) rejection, the 422 re-fetch/idempotent path, and the
// created-repo cleanup on a commit failure.

const USER = { login: "ada", id: 42, name: "Ada", email: null }

const apiError = (status: number, message = "err") =>
  new GitHubAPIError({
    status,
    url: "/x",
    message,
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

// A path-routing fake client for submitOnboarding. `repoOnCreate` controls what
// POST /orgs/{org}/repos returns (or throws); `existingYaml` seeds a reusable
// onboarding repo in the org listing.
const makeClient = (opts: {
  repoOnCreate?: () => unknown
  refetchedRepo?: unknown
  existingRepos?: { name: string; yaml?: string; archived?: boolean }[]
  failCommit?: boolean
}) => {
  const calls = {
    deleteRepo: 0,
    archiveRepo: 0,
    treeContent: null as string | null,
  }
  const existingRepos = opts.existingRepos ?? []

  const request = vi
    .fn()
    .mockImplementation(
      (path: string, options?: { method?: string; body?: unknown }) => {
        const method = options?.method ?? "GET"

        if (path === "/user") return Promise.resolve(USER)
        if (path.includes("/user/memberships/orgs/"))
          return Promise.resolve({ state: "active" })

        // Org repo listing (resolveOwnOnboardingRepo).
        if (/\/orgs\/[^/]+\/repos\?/.test(path)) {
          return Promise.resolve(
            existingRepos.map((r) => ({
              name: r.name,
              archived: r.archived ?? false,
              default_branch: "main",
            })),
          )
        }
        // Read an existing repo's onboarding YAML.
        const yamlRead = path.match(
          /\/repos\/[^/]+\/([^/]+)\/contents\/\.classroom50-onboarding\.yaml/,
        )
        if (yamlRead) {
          const repo = existingRepos.find((r) => r.name === yamlRead[1])
          if (!repo?.yaml) return Promise.reject(apiError(404))
          return Promise.resolve({
            type: "file",
            encoding: "base64",
            content: Buffer.from(repo.yaml, "utf-8").toString("base64"),
          })
        }
        // Create repo.
        if (/\/orgs\/[^/]+\/repos$/.test(path) && method === "POST") {
          return Promise.resolve(
            opts.repoOnCreate ? opts.repoOnCreate() : undefined,
          )
        }
        // Re-fetch a repo (422 path).
        if (/^\/repos\/[^/]+\/[^/]+$/.test(path) && method === "GET") {
          return Promise.resolve(opts.refetchedRepo)
        }
        if (path.includes("/git/ref/heads/")) {
          return Promise.resolve({ object: { sha: "parent-sha" } })
        }
        if (path.includes("/git/commits/")) {
          return Promise.resolve({ tree: { sha: "base-tree-sha" } })
        }
        if (path.endsWith("/git/trees")) {
          if (opts.failCommit) return Promise.reject(apiError(500, "boom"))
          const tree = (options?.body as { tree?: { content?: string }[] })
            ?.tree
          calls.treeContent = tree?.[0]?.content ?? null
          return Promise.resolve({ sha: "tree-sha" })
        }
        if (path.endsWith("/git/commits") && method === "POST") {
          return Promise.resolve({ sha: "commit-sha" })
        }
        if (path.includes("/git/refs/heads/")) return Promise.resolve({})
        // addRepoCollaborator (downgrade to pull) + deleteRepo/archiveRepo.
        if (path.includes("/collaborators/")) return Promise.resolve({})
        if (/^\/repos\/[^/]+\/[^/]+$/.test(path) && method === "DELETE") {
          calls.deleteRepo++
          return Promise.resolve({})
        }
        if (/^\/repos\/[^/]+\/[^/]+$/.test(path) && method === "PATCH") {
          calls.archiveRepo++
          return Promise.resolve({})
        }
        return Promise.reject(
          new Error(`unexpected request: ${method} ${path}`),
        )
      },
    )

  return { client: { request } as unknown as GitHubClient, calls }
}

const input = {
  org: "acme",
  classroom: "cs101",
  email: "ada@x.edu",
  first_name: "Ada",
  last_name: "Lovelace",
}

describe("submitOnboarding", () => {
  it("creates onboarding-<id> and commits the self-report (happy path)", async () => {
    const { client, calls } = makeClient({
      repoOnCreate: () => ({
        name: "onboarding-42",
        default_branch: "main",
        permissions: { push: true, pull: true, admin: true },
      }),
    })

    const result = await submitOnboarding(client, input)

    expect(result.status).toBe("created")
    expect(result.repoName).toBe("onboarding-42")
    expect(calls.deleteRepo).toBe(0)
    // The committed YAML carries the GitHub-attested identity + claimed fields.
    const committed = parseOnboardingYaml(calls.treeContent ?? "")
    expect(committed.github_id).toBe(42)
    expect(committed.github_username).toBe("ada")
    expect(committed.email).toBe("ada@x.edu")
    expect(committed.classroom).toBe("cs101")
  })

  it("rejects with an actionable error when the repo isn't push-able (squat)", async () => {
    // 422 (name taken) -> re-fetch a repo the student can't push to.
    const { client } = makeClient({
      repoOnCreate: () => {
        throw apiError(422, "name already exists")
      },
      refetchedRepo: {
        name: "onboarding-42",
        default_branch: "main",
        permissions: { push: false, pull: true, admin: false },
      },
    })

    await expect(submitOnboarding(client, input)).rejects.toThrow(
      /already taken by a repository you can't write to/i,
    )
  })

  it("reuses an existing repo for the same classroom (already-onboarded)", async () => {
    const yaml =
      "email: ada@x.edu\nfirst_name: Ada\nlast_name: Lovelace\n" +
      "github_username: ada\ngithub_id: 42\nclassroom: cs101\n"
    // Reuse path: resolveOwnOnboardingRepo finds the repo by name, so status is
    // "already-onboarded"; submitOnboarding still POSTs the name (422 = exists)
    // then re-fetches and re-commits so a half-finished attempt self-heals.
    const { client } = makeClient({
      existingRepos: [{ name: "onboarding-42", yaml }],
      repoOnCreate: () => {
        throw apiError(422, "name already exists")
      },
      refetchedRepo: {
        name: "onboarding-42",
        default_branch: "main",
        permissions: { push: true, pull: true, admin: true },
      },
    })

    const result = await submitOnboarding(client, input)
    expect(result.status).toBe("already-onboarded")
    expect(result.repoName).toBe("onboarding-42")
  })

  it("deletes the just-created repo when the commit fails, then rethrows", async () => {
    const { client, calls } = makeClient({
      repoOnCreate: () => ({
        name: "onboarding-42",
        default_branch: "main",
        permissions: { push: true, pull: true, admin: true },
      }),
      failCommit: true,
    })

    await expect(submitOnboarding(client, input)).rejects.toThrow()
    // Cleanup ran because THIS call created the repo.
    expect(calls.deleteRepo).toBe(1)
  })
})
