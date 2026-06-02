import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import { listOrgMembers } from "./github/queries"

const useGetOrgMembers = (org: string) => {
  const client = useGitHubClient()
  const { data: members } = useQuery({
    queryKey: ["orgs", "list", "members", org],
    queryFn: () => listOrgMembers(client, org),
    staleTime: 10 * 60 * 1000,
  })

  return members
}

export default useGetOrgMembers
