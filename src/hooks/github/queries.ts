import { queryOptions } from "@tanstack/react-query"
import Papa from "papaparse"

import type { GitHubClient } from "./client"
import type {
  GitHubBranchRef,
  GitHubCommitRef,
  GitHubOrgMembership,
  GitHubRepo,
  GitHubUser,
} from "./types"

export const githubKeys = {
  all: ["github"] as const,

  viewer: () => [...githubKeys.all, "viewer"] as const,

  orgMembership: (org: string) =>
    [...githubKeys.all, "org-membership", org] as const,

  repo: (owner: string, repo: string) =>
    [...githubKeys.all, "repo", owner, repo] as const,

  branchRef: (org: string) => [...githubKeys.all, "branchRef", org] as const,
  commitTree: (org: string, branchSha: string) =>
    [...githubKeys.all, "commitRef", org, branchSha] as const,

  rawFile: (owner: string, repo: string, path: string, ref?: string) =>
    [...githubKeys.all, "raw-file", owner, repo, path, ref ?? null] as const,

  jsonFile: (owner: string, repo: string, path: string, ref?: string) =>
    [...githubKeys.all, "json-file", owner, repo, path, ref ?? null] as const,

  csvFile: (owner: string, repo: string, path: string, ref?: string) =>
    [...githubKeys.all, "csv-file", owner, repo, path, ref ?? null] as const,
}

export function viewerQuery(client: GitHubClient) {
  return queryOptions({
    queryKey: githubKeys.viewer(),
    queryFn: ({ signal }) => client.request<GitHubUser>("/user", { signal }),
    staleTime: 10 * 60 * 1000,
  })
}

export function orgMembershipQuery(client: GitHubClient, org: string) {
  return queryOptions({
    queryKey: githubKeys.orgMembership(org),
    queryFn: ({ signal }) =>
      client.request<GitHubOrgMembership>(
        `/user/memberships/orgs/${encodeURIComponent(org)}`,
        { signal },
      ),
    enabled: Boolean(org),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
export function getBranchRef(client: GitHubClient, org: string) {
  return client.request<GitHubBranchRef>(
    `/repos/${org}/classroom50/git/ref/heads/main`,
  )
}

export function branchRefQuery(client: GitHubClient, org: string) {
  return queryOptions({
    queryKey: githubKeys.branchRef(org),
    queryFn: ({ signal }) =>
      client.request<GitHubBranchRef>(
        `/repos/${org}/classroom50/git/ref/heads/main`,
        { signal },
      ),
    enabled: Boolean(org),
    staleTime: 60 * 1000,
    retry: false,
  })
}

export function getCommit(
  client: GitHubClient,
  org: string,
  branchSha: string,
) {
  return client.request<GitHubCommitRef>(
    `/repos/${org}/classroom50/git/commits/${branchSha}`,
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
        { signal },
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
        { signal },
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
        { signal },
      ),
    enabled: Boolean(owner && repo && typeof path === "string"),
    staleTime: 10 * 60 * 1000,
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
        { signal },
      )

      return JSON.parse(raw) as T
    },
    enabled: Boolean(owner && repo && typeof path === "string"),
    staleTime: 10 * 60 * 1000,
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
        { signal },
      )

      const csvParse = Papa.parse<T>(raw, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        transform: (value) => value.trim(),
      })

      return csvParse.data
    },
    enabled: Boolean(owner && repo && typeof path === "string"),
    staleTime: 10 * 60 * 1000,
  })
}
