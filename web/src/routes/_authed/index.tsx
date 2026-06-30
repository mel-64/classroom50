import OrgsPage from "@/pages/OrgsPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/")({
  component: OrgsPage,
})
