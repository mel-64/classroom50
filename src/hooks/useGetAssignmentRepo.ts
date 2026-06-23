import useGetOrgRepos from "./useGetMyOrgRepos"
import { studentRepoName } from "@/util/studentRepo"

const useGetAssignmentRepo = (
  org: string,
  classroom: string,
  assignment: string,
  username: string,
) => {
  const assignmentRepos = useGetOrgRepos(org)

  return {
    ...assignmentRepos,
    assignment: assignmentRepos.data?.find((repo) =>
      repo.name.startsWith(studentRepoName(classroom, assignment, username)),
    ),
  }
}

export default useGetAssignmentRepo
