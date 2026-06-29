import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"

import { githubKeys } from "./github/queries"
import { buildOrgAuditReport } from "@/orgPolicy/audit"

// Read-only org policy audit. Plan-aware (enterprise unlocks the 4
// enterprise-only fields); pass the org's plan name from useGetOrgPlanDetails.
const useGetOrgAudit = (org: string, plan: string | undefined) => {
  const client = useGitHubClient()
  return useQuery({
    queryKey: githubKeys.orgAudit(org),
    queryFn: () => buildOrgAuditReport(client, org, plan),
    enabled: Boolean(org),
    staleTime: 5 * 60 * 1000,
  })
}

export default useGetOrgAudit
