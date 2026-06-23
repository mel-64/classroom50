import { useEffect, useState } from "react"
import Papa from "papaparse"

import {
  ArrowDownWideNarrow,
  Check,
  Copy,
  HardDriveDownload,
  LinkIcon,
  RefreshCw,
} from "lucide-react"
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
import { formatDistanceToNow } from "date-fns"

// utility hook for forcing a component refresh; just grabs current time every X interval
const useNow = (intervalMs = 30_000) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
}

const SubmissionsPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const {
    data: scoresData,
    refetch: refetchScores,
    isFetching: scoresFetching,
    dataUpdatedAt: scoresUpdatedAt,
  } = useGetScores(org, classroom)
  const { data: assignmentData } = useGetClassroomAssignments(org, classroom)
  const { students } = useGetStudents(org, classroom)
  const [copiedSubmitLink, setCopiedSubmitLink] = useState(false)
  const scoresLastUpdated =
    scoresUpdatedAt > 0
      ? formatDistanceToNow(scoresUpdatedAt, { addSuffix: true })
      : "never"

  const assignmentSubmitUrl = `${window.location.origin}/${org}/${classroom}/assignments/${assignment}/accept`

  // simply having this here will trigger a re-render every 30s by default for the refresh label
  const now = useNow()

  const copySubmitLink = async () => {
    await navigator.clipboard.writeText(assignmentSubmitUrl)
    setCopiedSubmitLink(true)

    window.setTimeout(() => {
      setCopiedSubmitLink(false)
    }, 1500)
  }
  const assignmentInfo =
    assignmentData?.assignments.find((a) => a.slug === assignment)
  const isGroupAssignment = assignmentInfo?.mode === "group"
  const scoresInfo = scoresData?.submissions?.[assignment] || []

  const downloadScoresCsv = () => {
    const rows = scoresInfo
      .toSorted(
        (a, b) =>
          new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
      )
      .map(({ usernames, score, datetime, submissionCount, ...rest }) => ({
        usernames: usernames.join(", "),
        score,
        max_score: rest["max-score"],
        submissions: submissionCount,
        submitted_at: new Date(datetime).toISOString(),
        commit: rest.commit,
        review: rest.review,
        release: rest.release,
      }))

    const csv = Papa.unparse(rows, {
      header: true,
    })

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = `${classroom}-${assignment}-scores.csv`
    link.click()

    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="Submissions" />
          <div className="flex justify-between">
            <div>
              <h1 className="text-lg pt-8 pb-2 font-bold">
                {assignmentInfo?.name}
              </h1>
              <div className="flex pb-10">
                <label>
                  {isGroupAssignment ? (
                    <>
                      {scoresInfo.length}{" "}
                      {scoresInfo.length === 1 ? "group" : "groups"} submitted
                    </>
                  ) : (
                    <>
                      {scoresInfo.length} of {students.length} submitted
                    </>
                  )}
                </label>
                <label className="px-2"> • </label>
                <ArrowDownWideNarrow />
                <label>Sorted by most recent</label>
              </div>
            </div>
            <div className="pt-10">
              <button
                type="button"
                className="btn btn-outline"
                onClick={downloadScoresCsv}
                disabled={!scoresInfo.length}
              >
                <HardDriveDownload /> Download Scores (CSV)
              </button>
            </div>
          </div>
          <div className="card bg-base-100 rounded-xl border border-[#eee] mb-4">
            <div className="card-body gap-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <LinkIcon className="size-5" />
                  </div>

                  <div>
                    <h2 className="font-bold">Assignment accept link</h2>
                    <p className="text-sm text-base-content/60">
                      Share this link with students so they can accept this
                      assignment.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between bg-base-200 text-base-content border border-base-300 items-center">
                <pre className="overflow-x-auto px-4 py-3 text-sm">
                  <code>{assignmentSubmitUrl}</code>
                </pre>
                <button
                  type="button"
                  className={`btn ${copiedSubmitLink ? "btn-success" : "btn-primary"} btn-sm btn-outline mr-2`}
                  onClick={copySubmitLink}
                >
                  {copiedSubmitLink ? (
                    <>
                      <Check className="size-4" />
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>{" "}
          <div className="grid grid-cols-12 gap-4 mb-6">
            <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
              <div className="card-body">
                <label className="uppercase">
                  {isGroupAssignment ? "Groups Submitted" : "Submitted"}
                </label>
                <div className="flex items-end content-end gap-1">
                  <h2 className="text-xl font-bold">{scoresInfo.length}</h2>
                  {isGroupAssignment ? null : (
                    <>
                      /<h4>{students.length}</h4>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
              <div className="card-body">
                <label className="uppercase">Class Average</label>
                {!scoresInfo?.[0]?.["max-score"] ? (
                  <h2 className="text-xl">N/A</h2>
                ) : (
                  <div className="flex items-end gap-1">
                    <h2 className="text-xl font-bold">
                      {scoresInfo?.reduce(
                        (a, c) => Number(a) + Number(c["score"]),
                        0,
                      ) / scoresInfo?.length || 1}
                    </h2>
                    /<h4>{scoresInfo?.[0]?.["max-score"]}</h4>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mb-2 flex items-center justify-end gap-1 text-sm text-base-content/60">
            <span>Updated {scoresLastUpdated}</span>

            <button
              type="button"
              className="btn btn-ghost btn-xs btn-circle"
              disabled={scoresFetching}
              onClick={() => refetchScores()}
              aria-label="Refresh submissions"
              title="Refresh submissions"
            >
              <RefreshCw
                size={14}
                className={scoresFetching ? "animate-spin" : ""}
              />
            </button>
          </div>
          <SubmissionsTable
            scores={scoresInfo}
            students={students}
            isGroup={isGroupAssignment}
            org={org}
            classroom={classroom}
            assignment={assignment}
          />
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default SubmissionsPage
