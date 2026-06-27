import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import { githubKeys, listOrgMembers } from "./github/queries"

const useGetOrgMembers = (org: string) => {
  const client = useGitHubClient()
  const {
    data: members,
    isError,
    isLoading,
  } = useQuery({
    queryKey: githubKeys.orgMembers(org),
    queryFn: () => listOrgMembers(client, org),
    staleTime: 10 * 60 * 1000,
  })

  return { members, isError, isLoading }
}

export default useGetOrgMembers
