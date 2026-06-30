import { createFileRoute } from "@tanstack/react-router"
import CreateClassroomPage from "@/pages/CreateClassroomPage"

export const Route = createFileRoute("/_authed/$org/classes/new/")({
  component: CreateClassroomPage,
})
