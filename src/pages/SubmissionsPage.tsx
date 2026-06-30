import { useEffect, useMemo, useState } from "react"
import Papa from "papaparse"

import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  HardDriveDownload,
  Info,
  LinkIcon,
  RefreshCw,
} from "lucide-react"
import { useParams, Navigate } from "@tanstack/react-router"

import Breadcrumb from "@/components/breadcrumb"
import MissingParams from "@/components/MissingParams"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import SubmissionsTable from "@/pages/submissions/SubmissionsTable"
import SubmissionsControls from "@/pages/submissions/SubmissionsControls"
import { ConfirmModal } from "@/components/modals"
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  acceptedRosterCount,
  acceptedUsernames,
  buildSectionLookup,
  classAverage,
  computeStats,
  distinctSections,
  filterAndSortRows,
  filterNonSubmitters,
  hasAccepted,
  rowInSection,
  showsNonSubmitters,
  studentInSection,
  type SubmissionFilters,
  type SubmissionSort,
} from "@/pages/submissions/dashboard"
import useGetScores from "@/hooks/useGetScores"
import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"
import useGetClassroom from "@/hooks/useGetClassroom"
import useGetStudents from "@/hooks/useGetStudents"
import useGetOrgRepos from "@/hooks/useGetMyOrgRepos"
import useTriggerScoreCollection from "@/hooks/useTriggerScoreCollection"
import useTriggerRegrade from "@/hooks/useTriggerRegrade"
import { RegradeCoordinatorProvider } from "@/context/regrade/RegradeCoordinator"
import useGetLastCollectScoresRun from "@/hooks/useGetLastCollectScoresRun"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import RoleResolvingFallback from "@/components/RoleResolvingFallback"
import {
  COLLECT_SCORES_WORKFLOW,
  REGRADE_WORKFLOW,
} from "@/hooks/github/mutations"
import { formatDueDateTime } from "@/util/formatDate"
import { formatDistanceToNow } from "date-fns"

// Re-renders on an interval to keep relative timestamps fresh; returns nothing.
const usePeriodicRerender = (intervalMs = 30_000) => {
  const [, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
}

// Shared presentational copy button: a primary outline button that swaps to a
// success check while `copied`. The clipboard state itself is owned by the
// caller (via useCopyToClipboard) so each button tracks its own copy.
const CopyIconButton = ({
  copied,
  onCopy,
  label,
}: {
  copied: boolean
  onCopy: (e: React.MouseEvent<HTMLButtonElement>) => void
  label: string
}) => (
  <button
    type="button"
    className={`btn ${copied ? "btn-success" : "btn-primary"} btn-sm btn-outline mr-2`}
    onClick={onCopy}
    aria-label={label}
    title={label}
  >
    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
  </button>
)

// Shared chrome for the dashboard stat strip: a bordered card with an uppercase
// label. The body (value, denominator, sub-links) varies per stat and is passed
// as children.
const StatCard = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <div className="card bg-base-100 rounded-xl border border-[#eee]">
    <div className="card-body gap-1 p-4">
      <label className="text-xs uppercase tracking-wide text-base-content/50">
        {label}
      </label>
      {children}
    </div>
  </div>
)

const SubmissionsPageContent = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const {
    data: scoresData,
    refetch: refetchScores,
    isFetching: scoresFetching,
    isError: scoresError,
    error: scoresErrorObj,
    dataUpdatedAt: scoresUpdatedAt,
  } = useGetScores(org, classroom)
  const { data: assignmentData } = useGetClassroomAssignments(org, classroom)
  const { students } = useGetStudents(org, classroom)
  // This is a teacher-only page, so reading the classroom's capability-URL
  // secret from the (teacher-readable) classroom.json is fine. When the
  // classroom is protected, the shared accept link must carry the key as
  // `?k=<secret>` — otherwise students hit "assignment not found".
  const { data: classroomMeta } = useGetClassroom(org, classroom)
  const secret = classroomMeta?.secret
  const scoresLastUpdated =
    scoresUpdatedAt > 0
      ? formatDistanceToNow(scoresUpdatedAt, { addSuffix: true })
      : "never"

  const assignmentSubmitUrl =
    `${window.location.origin}/${org}/${classroom}/assignments/${assignment}/accept` +
    (secret ? `?k=${secret}` : "")
  // The CLI equivalent of the browser accept link, for students who prefer it.
  const assignmentSubmitCli =
    `gh student accept ${org} ${classroom} ${assignment}` +
    (secret ? ` --key ${secret}` : "")
  const { copied: copiedSubmitLink, copy: copySubmitLink } = useCopyToClipboard(
    assignmentSubmitUrl,
    1500,
  )
  const { copied: copiedSubmitCli, copy: copySubmitCli } = useCopyToClipboard(
    assignmentSubmitCli,
    1500,
  )

  // Re-render every 30s so the relative "last collected"/"last updated" labels stay fresh.
  usePeriodicRerender()
  const assignmentInfo = assignmentData?.assignments.find(
    (a) => a.slug === assignment,
  )
  const isGroupAssignment = assignmentInfo?.mode === "group"
  const scoresInfo = useMemo(
    () => scoresData?.submissions?.[assignment ?? ""] || [],
    [scoresData, assignment],
  )

  // Count repos whose latest submission landed after the deadline. `late` is
  // computed upstream (collect_scores.py) from the push time, not the grade
  // time, so an on-time push graded after the deadline still counts as on time.
  const lateCount = scoresInfo.filter((row) => row.late).length

  // Roster students with no submission. A student is "credited" if their login
  // appears in any row's `usernames` (which is `member_usernames` for groups,
  // else `[owner]`), so group teammates aren't falsely flagged. Group
  // assignments don't surface an "X of Y" roster denominator, so we only
  // compute non-submitters for individual assignments. Gated on scores having
  // loaded (`scoresData` present): until then `scoresInfo` is empty, which
  // would otherwise flag the entire roster as non-submitters mid-load.
  const scoresLoaded = scoresData !== undefined
  const nonSubmitters = useMemo(() => {
    if (isGroupAssignment || !scoresLoaded) return []
    const credited = new Set(
      scoresInfo.flatMap((row) => row.usernames.map((u) => u.toLowerCase())),
    )
    return students.filter(
      (student) => !credited.has(student.username.toLowerCase()),
    )
  }, [isGroupAssignment, scoresLoaded, scoresInfo, students])

  // Dashboard controls (#59) — all client-side over already-loaded data.
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<SubmissionFilters>(DEFAULT_FILTERS)
  // Drives the "Regrade all" confirmation modal (replaces window.confirm).
  const [regradeConfirmOpen, setRegradeConfirmOpen] = useState(false)
  const [sort, setSort] = useState<SubmissionSort>(DEFAULT_SORT)

  // Deterministic acceptance from the org repo list (see acceptedUsernames);
  // individual assignments only, so the filter is gated on acceptedAvailable.
  const { data: orgRepos } = useGetOrgRepos(org ?? "")
  const acceptedSet = useMemo(
    () =>
      acceptedUsernames(orgRepos, classroom ?? "", assignment ?? "", students),
    [orgRepos, classroom, assignment, students],
  )
  const acceptedAvailable = !isGroupAssignment && orgRepos != null

  // Section filtering: distinct sections for the dropdown, and a username ->
  // section lookup so submitted rows (which carry only logins) can be matched.
  const sections = useMemo(() => distinctSections(students), [students])
  const sectionByUsername = useMemo(
    () => buildSectionLookup(students),
    [students],
  )

  // With a section filter active, scope the roster and rows to that section so
  // the stat cards describe the filtered view, not the whole class.
  const sectionFilter = filters.section
  const scopedStudents = useMemo(
    () =>
      sectionFilter === "all"
        ? students
        : students.filter((s) => studentInSection(s, sectionFilter)),
    [students, sectionFilter],
  )
  const scopedScores = useMemo(
    () =>
      sectionFilter === "all"
        ? scoresInfo
        : scoresInfo.filter((row) =>
            rowInSection(row, sectionFilter, sectionByUsername),
          ),
    [scoresInfo, sectionFilter, sectionByUsername],
  )
  const scopedNonSubmitters = useMemo(
    () =>
      sectionFilter === "all"
        ? nonSubmitters
        : nonSubmitters.filter((s) => studentInSection(s, sectionFilter)),
    [nonSubmitters, sectionFilter],
  )

  // Passing bar as a fraction of max, or null when the teacher didn't opt in
  // (off by default) — then no Passing rollup/filter and neutral badges.
  const passThresholdPct = assignmentInfo?.pass_threshold
  const passingEnabled =
    typeof passThresholdPct === "number" && Number.isFinite(passThresholdPct)
  const thresholdFraction = passingEnabled ? passThresholdPct / 100 : null

  // Top-line counts over the (section-scoped) submitted set + roster size.
  const stats = useMemo(
    () => computeStats(scopedScores, scopedStudents.length, thresholdFraction),
    [scopedScores, scopedStudents, thresholdFraction],
  )

  // Class average over numeric scores in the (section-scoped) set; null -> "N/A".
  const avgScore = useMemo(() => classAverage(scopedScores), [scopedScores])

  // Roster-scoped accepted count (scoped to the active section to match the
  // Accepted card's denominator).
  const acceptedCount = useMemo(
    () => acceptedRosterCount(scopedStudents, acceptedSet),
    [scopedStudents, acceptedSet],
  )

  // Accepted-but-not-submitted count: roster students who accepted (repo
  // exists) but have no submission row. Individual assignments only.
  const acceptedNotSubmittedCount = acceptedAvailable
    ? scopedNonSubmitters.filter((s) => hasAccepted(s.username, acceptedSet))
        .length
    : 0

  // One-click stat shortcuts: jump straight to the students a sub-label calls
  // out. Reset the other axes so the surfaced set matches the label exactly.
  const showFailing = () =>
    setFilters({ ...DEFAULT_FILTERS, passing: "failing" })
  const showAcceptedNotSubmitted = () =>
    setFilters({
      ...DEFAULT_FILTERS,
      accepted: "accepted",
      submission: "not-submitted",
    })

  // Rows actually rendered. When acceptance data isn't loaded yet, neutralize
  // the accepted axis so a transient empty repo list can't flip the visible set.
  const effectiveFilters = useMemo(
    () =>
      acceptedAvailable ? filters : { ...filters, accepted: "all" as const },
    [acceptedAvailable, filters],
  )
  const visibleRows = useMemo(
    () =>
      filterAndSortRows(scoresInfo, {
        query,
        filters: effectiveFilters,
        sort,
        students,
        sectionByUsername,
        thresholdFraction,
      }),
    [
      scoresInfo,
      query,
      effectiveFilters,
      sort,
      students,
      sectionByUsername,
      thresholdFraction,
    ],
  )
  const visibleNonSubmitters = useMemo(
    () =>
      showsNonSubmitters(effectiveFilters)
        ? filterNonSubmitters(
            nonSubmitters,
            query,
            effectiveFilters,
            acceptedSet,
          )
        : [],
    [effectiveFilters, nonSubmitters, query, acceptedSet],
  )

  const collectScores = useTriggerScoreCollection(org)
  const regradeAll = useTriggerRegrade({ org, classroom, assignment })
  // `anyRegrading` covers the whole-assignment regrade AND every per-row
  // regrade (shared via the page coordinator), so collect/regrade controls
  // disable while any regrade is in flight — not just the assignment-wide one.
  const regrading = regradeAll.anyRegrading
  // Whether the assignment-wide "Regrade all" specifically is mid-dispatch, for
  // its own spinner/label (distinct from the page-wide `regrading` gate).
  const regradeAllActive =
    regradeAll.phase === "dispatching" || regradeAll.phase === "running"
  const { data: lastRun, refetch: refetchLastRun } =
    useGetLastCollectScoresRun(org)
  const collectWorkflowUrl = `https://github.com/${org}/classroom50/actions/workflows/${COLLECT_SCORES_WORKFLOW}`
  const regradeWorkflowUrl = `https://github.com/${org}/classroom50/actions/workflows/${REGRADE_WORKFLOW}`
  const collecting =
    collectScores.phase === "dispatching" || collectScores.phase === "running"

  // Which action the single "View …" link points at and which status strip
  // (if any) shows. Running takes precedence; otherwise the most recently
  // finished action; else null (both idle → link defaults to collect). Derived
  // fresh every render so the link can never get "stuck" on a stale action.
  const activeAction: "collect" | "regrade" | null = (() => {
    if (collecting) return "collect"
    if (regrading) return "regrade"
    if (collectScores.phase !== "idle") return "collect"
    if (regradeAll.phase !== "idle") return "regrade"
    return null
  })()

  const isRegradeView = activeAction === "regrade"
  const viewRun = isRegradeView ? regradeAll.run : collectScores.run
  const viewWorkflowUrl = isRegradeView
    ? regradeWorkflowUrl
    : collectWorkflowUrl
  const viewLabel = isRegradeView
    ? viewRun
      ? "View regrade run"
      : "View regrade workflow"
    : viewRun
      ? "View run"
      : "View workflow"

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
      .map(
        ({ usernames, score, datetime, submissionCount, late, ...rest }) => ({
          usernames: usernames.join(", "),
          score,
          max_score: rest["max-score"],
          submissions: submissionCount,
          submitted_at: new Date(datetime).toISOString(),
          late: late ? "yes" : "no",
          commit: rest.commit,
          review: rest.review,
          release: rest.release,
        }),
      )

    // Append non-submitters so the exported gradebook covers the whole roster.
    // Scored 0 with blank submission fields; pinned after submitters.
    const nonSubmittedRows = nonSubmitters.map((student) => ({
      usernames: student.username,
      score: 0,
      max_score: "",
      submissions: 0,
      submitted_at: "",
      late: "",
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

  if (!org || !classroom || !assignment) {
    return (
      <MissingParams message="Missing organization, classroom, or assignment in the URL." />
    )
  }

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="Submissions" />
          {scoresError && (
            <div className="alert alert-error mt-4">
              <div>
                Couldn't load the gradebook
                {scoresErrorObj instanceof Error
                  ? `: ${scoresErrorObj.message}`
                  : "."}{" "}
                The counts below may be incomplete — retry before acting on
                them.
                <button
                  type="button"
                  className="btn btn-sm btn-ghost ml-2"
                  onClick={() => refetchScores()}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          <div className="flex justify-between">
            <div>
              <h1 className="text-lg pt-8 pb-2 font-bold">
                {assignmentInfo?.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 pb-10 text-sm text-base-content/70">
                <span>
                  {assignmentInfo?.due
                    ? `Due ${formatDueDateTime(assignmentInfo.due)}`
                    : "No due date"}
                </span>
                {lateCount > 0 && (
                  <span className="badge badge-sm badge-error badge-soft">
                    {lateCount} late
                  </span>
                )}
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
          <div className="mb-4 rounded-box border border-info/20 bg-info/5">
            {/* Compact action bar: standing note on the left, the two actions
                + a single contextual View link on the right. */}
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 size-5 shrink-0 text-info" />
                <p className="text-sm text-base-content/70">
                  Submissions are collected automatically, but new ones can take
                  up to 24 hours to appear.{" "}
                  {!collecting &&
                    !regrading &&
                    activeAction === null &&
                    lastCollectedLabel && (
                      <span className="text-base-content/60">
                        Last collected (org-wide) {lastCollectedLabel}.
                      </span>
                    )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={regrading || collecting}
                  title={
                    collecting
                      ? "Wait for collection to finish before regrading"
                      : regrading
                        ? "A regrade is already in progress"
                        : "Re-run the autograder on every submitted repo (submission times don’t change)"
                  }
                  onClick={() => {
                    if (regrading || collecting) return
                    setRegradeConfirmOpen(true)
                  }}
                >
                  {regradeAllActive && (
                    <span className="loading loading-spinner loading-xs" />
                  )}
                  {regradeAllActive ? "Regrading…" : "Regrade all"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={collecting || regrading}
                  title={
                    regrading
                      ? "Wait for the regrade to finish before collecting"
                      : "Collect submissions now"
                  }
                  onClick={() => collectScores.collect()}
                >
                  {collecting && (
                    <span className="loading loading-spinner loading-xs" />
                  )}
                  {collecting ? "Collecting…" : "Collect now"}
                </button>
                <a
                  className="btn btn-sm btn-ghost"
                  href={viewRun?.html_url || viewWorkflowUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" />
                  {viewLabel}
                </a>
              </div>
            </div>

            {/* Status strip — only when an action is active or recently
                finished. Color + copy reflect that one action. */}
            {activeAction === "collect" && collectScores.phase !== "idle" && (
              <div
                className="border-t border-info/20 px-4 py-2 text-sm"
                role="status"
                aria-live="polite"
              >
                {collectScores.phase === "dispatching" && (
                  <span className="text-base-content/70">
                    Starting collection…
                  </span>
                )}
                {collectScores.phase === "running" && (
                  <span className="flex items-center gap-1.5 text-base-content/70">
                    <span className="loading loading-spinner loading-xs" />
                    Collection in progress. This page refreshes automatically
                    when it finishes.
                  </span>
                )}
                {collectScores.phase === "completed" && (
                  <span className="text-success">
                    Collection finished. Submissions below are up to date.
                  </span>
                )}
                {collectScores.phase === "failed" && (
                  <span className="text-error">
                    {collectScores.error instanceof Error
                      ? `Could not start collection: ${collectScores.error.message}`
                      : "The collection run did not complete successfully."}{" "}
                    You can check or trigger it manually on GitHub.
                  </span>
                )}
                {collectScores.phase === "timeout" && (
                  <span className="text-base-content/70">
                    Still running after a while. Check its progress on GitHub,
                    or refresh this page once it finishes.
                  </span>
                )}
              </div>
            )}
            {activeAction === "regrade" && regradeAll.phase !== "idle" && (
              <div
                className={`border-t px-4 py-2 text-sm ${
                  regradeAll.phase === "failed"
                    ? "border-error/20 text-error"
                    : regradeAll.phase === "completed"
                      ? "border-success/20 text-success"
                      : "border-warning/20 text-base-content/70"
                }`}
                role="status"
                aria-live="polite"
              >
                {regradeAll.phase === "dispatching" && (
                  <span>Starting regrade…</span>
                )}
                {regradeAll.phase === "running" && (
                  <span className="flex items-center gap-1.5">
                    <span className="loading loading-spinner loading-xs" />
                    Regrade in progress. Re-running the autograder for each
                    submitted repo; collection is paused until it finishes.
                  </span>
                )}
                {regradeAll.phase === "completed" && (
                  <span>
                    Regrade started — each repo is re-grading in the background.
                    Click <span className="font-semibold">Collect now</span> in
                    a few minutes to pull the new scores.
                  </span>
                )}
                {regradeAll.phase === "failed" && (
                  <span>
                    {regradeAll.error instanceof Error
                      ? `Could not start the regrade: ${regradeAll.error.message}`
                      : "The regrade run did not start successfully."}{" "}
                    Check the workflow on GitHub, then try again.
                  </span>
                )}
                {regradeAll.phase === "timeout" && (
                  <span>
                    The regrade is taking a while to register. Check its
                    progress on GitHub.
                  </span>
                )}
              </div>
            )}
          </div>
          <details className="card bg-base-100 rounded-xl border border-[#eee] mb-4 group">
            <summary className="card-body flex-row items-center gap-3 cursor-pointer list-none py-4">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <LinkIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">How students accept</h2>
                <p className="text-sm text-base-content/60">
                  Share an invite link or CLI command so students can accept
                  this assignment.
                </p>
              </div>
              <CopyIconButton
                copied={copiedSubmitLink}
                onCopy={(e) => {
                  e.preventDefault()
                  copySubmitLink()
                }}
                label="Copy accept link"
              />
              <ChevronRight className="size-5 shrink-0 text-base-content/40 transition-transform group-open:rotate-90" />
            </summary>
            <div className="card-body gap-4 pt-0">
              {secret ? (
                <p className="text-sm text-base-content/60">
                  This classroom uses an unlisted URL, so the link includes the
                  access key — treat it like a shared password and send the full
                  link as-is.
                </p>
              ) : null}

              <div className="flex justify-between bg-base-200 text-base-content border border-base-300 items-center">
                <pre className="overflow-x-auto px-4 py-3 text-sm">
                  <code>{assignmentSubmitUrl}</code>
                </pre>
                <CopyIconButton
                  copied={copiedSubmitLink}
                  onCopy={copySubmitLink}
                  label="Copy accept link"
                />
              </div>

              <details className="group/cli">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm text-base-content/60 hover:text-base-content">
                  <ChevronRight className="size-4 transition-transform group-open/cli:rotate-90" />
                  Prefer the command line?
                </summary>
                <div className="mt-2 flex justify-between bg-base-200 text-base-content border border-base-300 items-center">
                  <pre className="overflow-x-auto px-4 py-3 text-sm">
                    <code>{assignmentSubmitCli}</code>
                  </pre>
                  <CopyIconButton
                    copied={copiedSubmitCli}
                    onCopy={copySubmitCli}
                    label="Copy CLI command"
                  />
                </div>
              </details>
            </div>
          </details>{" "}
          <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
            <StatCard
              label={isGroupAssignment ? "Groups Submitted" : "Submitted"}
            >
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{stats.submitted}</span>
                {isGroupAssignment ? null : (
                  <span className="text-base-content/50">
                    / {scopedStudents.length}
                  </span>
                )}
              </div>
            </StatCard>
            <StatCard label="Class Average">
              {!scopedScores?.[0]?.["max-score"] ? (
                <span className="text-2xl font-bold">N/A</span>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">
                    {avgScore ?? "N/A"}
                  </span>
                  <span className="text-base-content/50">
                    / {scopedScores?.[0]?.["max-score"]}
                  </span>
                </div>
              )}
            </StatCard>
            {passingEnabled && (
              <StatCard label="Passing">
                {stats.passing + stats.failing === 0 ? (
                  <span className="text-2xl font-bold">N/A</span>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">
                        {stats.passing}
                      </span>
                      <span className="text-base-content/50">
                        / {stats.passing + stats.failing}
                      </span>
                    </div>
                    <span className="text-xs text-base-content/50">
                      {stats.failing > 0 ? (
                        <button
                          type="button"
                          className="link link-hover decoration-dotted underline-offset-2 hover:text-error"
                          onClick={showFailing}
                          title="Show failing students"
                        >
                          {stats.failing} failing
                        </button>
                      ) : (
                        <>{stats.failing} failing</>
                      )}
                      {stats.ungraded > 0 ? `, ${stats.ungraded} ungraded` : ""}
                    </span>
                  </>
                )}
              </StatCard>
            )}
            {acceptedAvailable ? (
              <StatCard label="Accepted">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">{acceptedCount}</span>
                  <span className="text-base-content/50">
                    / {scopedStudents.length}
                  </span>
                </div>
                {acceptedNotSubmittedCount > 0 && (
                  <button
                    type="button"
                    className="link link-hover w-fit text-xs text-base-content/50 decoration-dotted underline-offset-2 hover:text-warning"
                    onClick={showAcceptedNotSubmitted}
                    title="Show students who accepted but haven't submitted"
                  >
                    {acceptedNotSubmittedCount} not yet submitted
                  </button>
                )}
              </StatCard>
            ) : null}
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
          <SubmissionsControls
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            isGroup={isGroupAssignment}
            acceptedAvailable={acceptedAvailable}
            passingAvailable={passingEnabled}
            sections={sections}
          />
          <SubmissionsTable
            scores={visibleRows}
            students={students}
            nonSubmitters={visibleNonSubmitters}
            isGroup={isGroupAssignment}
            org={org}
            classroom={classroom}
            assignment={assignment}
            assignmentName={assignmentInfo?.name}
            maxGroupSize={assignmentInfo?.max_group_size}
            acceptedUsernames={acceptedAvailable ? acceptedSet : undefined}
            thresholdFraction={thresholdFraction}
          />
          <ConfirmModal
            open={regradeConfirmOpen}
            title={`Regrade all submissions for “${assignmentInfo?.name ?? assignment}”?`}
            description={
              <>
                This re-runs the autograder on every submitted repo&apos;s
                latest commit — useful after fixing a test or updating the
                autograder. Submission times don&apos;t change.
                <br />
                <br />
                Grading runs in the background and can take several minutes; use{" "}
                <span className="font-semibold">Collect now</span> afterward to
                pull the new scores.
              </>
            }
            confirmText="regrade"
            confirmLabel="Regrade all"
            cancelLabel="Cancel"
            dangerous={false}
            needsConfirm={false}
            onConfirm={async () => {
              regradeAll.regrade()
            }}
            onClose={() => setRegradeConfirmOpen(false)}
          />
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

// The teacher gradebook. Students who land here directly (e.g. an old link)
// are redirected to their own submission view; we wait for the role to resolve
// so a real teacher never bounces. Gating here (before mounting the content)
// also avoids firing the teacher-only score/roster reads for a student.
const SubmissionsPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const { showTeacherUi, roleResolved } = useCourseTeacherAccess(org)

  if (!roleResolved) {
    return <RoleResolvingFallback className="min-h-screen" />
  }

  if (!showTeacherUi && org && classroom && assignment) {
    return (
      <Navigate
        to="/$org/$classroom/assignments/$assignment/submission"
        params={{ org, classroom, assignment }}
        replace
      />
    )
  }

  return (
    <RegradeCoordinatorProvider>
      <SubmissionsPageContent />
    </RegradeCoordinatorProvider>
  )
}

export default SubmissionsPage
