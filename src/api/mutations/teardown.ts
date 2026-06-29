// Org teardown — the web mirror of the CLI's `gh teacher teardown` (delete
// every repo in the org, marker-gated, marker deleted last). Mirrors the CLI's
// scope decision (ALL org repos, not a leaky managed-only filter) and its
// safety model. It also removes the per-classroom team of every classroom in
// the org's classroom.json so repo deletion doesn't leave those teams orphaned.
// Destructive and irreversible — the caller gates it behind a typed-org-name
// ConfirmModal that lists exactly what will be deleted.

import type { GitHubClient } from "@/hooks/github/client"
import { getClassroomJson } from "@/api/github/queries"
import { GitHubAPIError } from "@/hooks/github/errors"
import {
  deleteClassroomTeam,
  deleteRepo,
  type ClassroomTeamRef,
} from "@/hooks/github/mutations"
import {
  getOrgRepos,
  getRepo,
  listClassroomDirs,
  ONBOARDING_READ_CONCURRENCY,
  sleep,
} from "@/hooks/github/queries"
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
  // Per-classroom teams to delete, resolved from each classroom's classroom.json
  // (deduped by slug). Surfaced so the confirm UI can list exactly what's
  // removed. Only teams a classroom actually links to are deleted — a manually
  // created team is never touched, even if it shares the classroom50- naming.
  teams: ClassroomTeamRef[]
}

// Read each classroom's classroom.json and collect its team ref, deduped by
// slug. Per-classroom reads are best-effort: a classroom with no team block
// (pre-feature) or an unreadable classroom.json simply contributes no ref, so a
// single bad file never blocks the rest of teardown. classroom.json lives in
// the marker repo, so this must run before the marker is deleted.
async function collectClassroomTeams(
  client: GitHubClient,
  org: string,
): Promise<ClassroomTeamRef[]> {
  let dirs: { name: string }[]
  try {
    dirs = await listClassroomDirs(client, org)
  } catch {
    // No readable classroom dirs (e.g. marker already partially gone) — nothing
    // to resolve; let the repo flow proceed.
    return []
  }

  const bySlug = new Map<string, ClassroomTeamRef>()
  await mapWithConcurrency(dirs, ONBOARDING_READ_CONCURRENCY, async (dir) => {
    try {
      const json = await getClassroomJson(client, { org, classroom: dir.name })
      // classroom.json is anyone-with-config-repo-write authored and parsed
      // without schema validation, so the team ref it names is untrusted input
      // to a destructive bulk DELETE. Only queue a ref that (a) carries a
      // positive integer id — deleteClassroomTeam's live-id-match guard is
      // skipped when the id is falsy, which would delete the slug blind — and
      // (b) sits in the classroom50- namespace this app owns, so a crafted
      // `team.slug` can never steer teardown into deleting an unrelated org
      // team (e.g. "admins").
      const team = json.team
      if (
        team?.slug &&
        team.slug.startsWith("classroom50-") &&
        Number.isInteger(team.id) &&
        team.id > 0
      ) {
        bySlug.set(team.slug, {
          id: team.id,
          slug: team.slug,
        })
      }
    } catch {
      // Missing/unreadable classroom.json or no team block: contributes nothing.
    }
  })

  return [...bySlug.values()]
}

// Enumerate the deletion plan: every repo in the org (marker ordered last so an
// interrupted run leaves the marker behind, re-runnable) plus the per-classroom
// teams resolved from classroom.json. Refuses an org without the classroom50
// marker repo.
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
  const teams = await collectClassroomTeams(client, org)
  // Marker last so a partial run stays re-runnable.
  return { org, repoNames: [...nonMarker, CONFIG_REPO], teams }
}

export type TeardownResult = {
  deleted: string[]
  failed: string[]
  // Per-classroom team slugs removed during this run.
  teamsDeleted: string[]
  // Team slugs that could not be deleted (run stays re-runnable).
  teamsFailed: string[]
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

// Delete one classroom team (by its persisted { id, slug }), retrying transient
// failures the same way repo deletes do. Uses deleteClassroomTeam, which
// confirms the live team's id matches the persisted id before deleting (so a
// reused slug isn't clobbered) and treats 404 as already-gone. A scope/
// permission 403 or an id mismatch is unretryable: it's recorded as failed
// without spinning on retries.
async function deleteClassroomTeamWithRetry(
  client: GitHubClient,
  org: string,
  team: ClassroomTeamRef,
): Promise<DeleteOutcome> {
  let lastWasRateLimit = false
  for (let attempt = 0; attempt < MAX_DELETE_ATTEMPTS; attempt++) {
    try {
      await deleteClassroomTeam(client, org, team)
      return "deleted"
    } catch (err) {
      const isRateLimited = err instanceof GitHubAPIError && err.isRateLimited
      lastWasRateLimit = isRateLimited
      // A scope 403 (forbidden, not a rate limit) or a non-API error (id
      // mismatch guard) won't succeed on retry — record it and stop.
      if (!(err instanceof GitHubAPIError)) return "failed"
      if (err.isForbidden && !isRateLimited) return "failed"
      const isLastAttempt = attempt === MAX_DELETE_ATTEMPTS - 1
      if (isLastAttempt) return isRateLimited ? "rate-limited" : "failed"

      const retryAfterMs =
        err.rateLimit.retryAfter !== null ? err.rateLimit.retryAfter * 1000 : 0
      const backoffMs = Math.min(8000, 500 * 2 ** attempt)
      const jitterMs = Math.floor(Math.random() * 250)
      await sleep(Math.max(retryAfterMs, backoffMs) + jitterMs)
    }
  }
  return lastWasRateLimit ? "rate-limited" : "failed"
}

// Delete the per-classroom teams resolved from classroom.json. Deletes are
// best-effort: a hard failure is recorded but never aborts teardown, mirroring
// the repo flow's re-runnable contract. A *throttle* is reported separately
// (teamsRateLimited): unlike a hard failure it is recoverable, so the caller
// retains the marker repo (which holds classroom.json, the only team-ref
// source) rather than deleting it and orphaning a team that a re-run would
// otherwise have cleaned up.
async function deleteClassroomTeams(
  client: GitHubClient,
  org: string,
  teams: ClassroomTeamRef[],
): Promise<{
  teamsDeleted: string[]
  teamsFailed: string[]
  teamsRateLimited: boolean
}> {
  const teamsDeleted: string[] = []
  const teamsFailed: string[] = []
  let teamsRateLimited = false

  await mapWithConcurrency(teams, 4, async (team) => {
    const outcome = await deleteClassroomTeamWithRetry(client, org, team)
    if (outcome === "deleted") {
      teamsDeleted.push(team.slug)
    } else {
      if (outcome === "rate-limited") teamsRateLimited = true
      teamsFailed.push(team.slug)
    }
  })

  return { teamsDeleted, teamsFailed, teamsRateLimited }
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

  // Remove the per-classroom teams. Refs are re-resolved from classroom.json
  // here (not taken from the possibly-stale plan), and BEFORE the marker repo
  // is deleted — classroom.json lives in the marker repo, so reading it after
  // would be impossible. Best-effort: a team failure never blocks the marker.
  const teamRefs = await collectClassroomTeams(client, plan.org)
  const { teamsDeleted, teamsFailed, teamsRateLimited } =
    await deleteClassroomTeams(client, plan.org, teamRefs)

  // A throttled team delete is recoverable, so treat it like a repo throttle:
  // retain the marker (don't run the block below) so classroom.json survives
  // and a re-run can re-resolve and finish the team. A *hard* team failure
  // (id mismatch, scope 403, exhausted 5xx) is accepted as best-effort and
  // does NOT retain the marker — see the marker-gate note below.
  if (teamsRateLimited) rateLimited = true

  // Marker deleted only on a fully-successful run; otherwise it's left behind so
  // planTeardown's gate still passes and the run stays re-runnable. Gated on
  // repo `failed` and a team *throttle* only: a hard team failure is best-effort
  // and intentionally does not retain the marker (a permanently-refused team,
  // e.g. a reused-slug id mismatch, would otherwise wedge teardown forever).
  if (failed.length === 0 && !rateLimited) {
    for (const repo of marker) {
      await tryDelete(repo)
    }
    abortIfBlocked()
  }

  return { deleted, failed, teamsDeleted, teamsFailed }
}
