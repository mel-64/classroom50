import EditClassroomPage from "@/pages/EditClassroomPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/$org/$classroom/edit/")({
  component: EditClassroomPage,
})
