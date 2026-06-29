import { Link } from "@tanstack/react-router"
import { Info, UserPlus } from "lucide-react"

// Empty/unenrolled-roster warning. Owns the daisyUI alert shell + ARIA so the
// assignments list and create pages can't drift in markup; copy adapts to
// whether the roster has rows (invited but not joined) or is entirely empty.
// Render only when useEmptyRosterWarning().show is true.
export const EmptyRosterNotice = ({
  org,
  classroom,
  hasRosterRows,
  className = "mb-6",
}: {
  org: string
  classroom: string
  hasRosterRows: boolean
  className?: string
}) => (
  <div
    role="alert"
    className={`alert alert-info alert-soft flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
  >
    <div className="flex items-start gap-2">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span className="text-sm">
        {hasRosterRows ? (
          <>
            No students have joined the{" "}
            <span className="font-semibold">{org}</span> organization yet. An
            assignment's accept link only works for students who are
            organization members, so invited students must accept their invite
            first.
          </>
        ) : (
          <>
            This classroom has no students yet. An assignment's accept link only
            works for students who are members of the{" "}
            <span className="font-semibold">{org}</span> organization, so add and
            enroll students before sharing it.
          </>
        )}
      </span>
    </div>
    <Link
      to="/$org/$classroom/students"
      params={{ org, classroom }}
      className="btn btn-sm btn-info whitespace-nowrap sm:shrink-0"
    >
      <UserPlus className="size-4" />
      {hasRosterRows ? "Manage roster" : "Add students"}
    </Link>
  </div>
)

export default EmptyRosterNotice
