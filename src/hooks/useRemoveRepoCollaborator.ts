import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { githubKeys } from "./github/queries"
import { removeRepoCollaborator } from "./github/mutations"

export function useRemoveRepoCollaborator() {
  const client = useGitHubClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { org: string; repo: string; username: string }) =>
      removeRepoCollaborator({
        client,
        ...params,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: githubKeys.collaborators(variables.org, variables.repo),
      })
    },
  })
}

export default useRemoveRepoCollaborator
