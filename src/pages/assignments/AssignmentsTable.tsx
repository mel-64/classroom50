import { Link } from "@tanstack/react-router"
import { UserRound, UsersRound } from "lucide-react"

import useGetScores from "@/hooks/useGetScores"

function formatDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number)

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day))
}

const AssignmentsTable = ({ org, classroom, assignments, students = [] }) => {
  const { data: scoresData } = useGetScores(org, classroom)

  return (
    <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
      <div className="table">
        <thead>
          <tr>
            <th>Assignment</th>
            <th>Type</th>
            <th>Due Date</th>
            <th>Submissions</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {!assignments?.length && (
            <tr>
              <td colSpan={5} className="text-center">
                No assignments created.
              </td>
            </tr>
          )}
          {assignments?.map((assignment) => (
            <tr>
              <td>{assignment.name}</td>
              <td className="flex">
                {assignment.mode === "individual" && (
                  <div className="flex gap-2">
                    <UserRound /> Individual
                  </div>
                )}
                {assignment.mode === "group" && (
                  <div className="flex gap-2">
                    <UsersRound /> Group
                  </div>
                )}
              </td>
              <td>
                <span className="badge badge-soft">
                  {assignment.due_date
                    ? formatDate(assignment.due_date)
                    : "Invalid Date"}
                </span>
              </td>
              <td>
                {/* TODO: need to grab # of submissions and # of total students here */}
                {scoresData?.submissions?.[assignment.slug]?.length || 0} /{" "}
                {students.length}{" "}
                <progress
                  className="progress progress-info w-56"
                  value={
                    students.length === 0
                      ? 0
                      : ((scoresData?.submissions?.[assignment.slug]?.length ||
                          0) /
                          students.length) *
                        100
                  }
                  max="100"
                ></progress>
              </td>
              <th className="text-[#233da0]">
                <Link
                  to={`/${org}/${classroom}/assignments/${assignment.slug}/submissions`}
                >
                  View &gt;
                </Link>
              </th>
            </tr>
          ))}
        </tbody>
      </div>
    </div>
  )
}

export default AssignmentsTable
