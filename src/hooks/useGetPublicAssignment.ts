import { useQuery } from "@tanstack/react-query"
import { fetchPagesAssignments } from "./github/queries"

const useGetPublicAssignment = (
  org: string | undefined,
  classroom: string | undefined,
  assignment: string | undefined,
) => {
  const assignmentQuery = useQuery({
    queryKey: ["pages", org, classroom],
    queryFn: () => fetchPagesAssignments(org ?? "", classroom ?? ""),
    enabled: Boolean(org && classroom),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  return {
    ...assignmentQuery,
    assignment: assignmentQuery.data?.find((a) => a.slug === assignment),
  }
}

export default useGetPublicAssignment
