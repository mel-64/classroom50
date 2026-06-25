import { queryOptions } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import Papa from "papaparse"

import type { GitHubClient } from "./client"
import type {
  GitHubBranchRef,
  GitHubCommitRef,
  GitHubOrgInvitation,
  GitHubOrgMembership,
  GitHubRelease,
  GitHubRepo,
  GitHubTeam,
  GitHubUser,
  GitHubWorkflowRun,
} from "./types"
import type { Assignment } from "@/types/classroom"
import { GitHubAPIError } from "./errors"
import {
  COLLECT_SCORES_WORKFLOW,
  createTeam,
  getErrorMessage,
} from "./mutations"
import { decodeBase64Utf8 } from "@/util/github"
import type { GetAssignmentsFileInput } from "@/api/queries/assignments"
import type { OrgRunner, OrgRunnersResult } from "@/util/runners"

export const githubKeys = {
  all: ["github"] as const,

  viewer: () => [...githubKeys.all, "viewer"] as const,
  user: (username: string) => [...githubKeys.all, "user", username],

  orgMembership: (org: string) =>
    [...githubKeys.all, "org-membership", org] as const,

  orgInvitations: (org: string) =>
    [...githubKeys.all, "org-invitations", org] as const,

  orgFailedInvitations: (org: string) =>
    [...githubKeys.all, "org-failed-invitations", org] as const,

  orgMembers: (org: string) => ["orgs", "list", "members", org] as const,

  orgRunners: (org: string) => [...githubKeys.all, "org-runners", org] as const,

  repo: (owner: string, repo: string) =>
    [...githubKeys.all, "repo", owner, repo] as const,

  collaborators: (org: string, repo: string) =>
    [...githubKeys.all, "collaborators", org, repo] as const,

  openPulls: (owner: string, repo: string) =>
    [...githubKeys.all, "open-pulls", owner, repo] as const,

  branchRef: (org: string) => [...githubKeys.all, "branchRef", org] as const,
  commitTree: (org: string, branchSha: string) =>
    [...githubKeys.all, "commitRef", org, branchSha] as const,

  rawFile: (owner: string, repo: string, path: string, ref?: string) =>
    [...githubKeys.all, "raw-file", owner, repo, path, ref ?? null] as const,

  jsonFile: (owner: string, repo: string, path?: string, ref?: string) =>
    [
      ...githubKeys.all,
      "json-file",
      owner,
      repo,
      path || "",
      ref ?? null,
    ] as const,

  csvFile: (owner: string, repo: string, path: string, ref?: string) =>
    [...githubKeys.all, "csv-file", owner, repo, path, ref ?? null] as const,

  collectScoresRun: (owner: string, sinceRunId: number | null) =>
    [
      ...githubKeys.all,
      "collect-scores-run",
      owner,
      sinceRunId ?? "none",
    ] as const,

  lastCollectScoresRun: (owner: string) =>
    [...githubKeys.all, "last-collect-scores-run", owner] as const,

  serviceToken: (owner: string) =>
    [...githubKeys.all, "serviceToken", owner] as const,

  releases: (owner: string, repo: string) =>
    [...githubKeys.all, "releases", owner, repo] as const,
}

// Refresh the lists that drive roster invite status after enroll/resend/
// unenroll: a resend moves an invite between pending and failed, and accepting
// moves a user into members.
export function invalidateInviteQueries(queryClient: QueryClient, org: string) {
  queryClient.invalidateQueries({ queryKey: githubKeys.orgInvitations(org) })
  queryClient.invalidateQueries({
    queryKey: githubKeys.orgFailedInvitations(org),
  })
  queryClient.invalidateQueries({ queryKey: githubKeys.orgMembers(org) })
}

export function viewerQuery(client: GitHubClient) {
  return queryOptions({
    queryKey: githubKeys.viewer(),
    queryFn: ({ signal }) =>
      client.request<GitHubUser>("/user", { method: "GET", signal }),
    staleTime: 10 * 60 * 1000,
  })
}

export function getUser(client: GitHubClient, username: string) {
  return client.request<GitHubUser>(`/users/${username}`)
}

export function getUserQuery(client: GitHubClient, username: string) {
  return queryOptions({
    queryKey: githubKeys.user(username),
    queryFn: ({ signal }) =>
      client.request<GitHubUser>(`/users/${username}`, {
        method: "GET",
        signal,
      }),
    staleTime: 10 * 60 * 1000,
  })
}

export function orgMembershipQuery(client: GitHubClient, org: string) {
  return queryOptions({
    queryKey: githubKeys.orgMembership(org),
    queryFn: ({ signal }) =>
      client.request<GitHubOrgMembership>(
        `/user/memberships/orgs/${encodeURIComponent(org)}`,
        { method: "GET", signal },
      ),
    enabled: Boolean(org),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

// Self-hosted runners registered in the org (GitHub's admin:org endpoint),
// used only to advise whether a typed label exists. Tolerant: 403/404 resolve
// to an "unavailable" sentinel so the form degrades to "couldn't verify"
// instead of erroring. GitHub-hosted labels are recognized separately.
export function orgRunnersQuery(client: GitHubClient, org: string) {
  return queryOptions<OrgRunnersResult>({
    queryKey: githubKeys.orgRunners(org),
    queryFn: async ({ signal }) => {
      try {
        const runners: OrgRunner[] = []
        let page = 1

        while (true) {
          const data = await client.request<{
            total_count: number
            runners: OrgRunner[]
          }>(
            `/orgs/${encodeURIComponent(
              org,
            )}/actions/runners?per_page=100&page=${page}`,
            { method: "GET", signal },
          )

          const batch = data.runners ?? []
          runners.push(...batch)

          if (batch.length < 100) break
          page++
        }

        return { available: true, runners }
      } catch (error) {
        // Let cancellations propagate; don't cache them as a verdict.
        if (signal?.aborted) throw error
        // 403 (no admin:org) / 404 (no access) mean "can't read the list",
        // not "the runner doesn't exist".
        if (
          error instanceof GitHubAPIError &&
          (error.status === 403 || error.status === 404)
        ) {
          return { available: false, reason: "no-access" }
        }
        return { available: false, reason: "error" }
      }
    },
    enabled: Boolean(org),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function getBranchRefRepo(
  client: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
) {
  return client.request<GitHubBranchRef>(
    `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
  )
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isGitRepositoryEmptyError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("git repository is empty")
  )
}

function isNotFoundError(error: unknown) {
  return (
    error instanceof Error && error.message.toLowerCase().includes("not found")
  )
}

// A freshly-generated/templated repo's git-data APIs lag behind the 200 from
// POST .../generate: reads 404 and the first write 409s "Git Repository is
// empty" while GitHub seeds. Both are transient. A bare 409 (no empty-repo
// message) is a real conflict — e.g. a non-fast-forward updateRef — so the 409
// branch is gated on the message. Mirrors the CLI's isFreshRepoRetryable.
export function isFreshRepoLagError(error: unknown) {
  if (error instanceof GitHubAPIError) {
    if (error.status === 404) {
      return true
    }
    if (error.status === 409) {
      return isGitRepositoryEmptyError(error)
    }
  }
  return isGitRepositoryEmptyError(error) || isNotFoundError(error)
}

export type FreshRepoRetryOptions = {
  attempts?: number
  baseDelayMs?: number
  // Backoff multiplier between retries. 1 = fixed delay. Default 2.
  backoffFactor?: number
  // Which errors count as retryable lag. Default isFreshRepoLagError.
  shouldRetry?: (error: unknown) => boolean
}

// Retry `fn` while it hits fresh-repo lag (the window where a just-generated
// repo's git-data APIs lag behind the 200 from POST .../generate). Single source
// of truth for the retry/backoff policy — the branch-ref poll and the accept
// commit sequence both use it. `fn` must re-read its own state each attempt; it
// may throw a synthetic error to signal lag that isn't an HTTP error (e.g. a 200
// with a blank SHA). Mirrors the CLI's CommitWithFreshRepoRetry.
export async function withFreshRepoRetry<T>(
  fn: () => Promise<T>,
  options: FreshRepoRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 6
  const baseDelayMs = options.baseDelayMs ?? 500
  const backoffFactor = options.backoffFactor ?? 2
  const shouldRetry = options.shouldRetry ?? isFreshRepoLagError

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (!shouldRetry(err) || attempt === attempts) {
        throw err
      }
      await sleep(baseDelayMs * backoffFactor ** (attempt - 1))
    }
  }

  throw lastError
}

export function branchRefQuery(client: GitHubClient, org: string) {
  return queryOptions({
    queryKey: githubKeys.branchRef(org),
    queryFn: ({ signal }) =>
      client.request<GitHubBranchRef>(
        `/repos/${org}/classroom50/git/ref/heads/main`,
        { method: "GET", signal },
      ),
    enabled: Boolean(org),
    staleTime: 60 * 1000,
    retry: false,
  })
}

export function getCommitByRepo(
  client: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
) {
  return client.request<GitHubCommitRef>(
    `/repos/${owner}/${repo}/git/commits/${branch}`,
  )
}
export function commitQuery(
  client: GitHubClient,
  org: string,
  branchSha: string,
) {
  return queryOptions({
    queryKey: githubKeys.commitTree(org, branchSha),
    queryFn: ({ signal }) =>
      client.request<GitHubCommitRef>(
        `/repos/${org}/classroom50/git/commits/${branchSha}`,
        { method: "GET", signal },
      ),
    enabled: Boolean(org && branchSha),
    staleTime: 60 * 1000,
    retry: false,
  })
}

export function repoQuery(client: GitHubClient, owner: string, repo: string) {
  return queryOptions({
    queryKey: githubKeys.repo(owner, repo),
    queryFn: ({ signal }) =>
      client.request<GitHubRepo>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        { method: "GET", signal },
      ),
    enabled: Boolean(owner && repo),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function rawFileQuery(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
) {
  const params = new URLSearchParams()

  if (ref) {
    params.set("ref", ref)
  }

  const suffix = params.size ? `?${params.toString()}` : ""

  return queryOptions({
    queryKey: githubKeys.rawFile(owner, repo, path, ref),
    queryFn: ({ signal }) =>
      client.requestRaw(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/contents/${path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}${suffix}`,
        { method: "GET", signal },
      ),
    enabled: Boolean(owner && repo && typeof path === "string"),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}

export function jsonFileQuery<T>(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
) {
  return queryOptions({
    queryKey: githubKeys.jsonFile(owner, repo, path, ref),
    queryFn: async ({ signal }) => {
      const raw = await client.requestRaw(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/contents/${path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
        { method: "GET", signal },
      )

      // Throw a friendly error naming the file rather than a raw SyntaxError.
      try {
        return JSON.parse(raw) as T
      } catch {
        throw new Error(
          `${path} couldn't be read (the file may be malformed). Try refreshing in a moment.`,
        )
      }
    },
    enabled: Boolean(owner && repo && typeof path === "string"),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}

// The submission-tag convention written by the autograde runner: each graded
// push publishes a `submit/<timestamp>-<sha>` release whose body GitHub renders
// as the score + per-test table. We list these and link students straight to
// the release page rather than reading result.json.
const SUBMISSION_TAG_PREFIX = "submit/"

// All graded-submission releases for a student's repo, newest first. A repo
// with no releases yet (or the very first push still grading) returns []. The
// release page itself shows the rendered grade, so we only need the metadata.
export function releasesQuery(
  client: GitHubClient,
  owner: string,
  repo: string,
) {
  return queryOptions({
    queryKey: githubKeys.releases(owner, repo),
    queryFn: async ({ signal }): Promise<GitHubRelease[]> => {
      const releases = await client.request<GitHubRelease[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/releases?per_page=100`,
        { method: "GET", signal },
      )

      return releases
        .filter((r) => r.tag_name.startsWith(SUBMISSION_TAG_PREFIX))
        .sort((a, b) => releaseTime(b) - releaseTime(a))
    },
    enabled: Boolean(owner && repo),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

// published_at is null for a draft; fall back to created_at so ordering holds.
function releaseTime(release: GitHubRelease): number {
  return new Date(release.published_at ?? release.created_at).getTime()
}

export function csvFileQuery<T>(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
) {
  return queryOptions({
    queryKey: githubKeys.csvFile(owner, repo, path, ref),
    queryFn: async ({ signal }) => {
      const raw = await client.requestRaw(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/contents/${path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
        { method: "GET", signal },
      )

      const csvParse = Papa.parse<T>(raw, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim(),
        transform: (value: string) => value.trim(),
      })

      return csvParse.data
    },
    enabled: Boolean(owner && repo && typeof path === "string"),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}

export async function getRawFile(
  client: GitHubClient,
  input: GetAssignmentsFileInput,
): Promise<string> {
  const { org, path, ref } = input

  const file = await client.request<{
    type: "file"
    encoding: "base64"
    content: string
  }>(
    `/repos/${org}/classroom50/contents/${path}?ref=${encodeURIComponent(ref)}`,
  )

  if (file.type !== "file") {
    throw new Error(`${path} is not a file`)
  }

  return decodeBase64Utf8(file.content)
}

export async function getClassroom50Yaml(
  client: GitHubClient,
  org: string,
  repo: string,
): Promise<string> {
  const file = await client.request<{
    type: "file"
    encoding: "base64"
    content: string
  }>(`/repos/${org}/${repo}/contents/.classroom50.yaml?ref=main`)

  if (file.type !== "file") {
    throw new Error(`.classroom50.yaml not found in ${repo}`)
  }

  return decodeBase64Utf8(file.content)
}

export function listOrgMembers(client: GitHubClient, org: string, page = 1) {
  return client.request<GitHubUser[]>(
    `/orgs/${org}/members?per_page=100&page=${page}`,
  )
}

// Walk a GitHub list endpoint to exhaustion, 100 items per page. `makePath`
// receives the 1-based page number. Stops when a page returns fewer than 100.
export async function paginateAll<T>(
  client: GitHubClient,
  makePath: (page: number) => string,
): Promise<T[]> {
  const all: T[] = []
  let page = 1

  while (true) {
    const batch = await client.request<T[]>(makePath(page))
    all.push(...batch)
    if (batch.length < 100) break
    page++
  }

  return all
}

export async function getOrgMembers(
  client: GitHubClient,
  org: string,
): Promise<GitHubUser[]> {
  return paginateAll<GitHubUser>(
    client,
    (page) => `/orgs/${org}/members?per_page=100&page=${page}`,
  )
}

// Owner-only (403 for non-owners). Expired invites drop off this list and
// surface via getOrgFailedInvitations.
export async function getOrgInvitations(
  client: GitHubClient,
  org: string,
): Promise<GitHubOrgInvitation[]> {
  return paginateAll<GitHubOrgInvitation>(
    client,
    (page) => `/orgs/${org}/invitations?per_page=100&page=${page}`,
  )
}

// Failed / expired org invitations (carry failed_at / failed_reason). Owner-only.
export async function getOrgFailedInvitations(
  client: GitHubClient,
  org: string,
): Promise<GitHubOrgInvitation[]> {
  return paginateAll<GitHubOrgInvitation>(
    client,
    (page) => `/orgs/${org}/failed_invitations?per_page=100&page=${page}`,
  )
}

export async function getTeam(
  client: GitHubClient,
  org: string,
  classroom: string,
) {
  const teamSlug = `classroom50-${classroom}`

  try {
    return await client.request<GitHubTeam>(`/orgs/${org}/teams/${teamSlug}`)
  } catch (error) {
    if (error instanceof GitHubAPIError && error.status === 404) {
      return null
    }

    throw error
  }
}

// Whether the classroom team already has access to a repo (the in-org private
// template). 2xx = has access, 404 = doesn't; other errors propagate so a
// transient failure isn't misread as "no access".
export async function teamHasRepoAccess(
  client: GitHubClient,
  input: { org: string; classroom: string; owner: string; repo: string },
): Promise<boolean> {
  const { org, classroom, owner, repo } = input
  const teamSlug = `classroom50-${classroom}`

  try {
    await client.request(
      `/orgs/${org}/teams/${teamSlug}/repos/${owner}/${repo}`,
    )
    return true
  } catch (error) {
    if (error instanceof GitHubAPIError && error.status === 404) {
      return false
    }
    throw error
  }
}

export async function ensureTeam(
  client: GitHubClient,
  org: string,
  classroom: string,
): Promise<GitHubTeam> {
  const existingTeam = await getTeam(client, org, classroom)

  if (existingTeam) return existingTeam

  try {
    return await createTeam(client, { org, name: `classroom50-${classroom}` })
  } catch (error) {
    if (error instanceof GitHubAPIError && error.status === 422) {
      const team = await getTeam(client, org, classroom)

      if (team) return team
    }

    throw error
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    // headers: {
    //   "Cache-Control": "no-cache, no-store, max-age=0",
    //   Pragma: "no-cache",
    // },
  })

  if (response.status === 404) {
    throw new Error(
      "The classroom may not exist yet, or publish-pages.yaml may not have run.",
    )
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function pagesAssignmentUrl(org: string, classroom: string) {
  return `https://${org}.github.io/classroom50/${classroom}/assignments.json`
}

// Public, unauthenticated signal that an org is a real Classroom50 org: the
// classroom50 Pages site publishes this index, so a student who can't read the
// private config repo can still distinguish a genuine Classroom50 org.
export function classroomsIndexUrl(org: string) {
  return `https://${org}.github.io/classroom50/classrooms-index.json`
}

export async function orgPublishesClassroom50Pages(
  org: string,
): Promise<"yes" | "no" | "indeterminate"> {
  try {
    const res = await fetch(classroomsIndexUrl(org), {
      cache: "no-store",
      // Bound the probe so a hung github.io host can't stall the orgs load.
      signal: AbortSignal.timeout(5000),
    })
    // A clean 404 is a definitive "not a Classroom50 org". Other non-ok
    // statuses (5xx, 429) are transient -> indeterminate, don't penalize.
    if (res.status === 404) return "no"
    if (!res.ok) return "indeterminate"
    // Confirm it's actually the index shape, not a stray 200 (e.g. a custom
    // 404 page served with 200).
    const data = (await res.json()) as { classrooms?: unknown }
    return Array.isArray(data?.classrooms) ? "yes" : "no"
  } catch {
    // Network failure, timeout, DNS, CORS -> transient; never collapse to a
    // definitive "no" (that would hide a genuinely-enrolled student's org).
    return "indeterminate"
  }
}

export type AssignmentsJson =
  | Assignment[]
  | {
      version?: 1
      assignments: Assignment[]
    }
export function extractAssignments(json: AssignmentsJson): Assignment[] {
  if (Array.isArray(json)) return json

  if (json.version !== undefined && json.version !== 1) {
    throw new Error(
      `This classroom uses assignments.json v${json.version}, but this client only supports v1. Please update classroom50.`,
    )
  }

  if (!Array.isArray(json.assignments)) {
    throw new Error(
      "assignments.json has an invalid v1 shape. Ask your instructor to check classroom50 configuration.",
    )
  }

  return json.assignments
}

export async function fetchPagesAssignments(
  org: string,
  classroom: string,
): Promise<Assignment[]> {
  const json = await fetchJson<AssignmentsJson>(
    pagesAssignmentUrl(org, classroom),
  )
  const assignments = extractAssignments(json)

  return assignments
}

export async function listAuthedOrgMemberships(client: GitHubClient) {
  return client.request<GitHubOrgMembership[]>(
    "/user/memberships/orgs?per_page=100",
  )
}

export async function getAuthedOrgMembership(
  client: GitHubClient,
  org: string,
) {
  return client.request<GitHubOrgMembership>(`/user/memberships/orgs/${org}`)
}

export type Classroom50OrgSummary = {
  org: {
    login: string
    id: number
    avatar_url: string
    description?: string | null
    html_url: string
  }

  membership: {
    state: "active" | "pending"
    role: "admin" | "member"
  }

  classroom50: {
    status: Classroom50Status
    serviceToken: ServiceTokenStatus | null
    canAccessRepo: boolean
    canInitialize: boolean
    pagesUrl: string
  }
}

type Classroom50Status =
  | "ready"
  | "needs_setup"
  | "no_access"
  | "not_classroom50"
  | "unknown"
export async function getClassroom50OrgSummary(
  client: GitHubClient,
  membership: GitHubOrgMembership,
): Promise<Classroom50OrgSummary> {
  const org = membership.organization

  let canAccessRepo = false
  let serviceToken: ServiceTokenStatus | null = null
  let status: Classroom50Status

  try {
    await client.request(`/repos/${org.login}/classroom50`)
    canAccessRepo = true
    status = "ready"

    serviceToken = await getServiceTokenStatus(client, org.login)
  } catch (error) {
    if (error instanceof GitHubAPIError && error.status === 404) {
      canAccessRepo = false

      if (membership.state === "active" && membership.role === "admin") {
        // An admin who can't see classroom50 hasn't initialized it yet.
        status = "needs_setup"
      } else {
        // A non-admin gets a 404 both when the org isn't a Classroom50 org and
        // when it is but the config repo is private to them. Disambiguate via
        // the public Pages index. On an indeterminate probe (transient network
        // failure) keep the org visible (no_access) rather than hiding a
        // genuinely-enrolled student's org behind a CDN blip.
        const pagesVerdict = await orgPublishesClassroom50Pages(org.login)
        status = pagesVerdict === "no" ? "not_classroom50" : "no_access"
      }
    } else {
      status = "unknown"
    }
  }

  return {
    org,
    membership: {
      state: membership.state,
      role: membership.role,
    },
    classroom50: {
      status,
      canAccessRepo,
      serviceToken,
      canInitialize:
        membership.state === "active" && membership.role === "admin",
      pagesUrl: `https://${org.login}.github.io/classroom50/`,
    },
  }
}

export async function getRepo(
  client: GitHubClient,
  owner: string,
  repo: string,
) {
  try {
    return await client.request<GitHubRepo>(`/repos/${owner}/${repo}`)
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 404) {
      return null
    }
    throw err
  }
}

export type GitHubPullRequest = {
  number: number
  html_url: string
  state: "open" | "closed"
  title: string
  draft?: boolean
  head: { ref: string }
  base: { ref: string }
}

// Open PRs on a student/group repo. The autograde workflow opens one Feedback
// PR per repo, so the first open PR is that PR. 404 (repo not generated yet) ->
// []. Tolerant so a missing repo reads as "no PR" rather than throwing.
export async function getOpenPullRequests(
  client: GitHubClient,
  owner: string,
  repo: string,
  signal?: AbortSignal,
) {
  try {
    return await client.request<GitHubPullRequest[]>(
      `/repos/${owner}/${repo}/pulls?state=open&per_page=10`,
      { method: "GET", signal },
    )
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 404) {
      return []
    }
    throw err
  }
}

export async function getOrgRepos(client: GitHubClient, owner: string) {
  try {
    return await client.request<GitHubRepo[]>(
      `/orgs/${owner}/repos?per_page=100`,
    )
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 404) {
      return null
    }
    throw err
  }
}

type RepositorySecret = {
  name: string
  created_at: string
  updated_at: string
}
const SERVICE_TOKEN_SECRET_NAME = "CLASSROOM50_SERVICE_TOKEN"
export type ServiceTokenStatus =
  | {
      status: "present"
      secretName: typeof SERVICE_TOKEN_SECRET_NAME
      createdAt: string
      updatedAt: string
      message: string
    }
  | {
      status: "missing"
      secretName: typeof SERVICE_TOKEN_SECRET_NAME
      message: string
    }
  | {
      status: "unknown"
      secretName: typeof SERVICE_TOKEN_SECRET_NAME
      reason: "repo_missing_or_no_access" | "permission_denied" | "unknown"
      message: string
    }

export async function getServiceTokenStatus(
  client: GitHubClient,
  org: string,
): Promise<ServiceTokenStatus> {
  try {
    const secret = await client.request<RepositorySecret>(
      `/repos/${org}/classroom50/actions/secrets/${SERVICE_TOKEN_SECRET_NAME}`,
    )

    return {
      status: "present",
      secretName: SERVICE_TOKEN_SECRET_NAME,
      createdAt: secret.created_at,
      updatedAt: secret.updated_at,
      message: `Service token is set on the classroom50 config repo. Last updated ${new Date(
        secret.updated_at,
      ).toLocaleString()}.`,
    }
  } catch (err) {
    if (err instanceof GitHubAPIError) {
      if (err.status === 404) {
        return {
          status: "missing",
          secretName: SERVICE_TOKEN_SECRET_NAME,
          message:
            "Service token is not set on the classroom50 config repo. Score-collection workflows cannot read student repositories until a service token is set.",
        }
      }

      if (err.status === 403) {
        return {
          status: "unknown",
          secretName: SERVICE_TOKEN_SECRET_NAME,
          reason: "permission_denied",
          message:
            "Could not check the service token on the classroom50 config repo because this GitHub authorization cannot read repository Actions secrets.",
        }
      }
    }

    return {
      status: "unknown",
      secretName: SERVICE_TOKEN_SECRET_NAME,
      reason: "unknown",
      message: `Could not check the service token on the classroom50 config repo: ${getErrorMessage(
        err,
      )}`,
    }
  }
}

export async function getRepoPermissionForUser(params: {
  client: GitHubClient
  org: string
  repo: string
  username: string
}) {
  const { client, org, repo, username } = params

  return client.request(
    `/repos/${org}/${repo}/collaborators/${username}/permission`,
  )
}

// Fetches the most recent collect-scores run matching the given filters (or
// null if none). Shared by the "track my dispatch" and "last collected" reads.
async function listLatestCollectScoresRun(
  client: GitHubClient,
  org: string,
  filters: {
    event?: string
    since?: string
    status?: string
    perPage?: number
  },
  signal?: AbortSignal,
): Promise<GitHubWorkflowRun[]> {
  const params = new URLSearchParams({
    per_page: String(filters.perPage ?? 1),
  })
  if (filters.event) params.set("event", filters.event)
  if (filters.since) params.set("created", `>=${filters.since}`)
  if (filters.status) params.set("status", filters.status)

  const res = await client.request<{ workflow_runs: GitHubWorkflowRun[] }>(
    `/repos/${org}/classroom50/actions/workflows/${COLLECT_SCORES_WORKFLOW}/runs?${params.toString()}`,
    { method: "GET", signal },
  )

  return res.workflow_runs ?? []
}

// Finds the run we dispatched: run ids are monotonic, so it's the oldest
// dispatch run with an id greater than `sinceRunId` (the newest id before our
// POST). Binding to our own run avoids mistaking a concurrent dispatch for ours
// and needs no clock. Returns null until our run registers; `sinceRunId === null`
// means no prior runs, so the oldest run on the first page is ours.
export async function getCollectScoresRunAfterId(
  client: GitHubClient,
  org: string,
  sinceRunId: number | null,
  signal?: AbortSignal,
): Promise<GitHubWorkflowRun | null> {
  const runs = await listLatestCollectScoresRun(
    client,
    org,
    { event: "workflow_dispatch", perPage: 20 },
    signal,
  )

  // runs come newest-first; the run we triggered is the oldest one newer than
  // the pre-dispatch baseline.
  const newer =
    sinceRunId === null ? runs : runs.filter((r) => r.id > sinceRunId)
  return newer.length > 0 ? newer[newer.length - 1] : null
}

// The most recent *completed* collect-scores run (cron or manual), or null if
// the workflow has never completed. Used for the "last collected" timestamp;
// status=completed stops an in-flight newer run from hiding the prior one.
export async function getLastCollectScoresRun(
  client: GitHubClient,
  org: string,
  signal?: AbortSignal,
): Promise<GitHubWorkflowRun | null> {
  const runs = await listLatestCollectScoresRun(
    client,
    org,
    { status: "completed" },
    signal,
  )
  return runs[0] ?? null
}
