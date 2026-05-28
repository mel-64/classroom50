import { Link } from "@tanstack/react-router"
import { UserRound, UsersRound } from "lucide-react"

import useGetScores from "@/hooks/useGetScores"
import { useEffect } from "react"

const AssignmentsTable = ({ org, classroom, assignments, students = [] }) => {
  const { data: scoresData } = useGetScores(org, classroom)

  useEffect(() => {
    console.log("scores data", scoresData)
  }, [scoresData])
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
          {assignments?.map((assignment) => (
            <tr>
              <td>{assignment.name}</td>
              <td className="flex">
                {assignment.mode === "individual" && (
                  <>
                    <UserRound /> Individual Assignment
                  </>
                )}
                {assignment.mode === "group" && (
                  <>
                    <UsersRound /> Group Assignment
                  </>
                )}
              </td>
              <td>
                {/* TODO: decide how due dates are stored in assignments schema? */}
                <span className="badge badge-soft">
                  {assignment.due_date || "Jun 1, 2026"}
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
                      : (scoresData?.submissions?.[assignment.slug]?.length ||
                          0 / students.length) * 100
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
