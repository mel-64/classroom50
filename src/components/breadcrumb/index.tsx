import useGetClassroom from "@/hooks/useGetClassroom"
import { useParams } from "@tanstack/react-router"
import { Link } from "@tanstack/react-router"

const Breadcrumb = ({
  className,
  endpoint,
  isTeacher,
}: {
  className?: string
  endpoint: string
  isTeacher?: boolean
}) => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const { data: classData } = useGetClassroom(org, classroom)

  if (!org && !classroom) return <div></div>

  return (
    <div className={`[&>a]:text-[#4e80ee] ${className}`}>
      {org && <Link to={`/${org}`}>Classes</Link>} {classroom && <>&gt; </>}
      {classroom && (
        <Link to={`/${org}/${classroom}`}>
          {classData?.name || classData?.short_name || classroom}
        </Link>
      )}{" "}
      {assignment && (
        <>
          &gt; <Link to={`/${org}/${classroom}/assignments`}>Assignments</Link>{" "}
          &gt;{" "}
          <Link to={`/${org}/${classroom}/assignments/${assignment}`}>
            {assignment}
          </Link>
        </>
      )}{" "}
      {endpoint && <>&gt; {endpoint}</>}
    </div>
  )
}

export default Breadcrumb
