import { createFileRoute } from '@tanstack/react-router'
import SubmissionsPage from '@/pages/SubmissionsPage'

export const Route = createFileRoute(
  '/$org/$classroom/assignments/$assignment/submissions/',
)({
  component: SubmissionsPage,
})
