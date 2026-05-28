import { useQuery } from "@tanstack/react-query"
import { jsonFileQuery } from "./github/queries"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import type { Classroom } from "@/types/classroom"

const useGetClassroom = (org: string, classroom: string) => {
  const client = useGitHubClient()
  return useQuery({
    ...jsonFileQuery<Classroom>(
      client,
      org,
      "classroom50",
      `${classroom}/classroom.json`,
    ),
    enabled: Boolean(org && classroom),
  })
}

export default useGetClassroom
