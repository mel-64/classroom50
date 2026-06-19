import { Trash } from "lucide-react"

import { getName, getInitials } from "@/util/students"
import Avatar from "@/components/avatar"
import type { Student } from "@/types/classroom"
import { ConfirmModal } from "@/components/modals"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { unenrollStudent } from "@/api/mutations/students"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { githubKeys } from "@/hooks/github/queries"
import { useState } from "react"

const UnenrollStudentButton = ({
  org,
  classroom,
  student,
  onRemoveStudent,
}) => {
  const client = useGitHubClient()
  const unenrollStudentMutation = useMutation({
    mutationFn: (input) => unenrollStudent(client, input),
  })
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn btn-ghost btn-square text-error"
      >
        <Trash />
      </button>

      <ConfirmModal
        open={open}
        title="Unenroll student from roster?"
        description={
          <>
            This will remove student{" "}
            <span className="font-semibold text-base-content">
              {student.username}
            </span>{" "}
            from the{" "}
            <span className="font-semibold text-base-content">{org}</span>{" "}
            {classroom} classroom. Student assignment repositories will not be
            deleted.
          </>
        }
        confirmText={student.username}
        confirmLabel="Unenroll student"
        cancelLabel="Keep student"
        dangerous
        needsConfirm={false}
        onConfirm={async () => {
          await unenrollStudentMutation.mutateAsync({
            org,
            classroom,
            student,
          })
          onRemoveStudent()
        }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

const EnrolledStudents = ({
  students = [],
  org,
  classroom,
}: {
  students: Student[]
  org: string
  classroom: string
}) => {
  const queryClient = useQueryClient()
  return (
    <div className="card card-border w-full bg-base-100 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
        <h2 className="text-lg font-semibold">Enrolled Students</h2>

        <div className="badge badge-primary badge-soft text-base">
          {students.length}
        </div>
      </div>

      <ul className="divide-y divide-base-300">
        {students?.map((student) => (
          <li
            key={student.username}
            className="flex items-center gap-4 px-6 py-4 justify-between"
          >
            <Avatar
              name={getName(student.username, students)}
              github={student.username}
              initials={getInitials(student.username, students)}
            />
            <UnenrollStudentButton
              org={org}
              classroom={classroom}
              student={student}
              onRemoveStudent={() =>
                queryClient.invalidateQueries({
                  queryKey: githubKeys.csvFile(
                    org,
                    "classroom50",
                    `${classroom}/students.csv`,
                  ),
                })
              }
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default EnrolledStudents
