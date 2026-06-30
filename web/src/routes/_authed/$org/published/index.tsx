import PublishedResourcesPage from "@/pages/PublishedResourcesPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/$org/published/")({
  component: PublishedResourcesPage,
})
