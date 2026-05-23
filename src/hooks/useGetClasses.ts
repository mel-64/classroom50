import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useQuery } from "@tanstack/react-query"
import { jsonFileQuery } from "./github/queries"

const useGetClasses = (org: string) => {
  const client = useGitHubClient()
  return useQuery(jsonFileQuery(client, org, "classroom50", ""))
}

export default useGetClasses
