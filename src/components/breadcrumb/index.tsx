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
    <div className={`[&>a]:text-[#4e80ee] ${className}`}>
      {org && (
        <Link to="/$org" params={{ org }}>
          Classes
        </Link>
      )}{" "}
      {org && classroom && <>› </>}
      {org && classroom && (
        <Link to="/$org/$classroom" params={{ org, classroom }}>
          {classData?.name || classData?.short_name || classroom}
        </Link>
      )}{" "}
      {org && classroom && assignment && (
        <>
          ›{" "}
          <Link to="/$org/$classroom/assignments" params={{ org, classroom }}>
            Assignments
          </Link>{" "}
          ›{" "}
          <Link
            to="/$org/$classroom/assignments/$assignment"
            params={{ org, classroom, assignment }}
          >
            {assignment}
          </Link>
        </>
      )}{" "}
      {endpoint && <>› {endpoint}</>}
    </div>
  )
}

export default Breadcrumb
