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
          <div className="mb-8">
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <GitHub className="size-5 opacity-70" />

                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                      GitHub Organization
                    </div>
                    <div className="font-mono text-sm font-semibold text-base-content">
                      {org}
                    </div>
                  </div>
                </div>

                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    My Classes
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-base-content/60">
                    Manage your courses and assignments.
                  </p>
                </div>
              </div>

              <div className="flex sm:self-end">
                <Link
                  type="button"
                  to={`/${org}/classes/new`}
                  className="btn btn-primary"
                >
                  + New Class
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 mb-6">
            {classes.map((cl) => (
              <ClassCard key={cl.path} cl={cl} org={org} />
            ))}
          </div>
        </DrawerContent>
        <DrawerSidebar page="classes" selected="assignments" />
      </Drawer>
    </div>
  )
}

export default ClassesPage
