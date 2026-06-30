import { createFileRoute } from "@tanstack/react-router"
import StudentSubmissionPage from "@/pages/StudentSubmissionPage"

export const Route = createFileRoute(
  "/_authed/$org/$classroom/assignments/$assignment/submission/",
)({
  component: StudentSubmissionPage,
})
