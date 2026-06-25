import { useEffect, useState } from "react"
import Papa from "papaparse"

import {
  ArrowDownWideNarrow,
  Check,
  Copy,
  ExternalLink,
  HardDriveDownload,
  Info,
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
import useTriggerScoreCollection from "@/hooks/useTriggerScoreCollection"
import useGetLastCollectScoresRun from "@/hooks/useGetLastCollectScoresRun"
import { COLLECT_SCORES_WORKFLOW } from "@/hooks/github/mutations"
import { formatDistanceToNow } from "date-fns"

// Re-renders on an interval to keep relative timestamps fresh; returns nothing.
const usePeriodicRerender = (intervalMs = 30_000) => {
  const [, setNow] = useState(() => Date.now())

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

  // Re-render every 30s so the relative "last collected"/"last updated" labels stay fresh.
  usePeriodicRerender()

  const copySubmitLink = async () => {
    await navigator.clipboard.writeText(assignmentSubmitUrl)
    setCopiedSubmitLink(true)

    window.setTimeout(() => {
      setCopiedSubmitLink(false)
    }, 1500)
  }
  const assignmentInfo = assignmentData?.assignments.find(
    (a) => a.slug === assignment,
  )
  const isGroupAssignment = assignmentInfo?.mode === "group"
  const scoresInfo = scoresData?.submissions?.[assignment] || []

  // Roster students with no submission. A student is "credited" if their login
  // appears in any row's `usernames` (which is `member_usernames` for groups,
  // else `[owner]`), so group teammates aren't falsely flagged. Group
  // assignments don't surface an "X of Y" roster denominator, so we only
  // compute non-submitters for individual assignments.
  const creditedUsernames = new Set(
    scoresInfo.flatMap((row) => row.usernames.map((u) => u.toLowerCase())),
  )
  const nonSubmitters = isGroupAssignment
    ? []
    : students.filter(
        (student) => !creditedUsernames.has(student.username.toLowerCase()),
      )

  const collectScores = useTriggerScoreCollection(org)
  const { data: lastRun, refetch: refetchLastRun } =
    useGetLastCollectScoresRun(org)
  const workflowUrl = `https://github.com/${org}/classroom50/actions/workflows/${COLLECT_SCORES_WORKFLOW}`
  const collecting =
    collectScores.phase === "dispatching" || collectScores.phase === "running"

  const lastCollectedLabel =
    lastRun?.status === "completed" && lastRun.created_at
      ? formatDistanceToNow(new Date(lastRun.created_at), { addSuffix: true })
      : null

  // Refresh scores and the last-run timestamp once a manual collection finishes.
  useEffect(() => {
    if (collectScores.phase === "completed") {
      refetchScores()
      refetchLastRun()
    }
  }, [collectScores.phase, refetchScores, refetchLastRun])

  const downloadScoresCsv = () => {
    const submittedRows = scoresInfo
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

    // Append non-submitters so the exported gradebook covers the whole roster.
    // Scored 0 with blank submission fields; pinned after submitters.
    const nonSubmittedRows = nonSubmitters.map((student) => ({
      usernames: student.username,
      score: 0,
      max_score: "",
      submissions: 0,
      submitted_at: "",
      commit: "",
      review: "",
      release: "",
    }))

    const rows = [...submittedRows, ...nonSubmittedRows]

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
              <div className="flex items-center gap-2 pb-10 text-sm text-base-content/70">
                <span>
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
                </span>
                <span>•</span>
                <ArrowDownWideNarrow className="size-4" />
                <span>Sorted by most recent</span>
              </div>
            </div>
            <div className="pt-10">
              <button
                type="button"
                className="btn btn-outline"
                onClick={downloadScoresCsv}
                disabled={!scoresInfo.length && !nonSubmitters.length}
              >
                <HardDriveDownload /> Download Scores (CSV)
              </button>
            </div>
          </div>
          <div className="mb-4 flex flex-col gap-4 rounded-box border border-info/20 bg-info/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 size-5 shrink-0 text-info" />
              <div>
                <p className="text-sm">
                  Submissions are collected automatically, but it can take up to
                  24 hours for new submissions to appear here.
                </p>
                {!collecting && lastCollectedLabel && (
                  <p className="mt-1 text-sm text-base-content/60">
                    Scores last collected (org-wide) {lastCollectedLabel}.
                  </p>
                )}
                {collectScores.phase === "dispatching" && (
                  <p className="mt-1 text-sm text-base-content/70">
                    Starting collection…
                  </p>
                )}
                {collectScores.phase === "running" && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-base-content/70">
                    <span className="loading loading-spinner loading-xs" />
                    Collection in progress. This page will refresh automatically
                    when it finishes.
                  </p>
                )}
                {collectScores.phase === "completed" && (
                  <p className="mt-1 text-sm text-success">
                    Collection finished. Submissions below are up to date.
                  </p>
                )}
                {collectScores.phase === "failed" && (
                  <p className="mt-1 text-sm text-error">
                    {collectScores.error instanceof Error
                      ? `Could not start collection: ${collectScores.error.message}`
                      : "The collection run did not complete successfully."}{" "}
                    You can check or trigger it manually on GitHub.
                  </p>
                )}
                {collectScores.phase === "timeout" && (
                  <p className="mt-1 text-sm text-base-content/70">
                    Still running after a while. Check its progress on GitHub,
                    or refresh this page once it finishes.
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={collecting}
                onClick={() => collectScores.collect()}
              >
                {collecting && (
                  <span className="loading loading-spinner loading-xs" />
                )}
                {collecting ? "Collecting…" : "Collect now"}
              </button>
              <a
                className="btn btn-sm btn-ghost"
                href={collectScores.run?.html_url || workflowUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" />
                {collectScores.run ? "View run" : "View workflow"}
              </a>
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
            nonSubmitters={nonSubmitters}
            isGroup={isGroupAssignment}
            org={org}
            classroom={classroom}
            assignment={assignment}
            assignmentName={assignmentInfo?.name}
            maxGroupSize={assignmentInfo?.max_group_size}
          />
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default SubmissionsPage
