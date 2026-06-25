import { useQuery } from "@tanstack/react-query"
import {
  useGitHubClient,
  useOptionalGitHubClient,
} from "@/context/github/GitHubProvider"
import {
  jsonFileQuery,
  orgMembershipQuery,
  rawFileQuery,
  repoQuery,
  viewerQuery,
} from "./queries"

export function useGitHubViewer() {
  const client = useGitHubClient()
  return useQuery(viewerQuery(client))
}

export function useGitHubOrgMembership(org: string) {
  const client = useGitHubClient()
  return useQuery(orgMembershipQuery(client, org))
}

export function useGitHubRepo(owner: string | undefined, repo: string) {
  const client = useGitHubClient()
  return useQuery(repoQuery(client, owner ?? "", repo))
}

export function useGitHubRawFile(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
) {
  const client = useGitHubClient()
  return useQuery(rawFileQuery(client, owner, repo, path, ref))
}

export function useGitHubJsonFile<T>(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
) {
  const client = useGitHubClient()
  return useQuery(jsonFileQuery<T>(client, owner, repo, path, ref))
}

export function useOptionalGitHubViewer() {
  const client = useOptionalGitHubClient()

  return useQuery({
    ...viewerQuery(client as never),
    enabled: Boolean(client),
  })
}
