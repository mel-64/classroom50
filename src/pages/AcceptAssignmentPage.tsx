import {
  AlertTriangle,
  CheckCircle2,
  GraduationCap,
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
import { acceptAssignment } from "@/hooks/github/mutations"
import usePagesAssignments from "@/hooks/usePagesAssignments"
import { formatDueDate } from "@/util/formatDate"
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

  const expectedRepoName = username
    ? `${classroom}-${assignment}-${username}`.toLowerCase()
    : `${classroom}-${assignment}-{your-github-username}`.toLowerCase()

  const { data: checkedRepo, isLoading: isLoadingRepo } = useGetRepo(
    org,
    expectedRepoName,
  )
  const repoExistsAlready = checkedRepo?.name === expectedRepoName

  const acceptMutation = useMutation({
    mutationFn: () =>
      acceptAssignment({
        client,
        org,
        classroom,
        assignmentSlug: assignment,
      }),
  })

  const isBusy = acceptMutation.isPending

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
            <span className="badge">
              {assignmentData?.due
                ? `Due ${formatDueDate(assignmentData.due)}`
                : "No due date"}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight pt-6">
            {assignmentData?.name}
          </h1>
          <h2 className="text-lg">
            Accept this assignment to get your own copy of the starter code
            repository.
          </h2>

          {repoExistsAlready && !acceptMutation.data && (
            <div className="alert alert-warning items-start">
              <AlertTriangle className="size-5 shrink-0" />
              <div>
                <div className="font-bold">Assignment already accepted</div>
                <div className="text-sm">
                  Your repository already exists. You can open it below.
                </div>
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

            {!acceptMutation.data && !repoExistsAlready && (
              <button
                type="button"
                className="btn btn-primary w-full text-xl p-8"
                disabled={isBusy || !username}
                onClick={() => acceptMutation.mutate()}
              >
                {acceptMutation.isPending ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Creating repository...
                  </>
                ) : (
                  <>
                    <GitHubWhite className="size-6" />
                    Accept Assignment & Create Repository
                  </>
                )}
              </button>
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
          </div>
        </div>
      </AcceptCard>
    </div>
  )
}

export default AcceptAssignmentPage
