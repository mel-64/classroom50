import { useParams, Link } from "@tanstack/react-router"
import { BookText, UsersRound } from "lucide-react"
import GitHub from "@/assets/github.svg?react"

import useGetClasses from "@/hooks/useGetClasses"
import useGetStudents from "@/hooks/useGetStudents"

import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import type { GitHubFileListing } from "@/hooks/github/types"
import useGetClassroom from "@/hooks/useGetClassroom"

const ClassCard = ({ cl, org }: { cl: GitHubFileListing; org: string }) => {
  const { data: classroomData } = useGetClassroom(org, cl.path)
  const { students } = useGetStudents(org, cl.path)

  return (
    <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
      <div className="card-body gap-4">
        <label
          className={`badge badge-soft ${classroomData?.active ? "badge-success" : "badge-primary"}`}
        >
          {classroomData?.term || "No Term Specified"}
        </label>
        <h1 className="text-xl">
          {classroomData?.name ||
            classroomData?.short_name ||
            "Unknown Class Name"}
        </h1>
        <div className="flex gap-2">
          <UsersRound />
          {students ? `${students.length} Students` : "No Students"}
        </div>
        <div className="flex gap-2">
          <GitHub className="size-4 opacity-25" />
          <pre>{org}</pre>
        </div>
        <Link
          type="button"
          to={`/${org}/${cl.path}/assignments`}
          className="btn btn-outline btn-primary w-full"
        >
          <BookText />
          View Assignments
        </Link>
      </div>
    </div>
  )
}

const ClassesPage = () => {
  const { org } = useParams({ strict: false })
  const { classes } = useGetClasses(org)

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <div className="flex justify-between">
            <div>
              <h1 className="text-lg pt-8 pb-2 font-bold">My Classes</h1>
              <div className="flex pb-10">
                <label>Manage your courses and assignments</label>
              </div>
            </div>
            <div className="pt-10">
              <Link
                type="button"
                to={`/${org}/classes/new`}
                className="btn btn-primary"
              >
                + New Class
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-4 mb-6">
            {classes.map((cl) => (
              <ClassCard cl={cl} org={org} />
            ))}
          </div>
        </DrawerContent>
        <DrawerSidebar page="classes" selected="assignments" />
      </Drawer>
    </div>
  )
}

export default ClassesPage
