// Org teardown — the web mirror of the CLI's `gh teacher teardown` (delete
// every repo in the org, marker-gated, marker deleted last). Mirrors the CLI's
// scope decision (ALL org repos, not a leaky managed-only filter) and its
// safety model. Destructive and irreversible — the caller gates it behind a
// typed-org-name ConfirmModal.

import type { GitHubClient } from "@/hooks/github/client"
import { GitHubAPIError } from "@/hooks/github/errors"
import { deleteRepo } from "@/hooks/github/mutations"
import { getOrgRepos, getRepo, sleep } from "@/hooks/github/queries"
import { CONFIG_REPO } from "@/hooks/github/orgChecks"
import { mapWithConcurrency } from "@/util/concurrency"

export class TeardownScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TeardownScopeError"
  }
}

export class TeardownMarkerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TeardownMarkerError"
  }
}

// A secondary rate limit aborted the run. Distinct from TeardownScopeError so
// the UI can offer a retry, and carries partial progress for reporting.
export class TeardownRateLimitError extends Error {
  deleted: string[]
  failed: string[]
  constructor(deleted: string[], failed: string[]) {
    super(
      "Hit a GitHub rate limit while deleting repositories. Some repositories may already be deleted; wait a moment and re-run teardown to finish.",
    )
    this.name = "TeardownRateLimitError"
    this.deleted = deleted
    this.failed = failed
  }
}

export type TeardownPlan = {
  org: string
  repoNames: string[]
}

// Enumerate the deletion plan: every repo in the org, with the marker repo
// ordered last so an interrupted run leaves the marker behind (re-runnable).
// Refuses an org without the classroom50 marker repo.
export async function planTeardown(
  client: GitHubClient,
  org: string,
): Promise<TeardownPlan> {
  const marker = await getRepo(client, org, CONFIG_REPO)
  if (!marker) {
    throw new TeardownMarkerError(
      `${org}/${CONFIG_REPO} not found — refusing teardown on an org without the Classroom 50 marker repo.`,
    )
  }

  const repos = await getOrgRepos(client, org)
  const names = (repos ?? []).map((r) => r.name)
  const nonMarker = names.filter((n) => n !== CONFIG_REPO)
  // Marker last so a partial run stays re-runnable.
  return { org, repoNames: [...nonMarker, CONFIG_REPO] }
}

export type TeardownResult = {
  deleted: string[]
  failed: string[]
}

const MAX_DELETE_ATTEMPTS = 4

const DELETE_SCOPE_MESSAGE =
  "Deleting repositories was forbidden (403). Teardown needs the `delete_repo` OAuth scope, which is not granted by default. Re-authenticate with that scope, or archive repositories instead."

type DeleteOutcome = "deleted" | "rate-limited" | "failed"

// Delete one repo, retrying transient failures (rate limits, 5xx) with
// exponential backoff + jitter, honoring Retry-After. A scope 403 (not a rate
// limit) is unretryable and rethrown so the caller can surface the scope wall.
async function deleteRepoWithRetry(
  client: GitHubClient,
  org: string,
  repo: string,
): Promise<DeleteOutcome> {
  let lastWasRateLimit = false
  for (let attempt = 0; attempt < MAX_DELETE_ATTEMPTS; attempt++) {
    try {
      await deleteRepo(client, { owner: org, repo })
      return "deleted"
    } catch (err) {
      const isRateLimited = err instanceof GitHubAPIError && err.isRateLimited
      lastWasRateLimit = isRateLimited
      // A scope 403 (forbidden but not a rate limit) will never succeed on
      // retry — rethrow immediately so the caller surfaces the scope wall.
      if (err instanceof GitHubAPIError && err.isForbidden && !isRateLimited) {
        throw err
      }
      const isLastAttempt = attempt === MAX_DELETE_ATTEMPTS - 1
      if (isLastAttempt) return isRateLimited ? "rate-limited" : "failed"

      // Back off before retrying: honor Retry-After when present, else
      // exponential backoff with jitter capped at ~8s.
      const retryAfterMs =
        err instanceof GitHubAPIError && err.rateLimit.retryAfter !== null
          ? err.rateLimit.retryAfter * 1000
          : 0
      const backoffMs = Math.min(8000, 500 * 2 ** attempt)
      const jitterMs = Math.floor(Math.random() * 250)
      await sleep(Math.max(retryAfterMs, backoffMs) + jitterMs)
    }
  }
  return lastWasRateLimit ? "rate-limited" : "failed"
}

// Execute the teardown plan with bounded concurrency, marker last. A scope 403
// surfaces TeardownScopeError; a rate-limit 403 surfaces a retryable
// TeardownRateLimitError. The marker is deleted only when every non-marker
// delete succeeded, so a partial failure stays re-runnable.
//
// The repo set is re-enumerated here, not taken from plan.repoNames: the plan
// is captured when the confirm modal opens, but a repo can be created during
// the type-to-confirm pause. Re-listing keeps the "delete every repo"
// guarantee against the live org and re-checks the marker gate.
export async function executeTeardown(
  client: GitHubClient,
  plan: TeardownPlan,
): Promise<TeardownResult> {
  const deleted: string[] = []
  const failed: string[] = []

  const current = await planTeardown(client, plan.org)
  const nonMarker = current.repoNames.filter((n) => n !== CONFIG_REPO)
  const marker = current.repoNames.filter((n) => n === CONFIG_REPO)

  let scopeWall = false
  let rateLimited = false

  const tryDelete = async (repo: string) => {
    try {
      const outcome = await deleteRepoWithRetry(client, plan.org, repo)
      if (outcome === "deleted") {
        deleted.push(repo)
      } else {
        // Retries exhausted: a throttle is retryable; other transient failures
        // (5xx) go to `failed` so the marker is preserved (re-runnable).
        if (outcome === "rate-limited") rateLimited = true
        failed.push(repo)
      }
    } catch (err) {
      // deleteRepoWithRetry only throws for an unretryable scope 403.
      if (err instanceof GitHubAPIError && err.isForbidden) {
        scopeWall = true
      }
      failed.push(repo)
    }
  }

  await mapWithConcurrency(nonMarker, 4, tryDelete)

  // A scope 403 is unrecoverable; a throttle is retryable. Both abort before
  // the marker so the run stays re-runnable.
  const abortIfBlocked = () => {
    if (scopeWall) throw new TeardownScopeError(DELETE_SCOPE_MESSAGE)
    if (rateLimited) throw new TeardownRateLimitError(deleted, failed)
  }

  abortIfBlocked()

  // Marker deleted only on a fully-successful run; otherwise it's left behind so
  // planTeardown's gate still passes and the run stays re-runnable.
  if (failed.length === 0) {
    for (const repo of marker) {
      await tryDelete(repo)
    }
    abortIfBlocked()
  }

  return { deleted, failed }
}
