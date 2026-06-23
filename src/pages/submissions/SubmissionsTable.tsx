import {
  ChartColumnIncreasing,
  ChevronRight,
  MessageCircle,
  SquareArrowOutUpRight,
} from "lucide-react"
import { Fragment, useRef, useState } from "react"

import GitHub from "@/assets/github.svg?react"
import { getName, getInitials } from "@/util/students"
import { studentRepoName, studentRepoUrl } from "@/util/studentRepo"
import Avatar from "@/components/avatar"
import type { SubmissionAttempt, SubmissionRow } from "@/hooks/useGetScores"
import useGetFeedbackPr from "@/hooks/useGetFeedbackPr"
import type { Student } from "@/types/classroom"

const formatDateTime = (datetime: string) =>
  new Date(datetime).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })

// <= 50% = red
// >= 60% = yellow
// >= 70% = green
// A vacuous/ungraded result (no autograder) has max === 0; show it neutral
// rather than letting NaN% fall through to green.
const scoreToBadgeType = (score: number, max: number) => {
  if (!max) return "badge-ghost"

  const percent = (score / max) * 100

  if (percent <= 50) return "badge-error"
  if (percent < 70) return "badge-warning"
  return "badge-success"
}

// A compact initials bubble with a tooltip naming the member — keeps a
// multi-member group row tight, moving identity into hover.
const MiniAvatar = ({
  username,
  students,
}: {
  username: string
  students: Student[]
}) => {
  const name = getName(username, students)
  const label = name ? `${name} · ${username}` : username
  return (
    <div className="tooltip" data-tip={label}>
      <div className="avatar avatar-placeholder">
        <div className="bg-base-200 text-primary rounded-full w-7 ring-2 ring-base-100">
          <span className="text-xs">
            {getInitials(username, students) || username.at(0)?.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}

// A group submission credits every rostered collaborator. Compact layout: the
// shared repo (the real group identity) on top, then an overlapping avatar
// stack with member names in per-avatar tooltips.
const GroupMembers = ({
  usernames,
  students,
  repoHref,
  repoLabel,
}: {
  usernames: string[]
  students: Student[]
  repoHref: string
  repoLabel: string
}) => (
  <div className="flex flex-col gap-1.5">
    <a
      className="flex items-center gap-1.5 link link-hover w-fit font-medium"
      href={repoHref}
      target="_blank"
      rel="noreferrer"
      title="Open the shared group repository"
    >
      <GitHub className="size-4 shrink-0" />
      <span className="font-mono text-sm">{repoLabel}</span>
    </a>

    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {usernames.map((username) => (
          <MiniAvatar key={username} username={username} students={students} />
        ))}
      </div>
      <span className="text-xs text-base-content/60">
        {usernames.length} {usernames.length === 1 ? "member" : "members"}
      </span>
    </div>
  </div>
)

// Review action: links to the open Feedback PR (opened by the autograde
// workflow) when one exists, else opens an info modal. The PR is the source of
// truth — the old scores.json `review` compare-link is unused.
//
// The /pulls lookup is deferred until Review is clicked; an eager per-row query
// would fan out to one request per repo on table mount. On click we refetch and
// act on the result.
const ReviewButton = ({ org, repo }: { org: string; repo: string }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [resolving, setResolving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // enabled: false — driven by refetch() on click, never on mount.
  const { refetch } = useGetFeedbackPr(org, repo, false)

  const handleReview = async () => {
    setResolving(true)
    try {
      // getOpenPullRequests maps 404 -> [], so a non-404 failure surfaces here
      // as `error`; show it rather than the misleading "no PR yet" message.
      const { data: pr, error } = await refetch()
      if (error) {
        setErrorMsg(error instanceof Error ? error.message : String(error))
        dialogRef.current?.showModal()
      } else if (pr) {
        window.open(pr.html_url, "_blank", "noopener,noreferrer")
      } else {
        setErrorMsg(null)
        dialogRef.current?.showModal()
      }
    } finally {
      setResolving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="flex gap-2 text-base-content/70 hover:text-base-content disabled:opacity-60"
        disabled={resolving}
        onClick={handleReview}
      >
        {resolving ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <MessageCircle />
        )}
        <span>Review</span>
      </button>
      <dialog ref={dialogRef} className="modal">
        <div className="modal-box max-w-md">
          {errorMsg ? (
            <>
              <h3 className="text-lg font-bold">
                Couldn't check for a feedback PR
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-base-content/70">
                {errorMsg}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold">
                No feedback pull request yet
              </h3>
              <p className="mt-2 text-sm leading-6 text-base-content/70">
                No Feedback PR has been opened for{" "}
                <span className="font-mono">{repo}</span> yet. It's created by
                the assignment's autograde workflow after a graded submission —
                if the student hasn't submitted (or the assignment has the
                Feedback PR disabled), there's nothing to review yet.
              </p>
            </>
          )}
          <div className="modal-action">
            <a
              className="btn btn-ghost btn-sm"
              href={`https://github.com/${org}/${repo}/pulls`}
              target="_blank"
              rel="noreferrer"
            >
              Open repo PRs
            </a>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  )
}

// Expanded per-row history: every submission for a repo, newest first.
const SubmissionHistory = ({
  submissions,
  repoHref,
  isGroup,
  students,
}: {
  submissions: SubmissionAttempt[]
  repoHref: string
  isGroup: boolean
  students: Student[]
}) => (
  <ol className="flex flex-col gap-2">
    {submissions.map((s, i) => (
      <li
        key={`${s.datetime}-${s.commit}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-box border border-base-content/5 bg-base-100 px-3 py-2 text-sm"
      >
        <span className="text-base-content/50 w-6 shrink-0">
          #{submissions.length - i}
        </span>
        <span className="w-44 shrink-0">{formatDateTime(s.datetime)}</span>
        <span
          className={`badge badge-soft badge-sm ${scoreToBadgeType(s.score, s["max-score"])}`}
        >
          {s.score}/{s["max-score"]}
        </span>
        {s.late ? (
          <span className="badge badge-sm badge-warning badge-soft">Late</span>
        ) : null}
        {isGroup && s.submittedBy ? (
          <span className="text-base-content/60">
            by {getName(s.submittedBy, students) || s.submittedBy}
          </span>
        ) : null}
        <span className="ml-auto flex gap-3">
          <a
            className="link link-hover inline-flex items-center gap-1"
            href={s.commit}
            target="_blank"
            rel="noreferrer"
          >
            <SquareArrowOutUpRight className="size-3.5" />
            Commit
          </a>
          <a
            className="link link-hover inline-flex items-center gap-1"
            href={s.release}
            target="_blank"
            rel="noreferrer"
          >
            <ChartColumnIncreasing className="size-3.5" />
            Details
          </a>
        </span>
      </li>
    ))}
    <li className="text-xs text-base-content/50">
      Open the{" "}
      <a className="link" href={repoHref} target="_blank" rel="noreferrer">
        repository
      </a>{" "}
      for the full commit history.
    </li>
  </ol>
)

const SubmissionsTable = ({
  scores,
  students,
  isGroup = false,
  org,
  classroom,
  assignment,
}: {
  scores: SubmissionRow[]
  students: Student[]
  isGroup?: boolean
  org: string
  classroom: string
  assignment: string
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (owner: string) =>
    setExpanded((prev) => ({ ...prev, [owner]: !prev[owner] }))

  return (
    <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
      <table className="table">
        <thead>
          <tr>
            <th>{isGroup ? "Group" : "Student"}</th>
            <th>Submissions</th>
            <th>Score</th>
            <th>Last Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {!scores?.length && (
            <tr>
              <td colSpan={5} className="text-center">
                No scores submitted!
              </td>
            </tr>
          )}
          {scores
            .slice()
            .sort(
              (a, b) =>
                new Date(a.datetime).getTime() -
                new Date(b.datetime).getTime(),
            )
            .toReversed()
            .map(({ usernames, score, datetime, submissionCount, ...rest }) => {
              const repo = studentRepoName(classroom, assignment, rest.owner)
              const repoHref = studentRepoUrl(org, classroom, assignment, rest.owner)
              const canExpand = submissionCount > 1
              const isOpen = !!expanded[rest.owner]
              return (
              <Fragment key={rest.owner}>
              <tr>
                <td>
                  {isGroup ? (
                    <GroupMembers
                      usernames={usernames}
                      students={students}
                      repoHref={repoHref}
                      repoLabel={repo}
                    />
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Avatar
                        name={getName(usernames[0], students)}
                        initials={getInitials(usernames[0], students)}
                        github={usernames[0]}
                      />
                      <a
                        className="flex items-center gap-1 text-sm link link-hover w-fit text-base-content/70"
                        href={repoHref}
                        target="_blank"
                        rel="noreferrer"
                        title="Open the student repository"
                      >
                        <GitHub className="size-4" />
                        <span className="font-mono">{repo}</span>
                      </a>
                    </div>
                  )}
                </td>
                <td>
                  {canExpand ? (
                    <button
                      type="button"
                      className="badge max-xl:text-xs whitespace-nowrap gap-1 hover:badge-neutral cursor-pointer"
                      aria-expanded={isOpen}
                      title={isOpen ? "Hide submissions" : "Show all submissions"}
                      onClick={() => toggle(rest.owner)}
                    >
                      <ChevronRight
                        className={`size-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      {submissionCount} Submissions
                    </button>
                  ) : (
                    <label className="badge max-xl:text-xs whitespace-nowrap">
                      {submissionCount} Submission
                    </label>
                  )}
                </td>
                <td>
                  <label
                    className={`badge badge-soft ${scoreToBadgeType(score, rest["max-score"])}`}
                  >
                    {score}/{rest["max-score"]}
                  </label>
                </td>
                <td>{formatDateTime(datetime)}</td>
                <td>
                  <div className="flex gap-4 max-xl:[&>div>a]:flex-col">
                    <div>
                      <a
                        className="flex gap-2"
                        href={rest.commit}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <SquareArrowOutUpRight />
                        <span>Commit</span>
                      </a>
                    </div>
                    <div>
                      <ReviewButton org={org} repo={repo} />
                    </div>
                    <div>
                      <a
                        className="flex gap-2"
                        href={rest.release}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ChartColumnIncreasing />
                        <span>Details</span>
                      </a>
                    </div>
                  </div>
                </td>
              </tr>
              {canExpand && isOpen && (
                <tr>
                  <td colSpan={5} className="bg-base-200/40">
                    <SubmissionHistory
                      submissions={rest.submissions}
                      repoHref={repoHref}
                      isGroup={isGroup}
                      students={students}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}

export default SubmissionsTable
