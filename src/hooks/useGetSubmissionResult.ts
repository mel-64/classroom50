import { useQuery } from "@tanstack/react-query"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { submissionResultQuery } from "./github/queries"
import { studentRepoName } from "@/util/studentRepo"
import type { ResultJson } from "@/types/result"

// The logged-in student's most recent graded submission. The autograde runner
// commits result.json to the repo's `artifacts` branch
// (<classroom>-<assignment>-<username>); `data` is null until they submit.
const useGetSubmissionResult = (
  org: string | undefined,
  classroom: string | undefined,
  assignment: string | undefined,
  username: string | undefined,
) => {
  const client = useGitHubClient()

  const repo =
    classroom && assignment && username
      ? studentRepoName(classroom, assignment, username)
      : ""

  return useQuery({
    ...submissionResultQuery<ResultJson>(client, org ?? "", repo),
    enabled: Boolean(org && repo),
    // Defensive normalization: a malformed/partial result.json must not crash
    // the render (StudentSubmissionPage reads result.tests.length/.map). Coerce
    // `tests` to an array so a bad asset degrades to "no tests" rather than a
    // white screen; null (no submission yet) passes through untouched.
    select: (data) =>
      data
        ? { ...data, tests: Array.isArray(data.tests) ? data.tests : [] }
        : data,
  })
}

export default useGetSubmissionResult
