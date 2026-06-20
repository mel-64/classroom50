import { useNavigate } from "@tanstack/react-router"
import { Pencil, Trash2, UserRound, UsersRound } from "lucide-react"

import useGetScores from "@/hooks/useGetScores"
import { formatDueDate } from "@/util/formatDate"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { ConfirmModal } from "@/components/modals"
import { githubKeys } from "@/hooks/github/queries"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  deleteAssignment,
  type DeleteAssignmentInput,
} from "@/api/mutations/assignments"
import { useGitHubClient } from "@/context/github/GitHubProvider"

const DeleteAssignmentButton = ({
  org,
  classroom,
  assignment,
  onDeleteAssignment,
}) => {
  const client = useGitHubClient()
  const [open, setOpen] = useState(false)
  const deleteAssignmentMutation = useMutation({
    mutationFn: (input: DeleteAssignmentInput) =>
      deleteAssignment(client, input),
    onSuccess: () => onDeleteAssignment(),
  })

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className="btn btn-circle btn-sm btn-ghost text-error"
      >
        <Trash2 className="size-4" />
      </button>

      <ConfirmModal
        open={open}
        title="Delete assignment?"
        description={
          <>
            This will remove the{" "}
            <span className="font-semibold text-base-content">
              {assignment.name || assignment.slug}
            </span>{" "}
            assignment from the{" "}
            <span className="font-semibold text-base-content">
              {org}/{classroom}
            </span>{" "}
            classroom. Student assignment repositories will not be deleted.
          </>
        }
        confirmText={assignment.slug}
        confirmLabel="Delete assignment"
        cancelLabel="Keep assignment"
        dangerous
        onConfirm={async () => {
          await deleteAssignmentMutation.mutateAsync({
            org,
            classroom,
            assignment: assignment.slug,
          })
          onDeleteAssignment()
        }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

const AssignmentsTable = ({ org, classroom, assignments, students = [] }) => {
  const queryClient = useQueryClient()
  const { data: scoresData } = useGetScores(org, classroom)
  const navigate = useNavigate()

  return (
    <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
      <table className="table">
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
            <tr
              key={assignment.slug}
              className="hover:cursor-pointer hover:bg-[#fafafa]"
            >
              <td
                onClick={() =>
                  navigate({
                    to: `/${org}/${classroom}/assignments/${assignment.slug}/submissions`,
                  })
                }
                className="font-bold link link-info no-underline truncate"
              >
                {assignment.name}
              </td>
              <td
                onClick={() =>
                  navigate({
                    to: `/${org}/${classroom}/assignments/${assignment.slug}/submissions`,
                  })
                }
                className="max-xl:text-xs"
              >
                {assignment.mode === "individual" && (
                  <div className="flex gap-2 h-full">
                    <UserRound className="max-xl:size-3" /> Individual
                  </div>
                )}
                {assignment.mode === "group" && (
                  <div className="flex gap-2 h-full">
                    <UsersRound className="max-xl:size-3" /> Group
                  </div>
                )}
              </td>
              <td
                onClick={() =>
                  navigate({
                    to: `/${org}/${classroom}/assignments/${assignment.slug}/submissions`,
                  })
                }
              >
                <span className="badge badge-soft max-xl:text-xs xl:text-sm whitespace-nowrap w-full">
                  {assignment.due
                    ? formatDueDate(assignment.due)
                    : "No due date"}
                </span>
              </td>
              <td
                onClick={() =>
                  navigate({
                    to: `/${org}/${classroom}/assignments/${assignment.slug}/submissions`,
                  })
                }
              >
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
              <td>
                <Link
                  className="btn btn-circle btn-sm btn-ghost"
                  to={`/${org}/${classroom}/assignments/${assignment.slug}/edit`}
                  onClick={(event) => {
                    event.stopPropagation()
                  }}
                >
                  <Pencil className="size-4" />
                </Link>
                <DeleteAssignmentButton
                  org={org}
                  classroom={classroom}
                  assignment={assignment}
                  onDeleteAssignment={() =>
                    queryClient.invalidateQueries({
                      queryKey: githubKeys.jsonFile(
                        org,
                        "classroom50",
                        `${classroom}/assignments.json`,
                      ),
                    })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default AssignmentsTable
