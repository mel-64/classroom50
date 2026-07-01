import useGetClassroom from "@/hooks/useGetClassroom"
import { useParams } from "@tanstack/react-router"
import { Link } from "@tanstack/react-router"

const Breadcrumb = ({
  className,
  endpoint,
}: {
  className?: string
  endpoint: string
}) => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const { data: classData } = useGetClassroom(org, classroom)

  if (!org && !classroom) return <div></div>

  return (
    <nav
      aria-label="Breadcrumb"
      className={`breadcrumbs text-sm [&_a]:text-primary ${className ?? ""}`}
    >
      <ol>
        {org && (
          <li>
            <Link to="/$org" params={{ org }}>
              Classes
            </Link>
          </li>
        )}
        {org && classroom && (
          <li>
            <Link to="/$org/$classroom" params={{ org, classroom }}>
              {classData?.name || classData?.short_name || classroom}
            </Link>
          </li>
        )}
        {org && classroom && assignment && (
          <>
            <li>
              <Link
                to="/$org/$classroom/assignments"
                params={{ org, classroom }}
              >
                Assignments
              </Link>
            </li>
            <li>
              <Link
                to="/$org/$classroom/assignments/$assignment"
                params={{ org, classroom, assignment }}
              >
                {assignment}
              </Link>
            </li>
          </>
        )}
        {endpoint && <li aria-current="page">{endpoint}</li>}
      </ol>
    </nav>
  )
}

export default Breadcrumb
