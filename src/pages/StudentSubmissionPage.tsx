import { Link, useParams } from "@tanstack/react-router"
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  GitCommitHorizontal,
  FileText,
} from "lucide-react"

import Breadcrumb from "@/components/breadcrumb"
import MissingParams from "@/components/MissingParams"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useGithubAuth } from "@/auth/useGithubAuth"
import useGetSubmissionResult from "@/hooks/useGetSubmissionResult"
import useGetPublicAssignment from "@/hooks/useGetPublicAssignment"
import { formatDueDateTime } from "@/util/formatDate"
import type { ResultJson } from "@/types/result"

const ScoreSummary = ({ result }: { result: ResultJson }) => {
  const max = result["max-score"]
  const pct = max > 0 ? Math.round((result.score / max) * 100) : null

  return (
    <div className="card border border-base-200 bg-base-100 shadow-sm">
      <div className="card-body gap-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-base-content/60">
              Your score
            </p>
            <p className="text-3xl font-bold">
              {result.score}
              <span className="text-xl font-medium text-base-content/60">
                {" "}
                / {max}
              </span>
            </p>
          </div>
          {pct !== null && (
            <div
              className="radial-progress text-primary"
              style={
                {
                  "--value": pct,
                  "--size": "4rem",
                  "--thickness": "0.4rem",
                } as React.CSSProperties
              }
              role="progressbar"
              aria-valuenow={pct}
            >
              {pct}%
            </div>
          )}
        </div>
        <p className="text-sm text-base-content/60">
          Graded {formatDueDateTime(result.datetime)}
        </p>
      </div>
    </div>
  )
}

const TestRow = ({ test }: { test: ResultJson["tests"][number] }) => {
  const detail =
    typeof test.output === "string"
      ? test.output
      : typeof test.message === "string"
        ? test.message
        : null

  return (
    <>
      <tr>
        <td>
          {test.passed ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <CheckCircle2 className="size-4" /> Passed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-error">
              <XCircle className="size-4" /> Failed
            </span>
          )}
        </td>
        <td className="font-medium">{test["test-name"]}</td>
        <td className="text-right tabular-nums">
          {test.score} / {test["max-score"]}
        </td>
      </tr>
      {detail && (
        <tr>
          <td colSpan={3} className="bg-base-200/40">
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-base-content/70">
              {detail}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}

const ResultLinks = ({ result }: { result: ResultJson }) => {
  const links: { label: string; href: string; icon: React.ReactNode }[] = []
  if (result.commit)
    links.push({
      label: "Graded commit",
      href: result.commit,
      icon: <GitCommitHorizontal className="size-4" />,
    })
  if (result.release)
    links.push({
      label: "Submission release",
      href: result.release,
      icon: <FileText className="size-4" />,
    })
  if (result.review && result.review !== result.commit)
    links.push({
      label: "Full diff",
      href: result.review,
      icon: <ExternalLink className="size-4" />,
    })

  if (links.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="btn btn-sm btn-outline"
        >
          {link.icon}
          {link.label}
        </a>
      ))}
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
    data: result,
    isLoading,
    isError,
    error,
  } = useGetSubmissionResult(org, classroom, assignment, user?.login)

  if (isLoading) {
    return (
      <div className="mt-8 space-y-4">
        <div className="skeleton h-24 w-full rounded-box" />
        <div className="skeleton h-64 w-full rounded-box" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="alert alert-error mt-6">
        Could not load your submission result.
        {error instanceof Error ? ` ${error.message}` : ""}
      </div>
    )
  }

  if (!result) {
    return (
      <div className="alert alert-info mt-6">
        <div>
          No graded submission yet. Once you push your work, the autograder
          publishes a result here. Need to{" "}
          <Link
            className="underline"
            to="/$org/$classroom/assignments/$assignment/accept"
            params={{ org, classroom, assignment }}
          >
            accept the assignment
          </Link>{" "}
          first?
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <ScoreSummary result={result} />
      <ResultLinks result={result} />

      <div className="card border border-base-200 bg-base-100 shadow-sm">
        <div className="card-body p-0">
          {result.tests.length === 0 ? (
            <p className="p-6 text-sm text-base-content/60">
              No autograder tests were run for this submission.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Result</th>
                    <th>Test</th>
                    <th className="text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tests.map((test) => (
                    <TestRow key={test["test-name"]} test={test} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
          <p className="text-base-content/60">My submission</p>
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
