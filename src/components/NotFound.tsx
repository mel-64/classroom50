import { Link } from "@tanstack/react-router"
import { FileQuestion } from "lucide-react"

// Role/visibility-gated pages render this when the current user can't access a
// resource. We deliberately present a 404 ("not found") rather than a 403
// ("forbidden"): access is ultimately enforced by GitHub, so this is a UX
// concern, and a 404 avoids confirming the resource exists to someone whose
// role can't see it. Reused across teacher-only pages and future TA roles.
const NotFound = ({
  title = "Page not found",
  message = "This page doesn't exist, or you don't have access to it.",
}: {
  title?: string
  message?: string
}) => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-base-200 text-base-content/50">
        <FileQuestion className="size-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 max-w-md text-base-content/60">{message}</p>
      </div>
      <Link to="/" className="btn btn-primary btn-sm">
        Go to dashboard
      </Link>
    </div>
  )
}

export default NotFound
