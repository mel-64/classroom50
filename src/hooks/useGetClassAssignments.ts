import { useQuery } from "@tanstack/react-query"
import { jsonFileQuery } from "./github/queries"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import type { Assignment } from "@/types/classroom"

// Mirrors classroom50/assignments/v1: a `schema` sentinel plus the
// assignment list. `runtime`, `max_group_size`, `tests`, `due`, etc. are
// all optional — a minimal assignment (as `gh teacher assignment add`
// writes) carries only slug/name/template/mode/autograder.
type AssignmentsSchema = {
  schema: string
  assignments: Assignment[]
}
const useGetClassroomAssignments = (org: string, classroom: string) => {
  const client = useGitHubClient()
  return useQuery(
    jsonFileQuery<AssignmentsSchema>(
      client,
      org,
      "classroom50",
      `${classroom}/assignments.json`,
    ),
  )
}

export default useGetClassroomAssignments
