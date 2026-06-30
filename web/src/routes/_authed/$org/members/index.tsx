import OrgMembersPage from "@/pages/OrgMembersPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/$org/members/")({
  component: OrgMembersPage,
})
