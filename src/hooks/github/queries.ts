import { queryOptions } from "@tanstack/react-query"
import Papa from "papaparse"

import type { GitHubClient } from "./client"
import type {
  GitHubBranchRef,
  GitHubCommitRef,
  GitHubOrgMembership,
  GitHubRepo,
  GitHubTeam,
  GitHubUser,
} from "./types"
import type { Assignment } from "@/types/classroom"
import { GitHubAPIError } from "./errors"
import { createTeam, getErrorMessage } from "./mutations"
import { decodeBase64Utf8 } from "@/util/github"
import type { GetAssignmentsFileInput } from "@/api/mutations/queries"

export const githubKeys = {
  all: ["github"] as const,

  viewer: () => [...githubKeys.all, "viewer"] as const,
  user: (username: string) => [...githubKeys.all, "user", username],

  orgMembership: (org: string) =>
    [...githubKeys.all, "org-membership", org] as const,

  repo: (owner: string, repo: string) =>
    [...githubKeys.all, "repo", owner, repo] as const,

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

export async function waitForBranchRefRepo(
  client: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
  options: {
    attempts?: number
    delayMs?: number
  } = {},
) {
  const attempts = options.attempts ?? 8
  const delayMs = options.delayMs ?? 750

  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await getBranchRefRepo(client, owner, repo, branch)
    } catch (err) {
      lastError = err

      if (!isGitRepositoryEmptyError(err) && !isNotFoundError(err)) {
        throw err
      }

      if (attempt < attempts) {
        await sleep(delayMs)
      }
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

      return JSON.parse(raw) as T
    },
    enabled: Boolean(owner && repo && typeof path === "string"),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
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
export async function getOrgMembers(
  client: GitHubClient,
  org: string,
): Promise<GitHubUser[]> {
  const members: GitHubUser[] = []
  let page = 1

  while (true) {
    const batch = await client.request<GitHubUser[]>(
      `/orgs/${org}/members?per_page=100&page=${page}`,
    )

    members.push(...batch)

    if (batch.length < 100) break

    page++
  }

  return members
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

function pagesAssignmentUrl(org: string, classroom: string) {
  return `https://${org}.github.io/classroom50/${classroom}/assignments.json`
}

type AssignmentsJson =
  | Assignment[]
  | {
      version?: 1
      assignments: Assignment[]
    }
function extractAssignments(json: AssignmentsJson): Assignment[] {
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

export async function fetchAssignmentFromPages(
  org: string,
  classroom: string,
  assignmentSlug: string,
): Promise<Assignment> {
  const json = await fetchJson<AssignmentsJson>(
    pagesAssignmentUrl(org, classroom),
  )

  const assignments = extractAssignments(json)
  console.log("assignments", assignments)
  const assignment = assignments.find((entry) => entry.slug === assignmentSlug)

  if (!assignment) {
    throw new Error(`Assignment ${assignmentSlug} was not found.`)
  }

  return assignment
}

export async function fetchTextWithFriendlyErrors(
  url: string,
  label: string,
): Promise<string> {
  const response = await fetch(url)

  if (response.status === 404) {
    throw new Error(
      `${label} is not published yet. Ask your instructor to confirm the file exists in the config repo and that publish-pages.yaml has been run.`,
    )
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}: ${response.status}`)
  }

  const text = await response.text()

  if (!text.trim()) {
    throw new Error(
      "Pages deployment may still be in flight. Retry in a minute.",
    )
  }

  return text
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
    collectToken: CollectTokenStatus | null
    canAccessRepo: boolean
    canInitialize: boolean
    pagesUrl: string
  }
}

type Classroom50Status = "ready" | "needs_setup" | "no_access" | "unknown"
export async function getClassroom50OrgSummary(
  client: GitHubClient,
  membership: GitHubOrgMembership,
): Promise<Classroom50OrgSummary> {
  const org = membership.organization

  let canAccessRepo = false
  let collectToken: CollectTokenStatus | null = null
  let status: Classroom50Status = "unknown"

  try {
    await client.request(`/repos/${org.login}/classroom50`)
    canAccessRepo = true
    status = "ready"

    collectToken = await getCollectTokenStatus(client, org.login)
  } catch (error: any) {
    if (error.status === 404) {
      canAccessRepo = false

      status =
        membership.state === "active" && membership.role === "admin"
          ? "needs_setup"
          : "no_access"
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
      collectToken,
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
const COLLECT_TOKEN_SECRET_NAME = "CLASSROOM50_COLLECT_TOKEN"
export type CollectTokenStatus =
  | {
      status: "present"
      secretName: typeof COLLECT_TOKEN_SECRET_NAME
      createdAt: string
      updatedAt: string
      message: string
    }
  | {
      status: "missing"
      secretName: typeof COLLECT_TOKEN_SECRET_NAME
      message: string
    }
  | {
      status: "unknown"
      secretName: typeof COLLECT_TOKEN_SECRET_NAME
      reason: "repo_missing_or_no_access" | "permission_denied" | "unknown"
      message: string
    }

export async function getCollectTokenStatus(
  client: GitHubClient,
  org: string,
): Promise<CollectTokenStatus> {
  try {
    const secret = await client.request<RepositorySecret>(
      `/repos/${org}/classroom50/actions/secrets/${COLLECT_TOKEN_SECRET_NAME}`,
    )

    return {
      status: "present",
      secretName: COLLECT_TOKEN_SECRET_NAME,
      createdAt: secret.created_at,
      updatedAt: secret.updated_at,
      message: `Collect token secret exists. Last updated ${new Date(
        secret.updated_at,
      ).toLocaleString()}.`,
    }
  } catch (err) {
    if (err instanceof GitHubAPIError) {
      if (err.status === 404) {
        return {
          status: "missing",
          secretName: COLLECT_TOKEN_SECRET_NAME,
          message:
            "Collect token secret is missing. Store collection workflows will not be able to read student repositories until a token is stored.",
        }
      }

      if (err.status === 403) {
        return {
          status: "unknown",
          secretName: COLLECT_TOKEN_SECRET_NAME,
          reason: "permission_denied",
          message:
            "Could not check the collect token secret because this GitHub authorization cannot read repository Actions secrets.",
        }
      }
    }

    return {
      status: "unknown",
      secretName: COLLECT_TOKEN_SECRET_NAME,
      reason: "unknown",
      message: `Could not check collect token secret: ${getErrorMessage(err)}`,
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
