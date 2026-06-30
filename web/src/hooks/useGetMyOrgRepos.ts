import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import { getOrgRepos } from "./github/queries"

const useGetOrgRepos = (org: string) => {
  const client = useGitHubClient()

  return useQuery({
    queryKey: ["orgs", org, "repos"],
    queryFn: () => getOrgRepos(client, org),
    staleTime: 10 * 60 * 1000,
  })
}

export default useGetOrgRepos
