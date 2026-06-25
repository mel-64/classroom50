import { useGitHubClient } from "@/context/github/GitHubProvider"
import { getClassroom50Yaml } from "./github/queries"
import { useQuery } from "@tanstack/react-query"
import { parseClassroom50Yaml, type Classroom50Yaml } from "@/util/yaml"

const useDotClassroom50 = (
  org: string,
  repo: string,
): Partial<Classroom50Yaml> => {
  const client = useGitHubClient()

  const query = useQuery({
    queryKey: ["github", "repos", org, repo, ".classroom50.yaml"],
    queryFn: () => getClassroom50Yaml(client, org, repo),
    staleTime: 10 * 60 * 1000,
  })

  return query.data ? parseClassroom50Yaml(query.data) : {}
}

export default useDotClassroom50
