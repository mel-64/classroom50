import AddStudent from "@/pages/students/AddStudent"
import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import EnrolledStudents from "@/pages/students/EnrolledStudents"
import UploadRoster from "@/pages/students/UploadRoster"
import { useParams } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import useGetStudents, { useUpdateRosterCache } from "@/hooks/useGetStudents"
import useGetClassroom from "@/hooks/useGetClassroom"
import { invalidateInviteQueries } from "@/hooks/github/queries"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import RequireTeacher from "@/components/RequireTeacher"
import type { Student } from "@/types/classroom"

const StudentListContent = ({
  org,
  classroom,
}: {
  org: string
  classroom: string
}) => {
  const { students } = useGetStudents(org, classroom)
  const { data: classData } = useGetClassroom(org, classroom)
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const updateRosterCache = useUpdateRosterCache(org, classroom)

  // "Enrolled" is the CSV's authoritative completed-enrollment signal; awaiting
  // and ready-to-confirm rows are on the roster but not yet enrolled, so the
  // total roster size would over-count. (EnrolledStudents refines this set into
  // member/removed by live membership, but the count of the set is the same.)
  const enrolledCount = students.filter(
    (student) => student.enrollment_status === "enrolled",
  ).length
  const className = classData?.name || classData?.short_name || "Untitled class"

  return (
    <>
      <h1 className="text-lg pt-8 pb-2 font-bold">Students</h1>
      <h3 className="pb-10">
        {enrolledCount} {enrolledCount === 1 ? "student" : "students"} enrolled
        in {className}
      </h3>
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-5 px-4">
          <AddStudent org={org} classroom={classroom} className="mb-8" />
          <UploadRoster
            org={org}
            classroom={classroom}
            client={client}
            onSuccess={(result) => {
              // Show the imported rows immediately (GitHub's Contents API may
              // still serve the pre-commit students.csv for a few seconds).
              if (result.addedStudents.length > 0) {
                updateRosterCache((current) => [
                  ...current,
                  ...(result.addedStudents as Student[]),
                ])
              }
              invalidateInviteQueries(queryClient, org)
            }}
          />
        </div>
        <div className="col-span-7 px-4">
          <EnrolledStudents
            students={students}
            org={org}
            classroom={classroom}
          />
        </div>
      </div>
    </>
  )
}

const StudentListPage = () => {
  const { org = "", classroom = "" } = useParams({ strict: false })

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="Students" />
          <RequireTeacher>
            <StudentListContent org={org} classroom={classroom} />
          </RequireTeacher>
        </DrawerContent>
        <DrawerSidebar selected="students" />
      </Drawer>
    </div>
  )
}

export default StudentListPage
