import { createFileRoute } from '@tanstack/react-router'
import CreateAssignmentPage from '@/pages/CreateAssignmentPage'

export const Route = createFileRoute('/$org/$classroom/assignments/new/')({
  component: CreateAssignmentPage,
})
