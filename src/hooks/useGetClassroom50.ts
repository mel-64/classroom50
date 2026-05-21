import { useQuery } from "@tanstack/react-query"

const getClassroom50 = (org) => {}

const useGetClassroom50 = (org) => {
  return useQuery({
    queryFn: () => getClassroom50(org),
  })
}

export default useGetClassroom50
