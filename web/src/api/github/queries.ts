import type { GitHubClient } from "@/hooks/github/client"
import type { GitHubBranchRef, GitHubCommitRef } from "@/hooks/github/types"
import type { Classroom } from "@/types/classroom"

export function getBranchRef(
  client: GitHubClient,
  org: string,
  branch?: string,
) {
  return client.request<GitHubBranchRef>(
    `/repos/${org}/classroom50/git/ref/heads/${branch ?? "main"}`,
  )
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

export async function getClassroomJson(
  client: GitHubClient,
  input: {
    org: string
    classroom: string
    ref?: string
  },
): Promise<Classroom> {
  const path = `${input.classroom}/classroom.json`
  const query = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : ""

  const raw = await client.requestRaw(
    `/repos/${input.org}/classroom50/contents/${path}${query}`,
  )

  return JSON.parse(raw)
}
