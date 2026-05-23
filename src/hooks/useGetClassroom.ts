import { useQuery } from "@tanstack/react-query"
import { jsonFileQuery } from "./github/queries"
import { useGitHubClient } from "@/context/github/GitHubProvider"

type ClassroomData = {
  schema: string
  name: string
  short_name: string
  term: string
  org: string
}
const useGetClassroom = (org: string, repo: string, file: string) => {
  const client = useGitHubClient()
  return useQuery(jsonFileQuery<ClassroomData>(client, org, repo, file))
}

export default useGetClassroom
