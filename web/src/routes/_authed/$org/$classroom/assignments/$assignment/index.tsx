import { createFileRoute } from "@tanstack/react-router"
import AssignmentIndexPage from "@/pages/AssignmentIndexPage"

export const Route = createFileRoute(
  "/_authed/$org/$classroom/assignments/$assignment/",
)({
  component: AssignmentIndexPage,
})
