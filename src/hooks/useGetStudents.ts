import { useQuery } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { csvFileQuery } from "./github/queries"
import type { Student } from "@/types/classroom"

const useGetStudents = (org: string, classroom: string) => {
  const client = useGitHubClient()
  const { data: students, isLoading } = useQuery(
    csvFileQuery<Student>(
      client,
      org,
      "classroom50",
      `${classroom}/students.csv`,
    ),
  )

  return {
    students: students || [],
    isLoading,
  }
}

export default useGetStudents
