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

// The repo-query state the verdict depends on. Structural so the verdict logic
// stays a pure, unit-testable function (no React Query needed).
export type TeacherVerdictInput = {
  org: string | undefined
  isSuccess: boolean
  permissions?: {
    admin?: boolean
    maintain?: boolean
    push?: boolean
    pull?: boolean
  }
  error: unknown
}

export type TeacherVerdict = {
  isTeacher: boolean
  isStudent: boolean
  isBlocked: boolean
  roleResolved: boolean
  showTeacherUi: boolean
}

// Pure, fail-closed role resolution against the org's `classroom50` config repo:
// teacher = repo GET succeeded with a non-trivial permission, student = 404,
// blocked = 403. Resolved only on a definitive verdict (success/404/403) — a
// transient 5xx/429/network error must NOT resolve, or a student during a blip
// would be promoted into teacher UI. showTeacherUi also needs a positive
// success, so a transient error keeps it false. Org-less routes have no role.
export function resolveTeacherVerdict(
  input: TeacherVerdictInput,
): TeacherVerdict {
  const { org, isSuccess, permissions, error } = input

  const isTeacher =
    isSuccess &&
    Boolean(
      permissions?.admin ||
      permissions?.maintain ||
      permissions?.push ||
      permissions?.pull,
    )

  const isStudent = error instanceof GitHubAPIError && error.status === 404
  const isBlocked = error instanceof GitHubAPIError && error.status === 403

  const roleResolved = !org || isSuccess || isStudent || isBlocked
  const showTeacherUi = Boolean(org) && isTeacher

  return { isTeacher, isStudent, isBlocked, roleResolved, showTeacherUi }
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

  const verdict = resolveTeacherVerdict({
    org,
    isSuccess: repoQuery.isSuccess,
    permissions: repoQuery.data?.permissions,
    error: repoQuery.error,
  })

  return {
    ...repoQuery,
    teacherRepo,
    ...verdict,
  }
}
