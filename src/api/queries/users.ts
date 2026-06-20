import type { GitHubClient } from "@/hooks/github/client"
import type { GitHubUser } from "@/hooks/github/types"

export async function getAuthenticatedUser(client: GitHubClient) {
  return client.request<GitHubUser>("/user")
}
