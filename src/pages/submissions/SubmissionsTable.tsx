import {
  ChartColumnIncreasing,
  MessageCircle,
  SquareArrowOutUpRight,
} from "lucide-react"

import { capitalize, getName, getInitials } from "@/util/students"
import Avatar from "@/components/avatar"

// <= 50% = red
// >= 60% = yellow
// >= 70% = green
const scoreToBadgeType = (score: number, max: number) => {
  let percent = (score / max) * 100

  if (percent <= 50) return "badge-error"
  if (percent < 70) return "badge-warning"
  return "badge-success"
}

const SubmissionsTable = ({ org, classroom, assignment, scores, students }) => {
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
          {scores
            .sort((a, b) => a.datetime - b.datetime)
            .toReversed()
            .map(({ usernames, score, datetime, ...rest }) => (
              <tr>
                <td>
                  <Avatar
                    name={getName(usernames[0], students)}
                    initials={getInitials(usernames[0], students)}
                    github={usernames[0]}
                  />
                </td>
                <td>
                  <label className="badge">1 Submission</label>
                </td>
                <td>
                  <label
                    className={`badge badge-soft ${scoreToBadgeType(score, rest["max-score"])}`}
                  >
                    {score}/{rest["max-score"]}
                  </label>
                </td>
                <td>{datetime}</td>
                <td>
                  <div className="flex gap-4">
                    <div className="flex gap-2">
                      <SquareArrowOutUpRight />
                      <span>Commit</span>
                    </div>
                    <div className="flex gap-2">
                      <MessageCircle />
                      <span>Review</span>
                    </div>
                    <div className="flex gap-2">
                      <ChartColumnIncreasing />
                      <span>Details</span>
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
