import { createFileRoute } from "@tanstack/react-router"
import AssignmentsPage from "@/pages/AssignmentsPage"

export const Route = createFileRoute("/assignments")({
  component: AssignmentsPage,
})
