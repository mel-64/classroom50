import { Navigate, useParams } from "@tanstack/react-router"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import RoleResolvingFallback from "@/components/RoleResolvingFallback"

// The bare assignment route has no view of its own: it forwards to the
// role-appropriate landing. Teachers go to the submissions gradebook; students
// go to their own submission results. We wait for the role to resolve so we
// never bounce a teacher through the student page (or vice versa).
const AssignmentIndexPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const { showTeacherUi, roleResolved } = useCourseTeacherAccess(org)

  if (!org || !classroom || !assignment) {
    return <Navigate to="/" />
  }

  if (!roleResolved) {
    return <RoleResolvingFallback className="min-h-screen" />
  }

  return (
    <Navigate
      to={
        showTeacherUi
          ? "/$org/$classroom/assignments/$assignment/submissions"
          : "/$org/$classroom/assignments/$assignment/submission"
      }
      params={{ org, classroom, assignment }}
      replace
    />
  )
}

export default AssignmentIndexPage
