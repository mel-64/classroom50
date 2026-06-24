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

  // Resolved once the query returns a verdict; an absent org has no role to
  // resolve, so treat it as resolved (non-teacher) instead of a forever-pending
  // skeleton on org-less routes.
  const roleResolved = !org || repoQuery.isSuccess || repoQuery.isError

  // Show teacher UI only for a real org that isn't a definitive non-teacher
  // (student 404 / blocked 403); stays visible on transient errors so real
  // teachers don't flicker out.
  const showTeacherUi = Boolean(org) && roleResolved && !(isStudent || isBlocked)

  return {
    ...repoQuery,
    teacherRepo,
    isTeacher,
    isStudent,
    isBlocked,
    roleResolved,
    showTeacherUi,
  }
}

// export function useCourseManifest(org: string) {
//   return useGitHubJsonFile<CourseManifest>(
//     org,
//
//   )
// }
