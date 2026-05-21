import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react"
import { createGitHubClient, type GitHubClient } from "@/hooks/github/client"

const GitHubClientContext = createContext<GitHubClient | null>(null)

export function GitHubProvider({
  token,
  children,
}: PropsWithChildren<{ token: string | null }>) {
  const client = useMemo(() => {
    if (!token) return null
    return createGitHubClient({ token })
  }, [token])

  return (
    <GitHubClientContext.Provider value={client}>
      {children}
    </GitHubClientContext.Provider>
  )
}

export function useGitHubClient() {
  const client = useContext(GitHubClientContext)

  if (!client) {
    throw new Error("useGitHubClient must be used after GitHub auth is ready")
  }

  return client
}

export function useOptionalGitHubClient() {
  return useContext(GitHubClientContext)
}
