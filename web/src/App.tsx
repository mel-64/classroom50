import { useEffect } from "react"
import { RouterProvider } from "@tanstack/react-router"

import router from "./router"
import { useGithubAuth } from "@/auth/useGithubAuth"

export function App() {
  const { status, token, user } = useGithubAuth()

  useEffect(() => {
    if (status === "loading") return
    void router.invalidate()
  }, [status, token])

  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  return <RouterProvider router={router} context={{ auth: { user, status } }} />
}

export default App
