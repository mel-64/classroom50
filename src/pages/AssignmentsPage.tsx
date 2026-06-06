import { useEffect } from "react"
import { Link, useParams } from "@tanstack/react-router"

import AssignmentsTable from "@/pages/assignments/AssignmentsTable"
import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"
import useGetStudents from "@/hooks/useGetStudents"
import useGetClassroom from "@/hooks/useGetClassroom"

const AssignmentsPage = () => {
  const { org, classroom } = useParams({ strict: false })
  const { data: classData } = useGetClassroomAssignments(org, classroom)
  const { students } = useGetStudents(org, classroom)
  const { data: classroomData } = useGetClassroom(org, classroom)

  useEffect(() => {
    console.log("assignment data", classData)
  }, [classData])

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb />
          <div className="flex justify-between">
            <div>
              <h1 className="text-lg pt-8 pb-2 font-bold">
                {classroomData?.name}
              </h1>
              <h3 className="pb-10">
                {classroomData?.term ? `${classroomData?.term} • ` : ""}
                {students.length} Students
              </h3>
            </div>
            <div className="pt-10">
              <Link to={`/${org}/${classroom}/assignments/new`}>
                <button className="btn btn-primary">+ Assignment</button>
              </Link>
            </div>
          </div>
          <AssignmentsTable
            org={org}
            classroom={classroom}
            assignments={classData?.assignments}
            students={students}
          />
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default AssignmentsPage
