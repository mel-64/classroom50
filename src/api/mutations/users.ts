import type { GitHubClient } from "@/hooks/github/client"

export async function acceptPendingOrgInvite(
  client: GitHubClient,
  org: string,
) {
  try {
    await client.request(`/user/memberships/orgs/${org}`, {
      method: "PATCH",
      body: {
        state: "active",
      },
    })
  } catch {
    // ignore
  }
}
