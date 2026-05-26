import { ArrowDownWideNarrow, HardDriveDownload } from "lucide-react"
import { useParams } from "@tanstack/react-router"

import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import SubmissionsTable from "@/pages/submissions/SubmissionsTable"
import useGetScores from "@/hooks/useGetScores"
import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"
import useGetStudents from "@/hooks/useGetStudents"

const SubmissionsPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const { data: scoresData } = useGetScores(org, classroom)
  const { data: assignmentData } = useGetClassroomAssignments(org, classroom)
  const { students } = useGetStudents(org, classroom)

  const assignmentInfo =
    assignmentData?.assignments.find((a) => a.slug === assignment) || {}
  const scoresInfo = scoresData?.submissions?.[assignment] || []

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa]">
          <Breadcrumb endpoint="Submissions" />
          <div className="flex justify-between">
            <div>
              <h1 className="text-lg pt-8 pb-2 font-bold">
                {assignmentInfo.name}
              </h1>
              <div className="flex pb-10">
                <label>
                  {scoresInfo.length} of {students.length} submitted
                </label>
                <label className="px-2"> • </label>
                <ArrowDownWideNarrow />
                <label>Sorted by most recent</label>
              </div>
            </div>
            <div className="pt-10">
              <button className="btn btn-outline">
                <HardDriveDownload /> Download Scores (CSV)
              </button>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
              <div className="card-body">
                <label className="uppercase">Submitted</label>
                <div className="flex items-end content-end gap-1">
                  <h2 className="text-xl font-bold">{scoresInfo.length}</h2>/
                  <h4>{students.length}</h4>
                </div>
              </div>
            </div>
            <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
              <div className="card-body">
                <label className="uppercase">Class Average</label>
                <div className="flex items-end gap-1">
                  <h2 className="text-xl font-bold">
                    {scoresInfo?.reduce(
                      (a, c) => Number(a) + Number(c["score"]),
                      0,
                    ) / students.length || 1}
                  </h2>
                  /<h4>{scoresInfo?.[0]?.["max-score"]}</h4>
                </div>
              </div>
            </div>
          </div>
          <SubmissionsTable
            org={org}
            classroom={classroom}
            assignment={assignment}
            scores={scoresInfo}
            students={students}
          />
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default SubmissionsPage
