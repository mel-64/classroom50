import { createFileRoute } from "@tanstack/react-router"
import ClassesPage from "@/pages/ClassesPage"

export const Route = createFileRoute("/_authed/$org/classes/")({
  component: ClassesPage,
})
