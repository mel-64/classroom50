import EditAssignmentPage from "@/pages/EditAssignmentPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authed/$org/$classroom/assignments/$assignment/edit/",
)({
  component: EditAssignmentPage,
})
