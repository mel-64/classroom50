import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { listOnboardingSelfReports } from "@/hooks/github/queries"
import useGetOrgMembers from "@/hooks/useGetOrgMembers"
import useGetOrgInvitations from "@/hooks/useGetOrgInvitations"
import {
  buildInviteStatusLookup,
  type StudentInviteStatus,
} from "@/util/inviteStatus"
import {
  partitionRoster,
  studentKey,
  type RosterPartition,
} from "@/util/roster"
import type { Student } from "@/types/classroom"

// Live invite/enrollment status for a classroom roster: members, invitations,
// and onboarding self-reports folded into a per-row status, plus the three
// teacher-facing sections. The underlying React Query calls are keyed, so
// multiple consumers (the roster list and the page header count) share one
// fetch rather than duplicating requests.
export type RosterStatus = {
  statusByKey: Map<string, StudentInviteStatus>
  getStatus: (student: Student) => StudentInviteStatus
  statusLoading: boolean
  // Owner-only endpoints 403 for non-owners; status is then unavailable.
  statusAvailable: boolean
  reportsLoaded: boolean
  reportsErrored: boolean
  partition: RosterPartition
}

const useRosterStatus = (
  org: string,
  classroom: string,
  students: Student[],
): RosterStatus => {
  const client = useGitHubClient()
  const { members } = useGetOrgMembers(org)
  const {
    invitations,
    failedInvitations,
    isLoading: invitesLoading,
    isForbidden: invitesForbidden,
  } = useGetOrgInvitations(org)

  const statusLoading = members === undefined || invitesLoading
  const statusAvailable = !invitesForbidden

  const {
    data: onboardedReports,
    isSuccess: reportsLoaded,
    isError: reportsErrored,
  } = useQuery({
    queryKey: ["github", "onboarding-reports", org, classroom],
    queryFn: () => listOnboardingSelfReports(client, org, classroom),
    enabled: Boolean(org && classroom && statusAvailable),
    staleTime: 30 * 1000,
  })

  const getStatus = useMemo(
    () =>
      buildInviteStatusLookup(
        members ?? [],
        invitations,
        failedInvitations,
        // Only authoritative once loaded; undefined keeps "ready" unresolved.
        reportsLoaded ? (onboardedReports ?? []) : undefined,
      ),
    [members, invitations, failedInvitations, reportsLoaded, onboardedReports],
  )

  const statusByKey = useMemo(() => {
    const map = new Map<string, StudentInviteStatus>()
    if (statusLoading || !statusAvailable) return map
    students.forEach((student) => {
      map.set(studentKey(student), getStatus(student))
    })
    return map
  }, [students, getStatus, statusLoading, statusAvailable])

  const partition = useMemo(
    () =>
      partitionRoster(
        students,
        (student) => statusByKey.get(studentKey(student))?.status,
      ),
    [students, statusByKey],
  )

  return {
    statusByKey,
    getStatus,
    statusLoading,
    statusAvailable,
    reportsLoaded,
    reportsErrored,
    partition,
  }
}

export default useRosterStatus
