import { useQuery } from "@tanstack/react-query"
import { useGithubAuth } from "../auth/useGithubAuth"

const getOrg = async (org: string, token: string) => {
  if (!org || !token) {
    throw new Error("can't get org without identifier or token")
  }

  const res = await fetch(
    `https://api.github.com/user/memberships/orgs/${org}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    },
  )

  if (!res.ok) {
    throw new Error(`GitHub API: HTTP ${res.status}`)
  }

  return res.json()
}

const useGetOrg = (org: string) => {
  const { token } = useGithubAuth()
  return useQuery({
    queryKey: ["github", "user", "memberships", org],
    queryFn: () => getOrg(org, token ?? ""),
    staleTime: 60 * 60 * 1000,
  })
}

export default useGetOrg
