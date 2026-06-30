import type { GitHubUser } from "@/hooks/github/types"

export async function fetchGithubUser(token: string): Promise<GitHubUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  })

  if (!res.ok) {
    throw new Error(`GitHub API: HTTP ${res.status}`)
  }

  return res.json()
}
