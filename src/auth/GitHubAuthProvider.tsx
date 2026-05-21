import { createContext, useContext, type PropsWithChildren } from "react"
import { useGithubAuth } from "./useGithubAuth"

type GitHubAuth = ReturnType<typeof useGithubAuth>

const GitHubAuthContext = createContext<GitHubAuth | null>(null)

export function GitHubAuthProvider({ children }: PropsWithChildren) {
  const githubAuth = useGithubAuth()

  return (
    <GitHubAuthContext.Provider value={githubAuth}>
      {children}
    </GitHubAuthContext.Provider>
  )
}

export function useGithubAuthContext() {
  const value = useContext(GitHubAuthContext)

  if (!value) {
    throw new Error(
      "useGitHubAuthContext must be used within GitHubAuthProvider",
    )
  }

  return value
}
