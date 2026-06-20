import {
  ChartColumnIncreasing,
  MessageCircle,
  SquareArrowOutUpRight,
} from "lucide-react"

import { getName, getInitials } from "@/util/students"
import Avatar from "@/components/avatar"
import type { SubmissionRow } from "@/hooks/useGetScores"
import type { Student } from "@/types/classroom"

// <= 50% = red
// >= 60% = yellow
// >= 70% = green
const scoreToBadgeType = (score: number, max: number) => {
  const percent = (score / max) * 100

  if (percent <= 50) return "badge-error"
  if (percent < 70) return "badge-warning"
  return "badge-success"
}

const SubmissionsTable = ({
  scores,
  students,
}: {
  scores: SubmissionRow[]
  students: Student[]
}) => {
  return (
    <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
      <table className="table">
        <thead>
          <tr>
            <th>Student</th>
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
            .map(({ usernames, score, datetime, submissionCount, ...rest }) => (
              <tr key={rest.owner}>
                <td>
                  <Avatar
                    name={getName(usernames[0], students)}
                    initials={getInitials(usernames[0], students)}
                    github={usernames[0]}
                  />
                </td>
                <td>
                  <label className="badge max-xl:text-xs whitespace-nowrap">
                    {submissionCount}{" "}
                    {submissionCount === 1 ? "Submission" : "Submissions"}
                  </label>
                </td>
                <td>
                  <label
                    className={`badge badge-soft ${scoreToBadgeType(score, rest["max-score"])}`}
                  >
                    {score}/{rest["max-score"]}
                  </label>
                </td>
                <td>
                  {new Date(datetime).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </td>
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
                      <a
                        className="flex gap-2"
                        href={rest.review}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle />
                        <span>Review</span>
                      </a>
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
            ))}
        </tbody>
      </table>
    </div>
  )
}

export default SubmissionsTable
