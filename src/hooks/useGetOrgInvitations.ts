import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import { githubKeys, getOrgInvitations, getOrgFailedInvitations } from "./github/queries"
import { GitHubAPIError } from "./github/errors"

// Reading org invitations / failed invitations is owner-only; a non-owner token
// gets a 403. We surface that as `isForbidden` so the UI can explain why no
// invite status is shown rather than rendering an ambiguous empty state.
const useGetOrgInvitations = (org: string) => {
  const client = useGitHubClient()

  const invitationsQuery = useQuery({
    queryKey: githubKeys.orgInvitations(org),
    queryFn: () => getOrgInvitations(client, org),
    enabled: Boolean(org),
    staleTime: 60 * 1000,
    retry: false,
  })

  const failedQuery = useQuery({
    queryKey: githubKeys.orgFailedInvitations(org),
    queryFn: () => getOrgFailedInvitations(client, org),
    enabled: Boolean(org),
    staleTime: 60 * 1000,
    retry: false,
  })

  const isForbidden = [invitationsQuery.error, failedQuery.error].some(
    (error) => error instanceof GitHubAPIError && error.isForbidden,
  )

  return {
    invitations: invitationsQuery.data ?? [],
    failedInvitations: failedQuery.data ?? [],
    isLoading: invitationsQuery.isLoading || failedQuery.isLoading,
    isError: invitationsQuery.isError || failedQuery.isError,
    isForbidden,
  }
}

export default useGetOrgInvitations
