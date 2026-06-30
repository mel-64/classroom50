import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

import "./index.css"
import { GitHubAuthProvider } from "./auth/useGithubAuth"
import { GitHubClientProviderFromAuth } from "./context/github/GitHubClientProviderFromAuth"
import { NotificationProvider } from "./context/notifications/NotificationProvider"
import App from "./App"

const client = new QueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <GitHubAuthProvider>
        <GitHubClientProviderFromAuth>
          <NotificationProvider>
            <App />
          </NotificationProvider>
          {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
        </GitHubClientProviderFromAuth>
      </GitHubAuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
