import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import { ensureTeam } from "./github/queries"

const useEnsureTeam = (org: string, classroom: string) => {
  const client = useGitHubClient()

  const teamQuery = useQuery({
    queryKey: ["team", org, classroom],
    queryFn: () => ensureTeam(client, org, classroom),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(org) && Boolean(classroom),
  })

  return {
    team: teamQuery.data,
    teamQuery,
  }
}

export default useEnsureTeam
