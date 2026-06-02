import { useQuery } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { csvFileQuery } from "./github/queries"

type Student = {
  username: string
  first_name: string
  last_name: string
  email: string
  section: string
  github_id: string
}
const useGetStudents = (org: string, classroom: string) => {
  const client = useGitHubClient()
  const { data: students } = useQuery(
    csvFileQuery<Student>(
      client,
      org,
      "classroom50",
      `${classroom}/students.csv`,
    ),
  )

  return {
    students: students || [],
  }
}

export default useGetStudents
