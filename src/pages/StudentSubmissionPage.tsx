import { Link, useParams } from "@tanstack/react-router"
import {
  ExternalLink,
  FileText,
  UserRound,
  UsersRound,
  CalendarClock,
} from "lucide-react"

import Breadcrumb from "@/components/breadcrumb"
import MissingParams from "@/components/MissingParams"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useGithubAuth } from "@/auth/useGithubAuth"
import useGetSubmissionReleases from "@/hooks/useGetSubmissionReleases"
import useGetPublicAssignment from "@/hooks/useGetPublicAssignment"
import useGetAssignmentRepo from "@/hooks/useGetAssignmentRepo"
import { formatDueDateTime, isPastDue } from "@/util/formatDate"
import { safeHttpUrl } from "@/util/url"
import type { GitHubRelease } from "@/hooks/github/types"
import type { Assignment } from "@/types/classroom"

// Strips the `submit/` tag prefix for a friendlier label, falling back to the
// release name when present.
const releaseLabel = (release: GitHubRelease): string =>
  release.name?.trim() || release.tag_name.replace(/^submit\//, "")

const ReleaseRow = ({ release }: { release: GitHubRelease }) => {
  // html_url comes from the GitHub API (always http(s)); guard anyway to keep
  // the no-unsafe-href rule uniform across views.
  const href = safeHttpUrl(release.html_url)
  const when = release.published_at ?? release.created_at

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{releaseLabel(release)}</p>
        <p className="text-sm text-base-content/60">
          Submitted {formatDueDateTime(when)}
        </p>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="btn btn-sm btn-outline shrink-0"
        >
          <FileText className="size-4" />
          View grade
        </a>
      ) : (
        <span className="text-sm text-base-content/40">Unavailable</span>
      )}
    </li>
  )
}

const AssignmentMeta = ({ assignment }: { assignment?: Assignment }) => {
  if (!assignment) return null
  const due = assignment.due
  const overdue = due ? isPastDue(due) : false

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {assignment.mode === "group" ? (
        <span className="badge badge-ghost badge-sm gap-1">
          <UsersRound className="size-3.5" /> Group
        </span>
      ) : assignment.mode === "individual" ? (
        <span className="badge badge-ghost badge-sm gap-1">
          <UserRound className="size-3.5" /> Individual
        </span>
      ) : null}
      <span
        className={`badge badge-sm gap-1 ${overdue ? "badge-error badge-soft" : "badge-ghost"}`}
      >
        <CalendarClock className="size-3.5" />
        {due ? `Due ${formatDueDateTime(due)}` : "No due date"}
      </span>
    </div>
  )
}

const SubmissionBody = ({
  org,
  classroom,
  assignment,
}: {
  org: string
  classroom: string
  assignment: string
}) => {
  const { user } = useGithubAuth()
  const {
    data: releases,
    isLoading,
    isError,
    error,
  } = useGetSubmissionReleases(org, classroom, assignment, user?.login)
  // Distinguish "never accepted" (no repo) from "accepted but not yet graded".
  // getRepo returns null only on a true 404; a 403/5xx throws, so read the repo
  // query's error too — otherwise a transient/permission failure falls through
  // to the "haven't accepted yet" CTA and misdirects the student.
  const {
    assignment: studentRepo,
    isLoading: repoLoading,
    isError: repoIsError,
    error: repoError,
  } = useGetAssignmentRepo(org, classroom, assignment, user?.login)

  if (isLoading || repoLoading) {
    return (
      <div className="mt-8 space-y-4">
        <div className="skeleton h-24 w-full rounded-box" />
        <div className="skeleton h-64 w-full rounded-box" />
      </div>
    )
  }

  if (isError || repoIsError) {
    const message =
      error instanceof Error
        ? error.message
        : repoError instanceof Error
          ? repoError.message
          : ""
    return (
      <div className="alert alert-error mt-6">
        Could not load your submissions.
        {message ? ` ${message}` : ""}
      </div>
    )
  }

  // No repo means the student hasn't accepted yet.
  if (!studentRepo) {
    return (
      <div className="alert alert-warning mt-6">
        <div>
          You haven't accepted this assignment yet.{" "}
          <Link
            className="underline"
            to="/$org/$classroom/assignments/$assignment/accept"
            params={{ org, classroom, assignment }}
          >
            Accept it
          </Link>{" "}
          to get your repository, then push your work to be graded.
        </div>
      </div>
    )
  }

  if (!releases || releases.length === 0) {
    return (
      <div className="mt-6 space-y-4">
        <div className="alert alert-info">
          <div>
            No graded submission yet. Push a commit to your assignment
            repository and the autograder will publish your result here.
          </div>
        </div>
        <a
          href={studentRepo.html_url}
          target="_blank"
          rel="noreferrer"
          className="btn btn-sm btn-outline"
        >
          <ExternalLink className="size-4" />
          Open my repository
        </a>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-base-content/60">
          Each submission opens its graded release on GitHub, with your score
          and per-test results.
        </p>
        <a
          href={studentRepo.html_url}
          target="_blank"
          rel="noreferrer"
          className="btn btn-sm btn-outline"
        >
          <ExternalLink className="size-4" />
          Open my repository
        </a>
      </div>

      <div className="card border border-base-200 bg-base-100 shadow-sm">
        <ul className="divide-y divide-base-200">
          {releases.map((release) => (
            <ReleaseRow key={release.id} release={release} />
          ))}
        </ul>
      </div>
    </div>
  )
}

const StudentSubmissionPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const { assignment: assignmentData } = useGetPublicAssignment(
    org,
    classroom,
    assignment,
  )

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb endpoint="My Submission" />
          <h1 className="text-2xl font-bold mt-4">
            {assignmentData?.name || assignment || "Submission"}
          </h1>
          <AssignmentMeta assignment={assignmentData} />
          {org && classroom && assignment ? (
            <SubmissionBody
              org={org}
              classroom={classroom}
              assignment={assignment}
            />
          ) : (
            <MissingParams message="Missing course or assignment information." />
          )}
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default StudentSubmissionPage
