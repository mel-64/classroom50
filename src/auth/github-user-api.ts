import type { GithubUser } from './types'

export async function fetchGithubUser(token: string): Promise<GithubUser> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    }
  })

  if (!res.ok) {
    throw new Error(`GitHub API: HTTP ${res.status}`)
  }

  return res.json()
}
