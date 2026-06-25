import useGetRepo from "./useGetRepo"
import { studentRepoName } from "@/util/studentRepo"

const useGetAssignmentRepo = (
  org: string,
  classroom: string,
  assignment: string,
  username: string | undefined,
) => {
  // Resolve the student's repo by an exact GET /repos/{org}/{name} (404 -> null
  // via getRepo) instead of scanning the org's repo list. This is one small
  // request, avoids the per_page=100 ceiling that could miss a repo in large
  // orgs, and can't prefix-collide (alice vs alice2). Gated on a known
  // username so we never probe an arbitrary name.
  const expectedName = username
    ? studentRepoName(classroom, assignment, username)
    : ""

  const repoQuery = useGetRepo(org, expectedName, {
    enabled: Boolean(expectedName),
  })

  return {
    ...repoQuery,
    assignment: repoQuery.data ?? undefined,
  }
}

export default useGetAssignmentRepo
