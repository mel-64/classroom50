import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import router from "./router"

import "./index.css"
import { GitHubAuthProvider } from "./auth/GitHubAuthProvider"
import { GitHubClientProviderFromAuth } from "./context/github/GitHubClientProviderFromAuth"

const client = new QueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <GitHubAuthProvider>
        <GitHubClientProviderFromAuth>
          <RouterProvider router={router} />
        </GitHubClientProviderFromAuth>
      </GitHubAuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
