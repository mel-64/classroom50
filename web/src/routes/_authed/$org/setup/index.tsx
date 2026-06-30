import OrgSetupPage from "@/pages/OrgSetupPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/$org/setup/")({
  component: OrgSetupPage,
})
