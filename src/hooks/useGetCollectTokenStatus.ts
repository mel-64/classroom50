import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import { getCollectTokenStatus } from "./github/queries"

const useGetCollectTokenStatus = (org: string) => {
  const client = useGitHubClient()
  return useQuery({
    queryKey: ["github", "collectToken", org],
    queryFn: () => getCollectTokenStatus(client, org),
  })
}

export default useGetCollectTokenStatus
