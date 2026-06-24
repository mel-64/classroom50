import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  Loader2,
  UserPlus,
  UserRound,
} from "lucide-react"

import GitHub from "@/assets/github.svg?react"
import GitHubWhite from "@/assets/github_white.svg?react"
import type { GitHubUser } from "@/hooks/github/types"
import { Link, useParams } from "@tanstack/react-router"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useGithubAuth } from "@/auth/useGithubAuth"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import confetti from "canvas-confetti"
import {
  acceptAssignment,
  type AcceptStepId,
  type AcceptStepStatus,
} from "@/api/mutations/assignments"
import usePagesAssignments from "@/hooks/usePagesAssignments"
import { formatDueDateTime, isPastDue } from "@/util/formatDate"
import { studentRepoName } from "@/util/studentRepo"
import useGetRepo from "@/hooks/useGetRepo"
import useGetOwnOrgMembership from "@/hooks/useGetOwnOrgMembership"

const initialsFor = (user: GitHubUser | null) => {
  const source = user?.name || user?.login || "?"
  return source
    .split(/\s|-/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

const AcceptNavbar = () => {
  return (
    <div className="navbar bg-base-100 shadow-sm">
      <Link to="/">
        <div className="flex p-6 text-lg font-bold">
          <GraduationCap className="size-8 text-[#accefb] mr-2" /> Classroom 50
        </div>
      </Link>
    </div>
  )
}

const AcceptCard = ({ children }) => {
  return (
    <div className="card w-200 max-w-[calc(100vw-2em)] p-8 m-auto rounded-xl mt-10 border border-[#eee]">
      {children}
    </div>
  )
}

const UserInfo = ({ user }) => {
  const username = user?.login
  const displayName = user?.name || user?.login || "GitHub user"

  return (
    <div className="flex gap-4 bg-[#fafafa] p-4 rounded-xl border border-[#ddd]">
      <div className="avatar avatar-placeholder">
        {user?.avatar_url ? (
          <div className="w-12 rounded-full">
            <img src={user.avatar_url} alt={`${displayName}'s GitHub avatar`} />
          </div>
        ) : (
          <div className="bg-base-200 text-black rounded-full w-12">
            <span>{initialsFor(user)}</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-medium text-base-content">{displayName}</div>

        <div className="flex items-center gap-1 text-sm text-base-content/60">
          <GitHub className="size-4" />
          <span>{username ?? "Checking GitHub user..."}</span>
        </div>
      </div>
    </div>
  )
}

const AssignmentNotFound = ({ user, assignment }) => {
  return (
    <div className="min-h-screen bg-base-100">
      <AcceptNavbar />

      <AcceptCard>
        <div className="card-body gap-8">
          <div>
            <span className="badge badge-error badge-soft gap-2">
              <AlertTriangle className="size-4" />
              Assignment unavailable
            </span>

            <h1 className="mt-6 text-2xl font-bold">Assignment not found</h1>

            <p className="mt-2 text-base text-base-content/70">
              We couldn&apos;t find an assignment matching{" "}
              <span className="font-mono font-semibold text-base-content">
                {assignment}
              </span>{" "}
              in this classroom. The link may be incorrect, or the assignment
              may not have been published yet.
            </p>
          </div>

          <div className="rounded-xl border border-error/20 bg-error/5 p-5">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-error/10 p-3 text-error">
                <AlertTriangle className="size-6" />
              </div>

              <div className="min-w-0">
                <div className="font-bold text-error">
                  Unable to load assignment
                </div>

                <div className="mt-1 text-sm text-base-content/70">
                  Expected to find assignment slug:
                </div>

                <pre className="mt-3 overflow-x-auto rounded-lg bg-base-100 p-3 text-sm">
                  {assignment}
                </pre>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-base-300 bg-base-200/40 p-4 text-sm text-base-content/70">
            Check that the URL is correct, or ask your instructor to confirm
            that this assignment has been added to{" "}
            <span className="font-mono text-base-content">
              assignments.json
            </span>
            .
          </div>

          <div className="divider my-0" />

          <div className="space-y-3">
            <label className="label p-0 text-base font-semibold">
              Signed in as
            </label>

            <UserInfo user={user} />
          </div>
        </div>
      </AcceptCard>
    </div>
  )
}

const NotOrgMember = ({ user, org, classroom }) => {
  return (
    <div className="min-h-screen bg-base-100">
      <AcceptNavbar />

      <AcceptCard>
        <div className="card-body gap-8">
          <div>
            <span className="badge badge-error badge-soft gap-2">
              <AlertTriangle className="size-4" />
              Access Denied
            </span>

            <h1 className="mt-6 text-2xl font-bold">Not an org member</h1>

            <p className="mt-2 text-base text-base-content/70">
              You are not currently a member of the{" "}
              <span className="font-bold">{org}</span> organization.
            </p>
          </div>

          <div className="rounded-2xl border border-info/20 bg-info/5 p-5">
            <div className="flex gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
                <UserPlus className="size-5" />
              </div>

              <div className="min-w-0">
                <h2 className="font-semibold text-base-content">
                  Ask your instructor for access
                </h2>

                <p className="mt-2 leading-5 text-sm text-base-content/70">
                  Your instructor needs to invite you to the{" "}
                  <span className="font-semibold text-base-content">{org}</span>{" "}
                  GitHub organization and the{" "}
                  <span className="font-semibold text-base-content">
                    {classroom}
                  </span>{" "}
                  class roster before you can accept this assignment.
                </p>

                <p className="mt-3 text-xs leading-5 text-base-content/60">
                  After accepting the GitHub organization invite, return to this
                  page and try again.
                </p>
              </div>
            </div>
          </div>

          <div className="divider my-0" />

          <div className="space-y-3">
            <label className="label p-0 text-base font-semibold">
              Signed in as
            </label>

            <UserInfo user={user} />
          </div>
        </div>
      </AcceptCard>
    </div>
  )
}

const modeMap = {
  individual: "Individual Assignment",
  group: "Group Assignment",
}

const ACCEPT_STEP_ORDER: { id: AcceptStepId; label: string }[] = [
  { id: "account", label: "Checking your GitHub account" },
  { id: "assignment", label: "Looking up the assignment" },
  { id: "autograder", label: "Resolving the autograder" },
  { id: "repo", label: "Creating your repository" },
  { id: "access", label: "Granting you access" },
  { id: "setup", label: "Setting up autograding" },
]

type StepState = Record<
  AcceptStepId,
  { status: AcceptStepStatus; message?: string; error?: string }
>

const initialStepState: StepState = ACCEPT_STEP_ORDER.reduce((acc, step) => {
  acc[step.id] = { status: "pending" }
  return acc
}, {} as StepState)

const StatusIcon = ({ status }: { status: AcceptStepStatus }) => {
  if (status === "complete")
    return <CheckCircle2 className="size-5 shrink-0 text-success" />
  if (status === "running")
    return <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
  if (status === "error")
    return <AlertTriangle className="size-5 shrink-0 text-error" />
  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      <span className="size-2.5 rounded-full bg-base-300" />
    </span>
  )
}

const StepRow = ({
  label,
  state,
}: {
  label: string
  state: StepState[AcceptStepId]
}) => {
  const text = state.error ?? state.message ?? label

  return (
    <div className="flex items-center gap-3 text-sm">
      <StatusIcon status={state.status} />
      <span
        className={
          state.status === "pending"
            ? "text-base-content/40"
            : state.status === "error"
              ? "text-error"
              : "text-base-content/80"
        }
      >
        {text}
      </span>
    </div>
  )
}

const AcceptProgress = ({
  steps,
  defaultOpen = true,
}: {
  steps: StepState
  defaultOpen?: boolean
}) => {
  const stepStates = ACCEPT_STEP_ORDER.map((step) => steps[step.id])
  const completed = stepStates.filter((s) => s.status === "complete").length
  const hasError = stepStates.some((s) => s.status === "error")
  const isRunning = stepStates.some((s) => s.status === "running")
  const allDone = completed === ACCEPT_STEP_ORDER.length

  // Open while there's something to watch (running) or review (error); collapse
  // once complete. A student's explicit toggle takes precedence over this
  // lifecycle default. `defaultOpen` seeds the initial state only.
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const lifecycleOpen = isRunning || hasError || (defaultOpen && !allDone)
  const expanded = userOpen ?? lifecycleOpen

  const headerStatus: AcceptStepStatus = hasError
    ? "error"
    : allDone
      ? "complete"
      : isRunning
        ? "running"
        : "pending"

  const summary = {
    error: "Setup failed — review the steps",
    complete: "Setup complete",
    running: "Setting up your repository…",
    pending: "Setup progress",
  }[headerStatus]

  return (
    <div className="rounded-xl border border-base-300 bg-base-200/40">
      <button
        type="button"
        onClick={() => setUserOpen(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="flex items-center gap-3">
          <StatusIcon status={headerStatus} />
          <span className="font-medium">{summary}</span>
        </span>

        <span className="flex items-center gap-2 text-sm text-base-content/60">
          <span>
            {completed}/{ACCEPT_STEP_ORDER.length}
          </span>
          <ChevronDown
            className={`size-4 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-base-300 p-5">
          {ACCEPT_STEP_ORDER.map((step) => (
            <StepRow key={step.id} label={step.label} state={steps[step.id]} />
          ))}
        </div>
      )}
    </div>
  )
}

// Celebrate a freshly created assignment repo.
const fireConfetti = () => {
  const base = {
    spread: 80,
    startVelocity: 55,
    ticks: 200,
    zIndex: 1000,
    disableForReducedMotion: true,
  }
  confetti({ ...base, particleCount: 60, origin: { x: 0, y: 0 }, angle: -55 })
  confetti({ ...base, particleCount: 60, origin: { x: 1, y: 0 }, angle: -125 })
}

// Collapsed-by-default repair section for an already-accepted repo. Tucks the
// "Re-run setup" affordance behind a toggle so it doesn't compete with the
// primary "Open Repository" action.
const RepairToggle = ({
  disabled,
  onRerun,
}: {
  disabled: boolean
  onRerun: () => void
}) => {
  return (
    <details className="group rounded-xl border border-base-300 bg-base-200/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium">
        <span>Having trouble?</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-base-300 p-4">
        <p className="text-sm text-base-content/70">
          Autograding not running, or setup files missing? Re-run setup to
          repair your repository.
        </p>
        <button
          type="button"
          className="btn btn-outline btn-sm mt-3 w-full"
          disabled={disabled}
          onClick={onRerun}
        >
          Re-run setup
        </button>
      </div>
    </details>
  )
}

const AcceptAssignmentPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const client = useGitHubClient()

  const { user } = useGithubAuth()
  const username = user?.login

  const { data: assignmentsData, isLoading: loadingAssignments } =
    usePagesAssignments(org, classroom)
  const { data: orgInvite, isLoading: loadingOrgMembership } =
    useGetOwnOrgMembership(org)

  const assignmentData = assignmentsData?.find((a) => a.slug === assignment)

  const pastDue = Boolean(assignmentData?.due && isPastDue(assignmentData.due))

  const expectedRepoName = username
    ? studentRepoName(classroom, assignment, username)
    : studentRepoName(classroom, assignment, "{your-github-username}")

  const { data: checkedRepo, isLoading: isLoadingRepo } = useGetRepo(
    org,
    expectedRepoName,
  )
  const repoExistsAlready = checkedRepo?.name === expectedRepoName

  const [steps, setSteps] = useState<StepState>(initialStepState)

  const acceptMutation = useMutation({
    mutationFn: () => {
      setSteps(initialStepState)
      return acceptAssignment({
        client,
        org,
        classroom,
        assignmentSlug: assignment,
        onStepUpdate: (update) =>
          setSteps((prev) => ({
            ...prev,
            [update.id]: {
              status: update.status,
              message: update.message,
              error: update.error,
            },
          })),
      })
    },
    onSuccess: (result) => {
      // Celebrate a freshly created repo; an already-accepted repo isn't a new
      // milestone, so it skips the confetti.
      if (result.status === "created") {
        fireConfetti()
      }
    },
  })

  if (loadingAssignments || isLoadingRepo || loadingOrgMembership) {
    return (
      <div className="min-h-screen bg-base-100">
        <AcceptNavbar />
        <AcceptCard>
          <div className="loading loading-spinner loading-xl text-center m-auto" />
        </AcceptCard>
      </div>
    )
  }

  if (!orgInvite) {
    return (
      <NotOrgMember
        assignment={assignment}
        classroom={classroom}
        user={user}
        org={org}
      />
    )
  }

  if (!assignmentData) {
    return <AssignmentNotFound user={user} assignment={assignment} />
  }

  return (
    <div className="min-h-screen bg-base-100">
      <AcceptNavbar />
      <AcceptCard>
        <div className="card-body gap-4">
          <div className="flex justify-between">
            <span className="badge badge-primary badge-soft">
              <UserRound className="size-4" />
              {modeMap[assignmentData?.mode ?? ""] ?? ""}
            </span>
            <span
              className={`badge ${pastDue ? "badge-error badge-soft" : ""}`}
            >
              {assignmentData?.due
                ? `Due ${formatDueDateTime(assignmentData.due)}`
                : "No due date"}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight pt-6">
            {assignmentData?.name}
          </h1>
          <h2 className="text-lg">
            {repoExistsAlready
              ? "You've already accepted this assignment. Open your repository to keep working on it."
              : "Accept this assignment to get your own copy of the starter code repository."}
          </h2>

          {pastDue && (
            <div className="alert alert-warning items-start">
              <AlertTriangle className="size-5 shrink-0" />
              <div className="text-sm">
                This assignment is past due. You can still accept it, but check
                with your instructor about late submissions.
              </div>
            </div>
          )}

          <div className="divider mt-0" />

          <label className="label text-lg">Signed in as</label>

          <div className="flex flex-col gap-8">
            <UserInfo user={user} />

            <div className="flex gap-2 flex-col bg-[#fafafa] p-4 rounded-xl border border-[#ddd]">
              <label className="label text-lg">
                {repoExistsAlready
                  ? "Repository already exists as:"
                  : "Repository will be created as:"}
              </label>

              <div className="flex gap-4 min-w-0">
                <GitHub className="size-6 shrink-0" />
                <pre className="text-lg overflow-x-auto">
                  {org}/{expectedRepoName}
                </pre>
              </div>
            </div>

            {(acceptMutation.isPending ||
              acceptMutation.isError ||
              acceptMutation.isSuccess) && (
              <AcceptProgress steps={steps} defaultOpen={false} />
            )}

            {acceptMutation.isError && (
              <div className="alert alert-error items-start">
                <AlertTriangle className="size-5 shrink-0" />
                <div>
                  <div className="font-bold">Could not accept assignment</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm">
                    {acceptMutation.error instanceof Error
                      ? acceptMutation.error.message
                      : "Something went wrong while accepting the assignment."}
                  </div>
                  <div className="mt-2 text-xs opacity-80">
                    This is safe to retry — address anything noted above if you
                    can, then use the button below. Some errors (rate limits,
                    GitHub hiccups) just need a moment before retrying.
                  </div>
                </div>
              </div>
            )}

            {acceptMutation.data && (
              <div className="alert alert-success items-start p-8">
                <CheckCircle2 className="size-5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold">
                    {acceptMutation.data.status === "already-accepted"
                      ? "Assignment already accepted"
                      : "Assignment accepted"}
                  </div>

                  <div className="mt-1">
                    Repository:{" "}
                    <a
                      className="link font-mono"
                      href={acceptMutation.data.repo.html_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {acceptMutation.data.repo.full_name}
                    </a>
                  </div>
                </div>
              </div>
            )}

            {(acceptMutation.data || repoExistsAlready) && (
              <a
                className="btn btn-primary w-full text-xl p-8"
                href={
                  acceptMutation?.data?.repo.html_url ||
                  `https://www.github.com/${org}/${checkedRepo?.name}`
                }
                target="_blank"
                rel="noreferrer"
              >
                <GitHubWhite className="size-6" />
                Open Repository
              </a>
            )}

            {!acceptMutation.data &&
              !repoExistsAlready &&
              !acceptMutation.isPending && (
                <button
                  type="button"
                  className="btn btn-primary w-full text-xl p-8"
                  disabled={!username || acceptMutation.isPending}
                  onClick={() => acceptMutation.mutate()}
                >
                  <GitHubWhite className="size-6" />
                  Accept Assignment & Create Repository
                </button>
              )}

            {repoExistsAlready &&
              !acceptMutation.data &&
              !acceptMutation.isPending && (
                <RepairToggle
                  disabled={!username || acceptMutation.isPending}
                  onRerun={() => acceptMutation.mutate()}
                />
              )}
          </div>
        </div>
      </AcceptCard>
    </div>
  )
}

export default AcceptAssignmentPage
