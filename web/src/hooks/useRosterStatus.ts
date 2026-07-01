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
  isRosterReady,
  partitionRoster,
  studentKey,
  type RosterPartition,
} from "@/util/roster"
import type { Student } from "@/types/classroom"

// Live invite/enrollment status for a classroom roster: members, invitations,
// and onboarding self-reports folded into a per-row status, plus the three
// teacher-facing sections. React Query keys are shared, so multiple consumers
// share one fetch.
export type RosterStatus = {
  statusByKey: Map<string, StudentInviteStatus>
  getStatus: (student: Student) => StudentInviteStatus
  statusLoading: boolean
  // Owner-only endpoints 403 for non-owners; status is then unavailable.
  statusAvailable: boolean
  reportsErrored: boolean
  // True once everything the partition depends on has settled, so a row doesn't
  // briefly land in the wrong section (an onboarded student would otherwise show
  // "awaiting" then jump to "ready"). A non-owner doesn't fetch reports, so we
  // don't wait on them.
  rosterReady: boolean
  partition: RosterPartition
}

const useRosterStatus = (
  org: string,
  classroom: string,
  students: Student[],
): RosterStatus => {
  const client = useGitHubClient()
  const { members, isError: membersErrored } = useGetOrgMembers(org)
  const {
    invitations,
    failedInvitations,
    isLoading: invitesLoading,
    isForbidden: invitesForbidden,
  } = useGetOrgInvitations(org)

  // members === undefined means "still loading" only while it hasn't errored; a
  // terminal failure also leaves it undefined, so treat that as settled to avoid
  // hanging on a spinner forever.
  const statusLoading =
    (members === undefined && !membersErrored) || invitesLoading
  // Unavailable for a non-owner (invitations 403) or a terminal members failure:
  // can't classify, so render without live status rather than waiting.
  const statusAvailable = !invitesForbidden && !membersErrored

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
        students,
      ),
    [
      members,
      invitations,
      failedInvitations,
      reportsLoaded,
      onboardedReports,
      students,
    ],
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

  // Renderable without a section flash once members + invitations have settled
  // and, when status is available, the onboarding-reports query has resolved
  // (loaded or errored). A non-owner never fetches reports, so settling is enough.
  const rosterReady = isRosterReady({
    statusLoading,
    statusAvailable,
    reportsLoaded,
    reportsErrored,
  })

  return {
    statusByKey,
    getStatus,
    statusLoading,
    statusAvailable,
    reportsErrored,
    rosterReady,
    partition,
  }
}

export default useRosterStatus
