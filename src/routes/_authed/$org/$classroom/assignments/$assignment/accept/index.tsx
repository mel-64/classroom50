import { createFileRoute } from "@tanstack/react-router"
import AcceptAssignmentPage from "@/pages/AcceptAssignmentPage"

export const Route = createFileRoute(
  "/_authed/$org/$classroom/assignments/$assignment/accept/",
)({
  component: AcceptAssignmentPage,
})
