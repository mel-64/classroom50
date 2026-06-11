import type { PropsWithChildren } from "react"
import { GitHubProvider } from "./GitHubProvider"
import { useGithubAuth } from "@/auth/useGithubAuth"

export function GitHubClientProviderFromAuth({ children }: PropsWithChildren) {
  const githubAuth = useGithubAuth()

  return <GitHubProvider token={githubAuth.token}>{children}</GitHubProvider>
}
