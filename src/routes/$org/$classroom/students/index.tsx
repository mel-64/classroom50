import { createFileRoute } from '@tanstack/react-router'
import StudentListPage from '@/pages/StudentListPage'

export const Route = createFileRoute('/$org/$classroom/students/')({
  component: StudentListPage,
})
