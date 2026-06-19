import AddByGithubUsername from "@/pages/students/AddByGithubUsername"
import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import EnrolledStudents from "@/pages/students/EnrolledStudents"
import UploadRoster from "@/pages/students/UploadRoster"
import { useParams } from "@tanstack/react-router"
import useGetStudents from "@/hooks/useGetStudents"
import useGetClassroom from "@/hooks/useGetClassroom"
import { useGitHubClient } from "@/context/github/GitHubProvider"

const StudentListPage = () => {
  const { org = "", classroom = "" } = useParams({ strict: false })
  const { students } = useGetStudents(org, classroom)
  const { data: classData } = useGetClassroom(org, classroom)
  const client = useGitHubClient()

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="Students" />
          <h1 className="text-lg pt-8 pb-2 font-bold">Students</h1>
          <h3 className="pb-10">
            {students.length} students enrolled in{" "}
            {classData?.name || classData?.short_name || "Untitled class"}
          </h3>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5 px-4">
              <AddByGithubUsername
                org={org}
                classroom={classroom}
                className="mb-8"
              />
              <UploadRoster org={org} classroom={classroom} client={client} />
            </div>
            <div className="col-span-7 px-4">
              <EnrolledStudents
                students={students}
                org={org}
                classroom={classroom}
              />
            </div>
          </div>
        </DrawerContent>
        <DrawerSidebar selected="students" />
      </Drawer>
    </div>
  )
}

export default StudentListPage
