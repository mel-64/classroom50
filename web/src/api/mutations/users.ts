import type { GitHubClient } from "@/hooks/github/client"

// Accept a pending org invitation for the authenticated user. Returns whether
// the PATCH succeeded so callers can distinguish "now active" from a transient
// failure (a swallowed failure previously stranded the onboarding round-trip on
// a redirect that never fired). Still best-effort: never throws.
export async function acceptPendingOrgInvite(
  client: GitHubClient,
  org: string,
): Promise<{ ok: boolean }> {
  try {
    await client.request(`/user/memberships/orgs/${org}`, {
      method: "PATCH",
      body: {
        state: "active",
      },
    })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
