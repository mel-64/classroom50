import { useQuery } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import {
  getOpenPullRequests,
  githubKeys,
  type GitHubPullRequest,
} from "./github/queries"

// The Feedback PR for a student/group repo: the open PR the autograde workflow
// opens after an accept. Returns the first open PR (there is at most one), or
// null when none exists yet (no submission graded, or the PR step skipped).
const useGetFeedbackPr = (org: string, repo: string) => {
  const client = useGitHubClient()

  return useQuery({
    queryKey: githubKeys.openPulls(org, repo),
    queryFn: ({ signal }) => getOpenPullRequests(client, org, repo, signal),
    select: (pulls): GitHubPullRequest | null => pulls[0] ?? null,
    staleTime: 60 * 1000,
    retry: false,
  })
}

export default useGetFeedbackPr
