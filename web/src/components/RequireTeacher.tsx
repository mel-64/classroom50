import { type ReactNode } from "react"
import { useParams } from "@tanstack/react-router"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import NotFound from "@/components/NotFound"
import RoleResolvingFallback from "@/components/RoleResolvingFallback"

// Gate page content to teachers. While the role is resolving we render a
// spinner (so we never flash a 404 at a real teacher), then either the
// children or a NotFound view. Access is GitHub-enforced underneath; this is a
// UX guard, and it 404s rather than 403s by design. When TA/other roles land,
// extend this with an `allow` prop instead of branching per page.
const RequireTeacher = ({ children }: { children: ReactNode }) => {
  const { org } = useParams({ strict: false })
  const { showTeacherUi, roleResolved } = useCourseTeacherAccess(org)

  if (!roleResolved) {
    return <RoleResolvingFallback />
  }

  if (!showTeacherUi) {
    return <NotFound />
  }

  return <>{children}</>
}

export default RequireTeacher
