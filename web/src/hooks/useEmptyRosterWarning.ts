import useGetStudents from "@/hooks/useGetStudents"
import useRosterStatus from "@/hooks/useRosterStatus"
import {
  countEnrolled,
  resolveEmptyRosterWarning,
  type EmptyRosterDecision,
} from "@/util/roster"

// Whether to warn a teacher that no student can yet accept an assignment.
//
// The assignment accept link only works for students who are GitHub org
// *members* — invited-but-not-yet-joined rows can't accept. So the signal is
// "zero enrolled (org member) students", not merely "zero roster rows": a
// classroom with 30 pending invites still warrants the warning.
//
// The show/enrolled decision lives in pure functions (countEnrolled,
// resolveEmptyRosterWarning) in util/roster, shared with the roster header so
// the two can't drift and the branches stay unit-testable.
export type EmptyRosterWarning = EmptyRosterDecision

const useEmptyRosterWarning = (
  org: string | undefined,
  classroom: string | undefined,
): EmptyRosterWarning => {
  const { students, isLoading: studentsLoading } = useGetStudents(
    org,
    classroom,
  )
  const status = useRosterStatus(org ?? "", classroom ?? "", students)

  // statusLoading covers members + invitations but intentionally NOT the
  // onboarding-reports query: reports only move rows into the `ready` bucket,
  // and countEnrolled counts only `enrolled` (member/removed), so a still-
  // loading reports query can't change the enrolled count. If the enrolled
  // definition ever broadens to include onboarded/`ready` rows, gate on
  // status.rosterReady instead (which also waits on reports) to avoid a flash.
  return resolveEmptyRosterWarning({
    studentsLoading,
    statusAvailable: status.statusAvailable,
    statusLoading: status.statusLoading,
    enrolledCount: countEnrolled(status, students),
    rosterRowCount: students.length,
  })
}

export default useEmptyRosterWarning
