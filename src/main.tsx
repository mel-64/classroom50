import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import "./index.css"
import { GitHubAuthProvider } from "./auth/useGithubAuth"
import { GitHubClientProviderFromAuth } from "./context/github/GitHubClientProviderFromAuth"
import App from "./App"

const client = new QueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <GitHubAuthProvider>
        <GitHubClientProviderFromAuth>
          <App />
        </GitHubClientProviderFromAuth>
      </GitHubAuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
