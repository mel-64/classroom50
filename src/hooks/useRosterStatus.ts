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
// teacher-facing sections. The underlying React Query calls are keyed, so
// multiple consumers (the roster list and the page header count) share one
// fetch rather than duplicating requests.
export type RosterStatus = {
  statusByKey: Map<string, StudentInviteStatus>
  getStatus: (student: Student) => StudentInviteStatus
  statusLoading: boolean
  // Owner-only endpoints 403 for non-owners; status is then unavailable.
  statusAvailable: boolean
  reportsErrored: boolean
  // True once everything the section partition depends on has settled, so the
  // roster can render without a row briefly landing in the wrong section. The
  // "ready vs awaiting" split needs the onboarding-reports query specifically:
  // until it resolves, an onboarded student is classified "awaiting" and then
  // jumps to "ready". For a non-owner (status unavailable) reports aren't
  // fetched, so we don't wait on them.
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

  // members === undefined means "still loading" ONLY while the query hasn't
  // errored; a terminal members failure also leaves it undefined, so treat that
  // as settled (not loading) to avoid hanging the roster on a spinner forever.
  const statusLoading =
    (members === undefined && !membersErrored) || invitesLoading
  // Status is unavailable for a non-owner (invitations 403) OR when the members
  // listing terminally failed — either way we can't classify, so the roster
  // renders without the live status rather than waiting on data that won't come.
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

  // Roster is renderable without a section flash once members + invitations
  // have settled AND, when status is available, the onboarding-reports query
  // has resolved (loaded or errored — an error surfaces its own warning and
  // shouldn't spin forever). For a non-owner we never fetch reports, so status
  // settling is enough.
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
