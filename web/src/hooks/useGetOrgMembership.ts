import { useGithubAuth } from "@/auth/useGithubAuth"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import type { GitHubOrgMembership } from "./github/types"

const useGetOrgMembership = (org?: string) => {
  const client = useGitHubClient()
  const { user } = useGithubAuth()

  return useQuery({
    queryKey: ["github", "orgs", "memberships", org],
    queryFn: () =>
      client.request<GitHubOrgMembership>(
        `/orgs/${org}/memberships/${user?.login}`,
      ),
    enabled: !!user && !!org,
    retry: false,
  })
}

export default useGetOrgMembership
