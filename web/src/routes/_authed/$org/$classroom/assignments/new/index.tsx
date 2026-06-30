import { createFileRoute } from "@tanstack/react-router"
import CreateAssignmentPage from "@/pages/CreateAssignmentPage"

export const Route = createFileRoute(
  "/_authed/$org/$classroom/assignments/new/",
)({
  component: CreateAssignmentPage,
})
