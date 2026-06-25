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

export function useCourseTeacherAccess(org: string | undefined) {
  const teacherRepo = "classroom50"
  // Bounded retry on transient errors only: a 404 (student) / 403 (blocked) is
  // a definitive verdict and must not be retried, but a 5xx/429/network blip
  // should self-heal instead of stranding the role unresolved.
  const repoQuery = useGitHubRepo(org, teacherRepo, {
    retry: (failureCount, error) => {
      if (
        error instanceof GitHubAPIError &&
        (error.status === 404 || error.status === 403)
      ) {
        return false
      }
      return failureCount < 2
    },
  })

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

  // Resolved only on a DEFINITIVE verdict: success (teacher), 404 (student), or
  // 403 (blocked). A transient 5xx/429/network error must NOT resolve the role
  // — otherwise a student during a blip would be treated as a non-student and
  // promoted into teacher UI. An org-less route has no role to resolve.
  const roleResolved = !org || repoQuery.isSuccess || isStudent || isBlocked

  // Teacher UI requires a positive success verdict — fail-closed for students.
  // No longer derived from "resolved && not-student", so a transient error
  // leaves showTeacherUi false (consumers keep their pending state) rather than
  // optimistically granting teacher access.
  const showTeacherUi = Boolean(org) && isTeacher

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
