import { useQuery } from "@tanstack/react-query"
import { fetchPagesAssignments } from "./github/queries"

const usePagesAssignments = (
  org: string | undefined,
  classroom: string | undefined,
) => {
  return useQuery({
    queryKey: ["pages", "assignments", org, classroom],
    queryFn: () => fetchPagesAssignments(org ?? "", classroom ?? ""),
    enabled: Boolean(org && classroom),
  })
}

export default usePagesAssignments
