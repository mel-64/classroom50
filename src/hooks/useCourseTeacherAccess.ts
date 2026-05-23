import { useGitHubRepo } from "./github/hooks"
import { GitHubAPIError } from "./github/errors"

export type CourseManifest = {
  course: {
    slug: string
    title: string
  }
  assignments: Array<{
    id: string
    title: string
    repo: string
  }>
  students?: Array<{
    github: string
    name?: string
  }>
}

export function useCourseTeacherAccess(org: string) {
  const teacherRepo = "classroom50"
  const repoQuery = useGitHubRepo(org, teacherRepo)

  const isTeacher =
    repoQuery.isSuccess &&
    Boolean(
      repoQuery.data.permissions?.admin ||
      repoQuery.data.permissions?.maintain ||
      repoQuery.data.permissions?.push ||
      repoQuery.data.permissions?.pull,
    )

  const isStudent =
    repoQuery.error instanceof GitHubAPIError && repoQuery.error.status === 404

  const isBlocked =
    repoQuery.error instanceof GitHubAPIError && repoQuery.error.status === 403

  return {
    ...repoQuery,
    teacherRepo,
    isTeacher,
    isStudent,
    isBlocked,
  }
}

// export function useCourseManifest(org: string) {
//   return useGitHubJsonFile<CourseManifest>(
//     org,
//
//   )
// }
