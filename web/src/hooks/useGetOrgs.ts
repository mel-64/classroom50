import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import {
  getClassroom50OrgSummary,
  listAuthedOrgMemberships,
} from "./github/queries"

const useGetOrgs = () => {
  const client = useGitHubClient()
  return useQuery({
    queryKey: ["orgs"],
    queryFn: async () => {
      const memberships = await listAuthedOrgMemberships(client)

      const activeMemberships = memberships.filter(
        (membership) => membership.state === "active",
      )

      return Promise.all(
        activeMemberships.map((membership) =>
          getClassroom50OrgSummary(client, membership),
        ),
      )
    },
    staleTime: 10 * 60 * 1000,
  })
}

export default useGetOrgs
