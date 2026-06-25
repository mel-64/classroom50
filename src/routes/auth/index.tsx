import { createFileRoute, redirect } from "@tanstack/react-router"
import { GitHubAuthCard } from "@/auth/GitHubAuthCard"

export const Route = createFileRoute("/auth/")({
  component: GitHubAuthCard,
  beforeLoad: ({ context }) => {
    const { auth } = context
    if (auth.status === "authenticated") {
      throw redirect({
        to: "/",
      })
    }
  },
})
