import { Link, useParams } from "@tanstack/react-router"
import { ChevronDown, Copy, Plus } from "lucide-react"
import { useState } from "react"

import AssignmentsTable from "@/pages/assignments/AssignmentsTable"
import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { ReuseFromClassroomModal } from "@/components/modals/ReuseFromClassroomModal"
import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"
import useGetStudents from "@/hooks/useGetStudents"
import useGetClassroom from "@/hooks/useGetClassroom"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import { OrgRepos } from "./ClassesPage"

// Split button: primary "Assignment" creates; the caret reveals "Reuse
// assignment", which pulls one from another classroom into this one.
const NewAssignmentButton = ({
  org,
  classroom,
}: {
  org: string
  classroom: string
}) => {
  const [reuseOpen, setReuseOpen] = useState(false)

  return (
    <>
      <div className="join">
        <Link
          to="/$org/$classroom/assignments/new"
          params={{ org, classroom }}
          className="btn btn-primary join-item"
        >
          <Plus className="size-4" /> Assignment
        </Link>
        <div className="dropdown dropdown-end join-item">
          <button
            tabIndex={0}
            className="btn btn-primary join-item border-l border-primary-content/20 px-2"
            aria-label="More assignment options"
          >
            <ChevronDown className="size-4" />
          </button>
          <ul
            tabIndex={0}
            className="dropdown-content menu z-10 mt-1 w-max rounded-box border border-base-content/5 bg-base-100 p-1 shadow"
          >
            <li>
              <button
                type="button"
                onClick={() => {
                  // Close the dropdown before opening the modal so focus
                  // doesn't fight the dialog.
                  ;(document.activeElement as HTMLElement | null)?.blur()
                  setReuseOpen(true)
                }}
              >
                <Copy className="size-4" /> Reuse assignment
              </button>
            </li>
          </ul>
        </div>
      </div>

      {reuseOpen ? (
        <ReuseFromClassroomModal
          org={org}
          classroom={classroom}
          onClose={() => setReuseOpen(false)}
        />
      ) : null}
    </>
  )
}

const TeacherAssignmentsView = ({
  org,
  classroom,
}: {
  org: string
  classroom: string
}) => {
  const { data: classData, isLoading: assignmentsLoading } =
    useGetClassroomAssignments(org, classroom)
  const { students, isLoading: studentsLoading } = useGetStudents(
    org,
    classroom,
  )
  const { data: classroomData, isLoading: classroomLoading } = useGetClassroom(
    org,
    classroom,
  )

  return (
    <div>
      <div className="flex justify-between">
        <div>
          {classroomLoading ? (
            <div className="skeleton mt-8 mb-2 h-6 w-48" />
          ) : (
            <h1 className="text-lg pt-8 pb-2 font-bold">
              {classroomData?.name || classroomData?.short_name || classroom}
            </h1>
          )}
          <h3 className="pb-10">
            {classroomData?.term ? `${classroomData?.term} • ` : ""}
            {studentsLoading ? "…" : students.length} Students
          </h3>
        </div>
        <div className="pt-10">
          <NewAssignmentButton org={org} classroom={classroom} />
        </div>
      </div>
      <AssignmentsTable
        org={org}
        classroom={classroom}
        assignments={classData?.assignments}
        students={students}
        loading={assignmentsLoading}
      />
    </div>
  )
}

const StudentAssignmentsView = ({
  org,
  classroom,
}: {
  org: string
  classroom: string
}) => {
  return (
    <div>
      <h1 className="text-2xl font-bold mt-6">Classroom Assignments</h1>
      <label className="text-sm label mb-6">
        View all assignments for the{" "}
        <span className="font-bold">{classroom}</span> classroom.
      </label>
      <OrgRepos org={org} classroom={classroom} />
    </div>
  )
}

const AssignmentsPage = () => {
  const { org, classroom } = useParams({ strict: false })
  const {
    isTeacher,
    isStudent,
    isLoading: roleLoading,
  } = useCourseTeacherAccess(org)

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="Assignments" />
          {roleLoading && (
            <div className="mt-8 space-y-4">
              <div className="skeleton h-6 w-48" />
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-64 w-full rounded-box" />
            </div>
          )}
          {!roleLoading && isTeacher && org && classroom && (
            <TeacherAssignmentsView org={org} classroom={classroom} />
          )}
          {!roleLoading && isStudent && org && classroom && (
            <StudentAssignmentsView org={org} classroom={classroom} />
          )}
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default AssignmentsPage
