import type { PropsWithChildren } from "react"
import { GitHubProvider } from "./GitHubProvider"
import { useGithubAuthContext } from "@/auth/GitHubAuthProvider"

export function GitHubClientProviderFromAuth({ children }: PropsWithChildren) {
  const githubAuth = useGithubAuthContext()

  return <GitHubProvider token={githubAuth.token}>{children}</GitHubProvider>
}
