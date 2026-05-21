import { createFileRoute } from "@tanstack/react-router"
import OrgPage from "@/pages/OrgPage"

export const Route = createFileRoute("/$org/")({
  component: OrgPage,
})
