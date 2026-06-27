import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { csvFileQuery, githubKeys } from "./github/queries"
import type { Student } from "@/types/classroom"

const rosterKey = (org: string, classroom: string) =>
  githubKeys.csvFile(org, "classroom50", `${classroom}/students.csv`)

const useGetStudents = (
  org: string | undefined,
  classroom: string | undefined,
) => {
  const client = useGitHubClient()
  const { data: students, isLoading } = useQuery(
    csvFileQuery<Student>(
      client,
      org ?? "",
      "classroom50",
      `${classroom ?? ""}/students.csv`,
    ),
  )

  return {
    students: students || [],
    isLoading,
  }
}

// Optimistically patch the cached roster. GitHub's Contents API is eventually
// consistent per path: right after a commit it often still serves the previous
// students.csv, so an immediate refetch would overwrite the cache with stale
// rows and the UI wouldn't reflect the change until a later refresh. The
// mutations already compute the authoritative post-write rows, so we write them
// straight into the cache for an instant, correct UI and let a natural refetch
// reconcile later. Pass a function that maps the current roster to the next one.
export const useUpdateRosterCache = (
  org: string | undefined,
  classroom: string | undefined,
) => {
  const queryClient = useQueryClient()
  return (update: (current: Student[]) => Student[]) => {
    if (!org || !classroom) return
    const key = rosterKey(org, classroom)
    // Cancel any in-flight roster fetch first. A refetch started before the
    // commit (window-focus/reconnect, default-on in React Query) reads the
    // pre-commit students.csv and, if it resolves AFTER this setQueryData,
    // would clobber the optimistic write with stale rows — the very bug this
    // avoids. Cancelling drops that racing response. (cancelQueries returns a
    // promise; we don't need to await it to apply the synchronous update.)
    void queryClient.cancelQueries({ queryKey: key })
    queryClient.setQueryData<Student[]>(key, (current) => update(current ?? []))
  }
}

export default useGetStudents
