import useGetStudents from "@/hooks/useGetStudents"
import useRosterStatus from "@/hooks/useRosterStatus"

// Whether to warn a teacher that no student can yet accept an assignment.
//
// The assignment accept link only works for students who are GitHub org
// *members* — invited-but-not-yet-joined rows can't accept. So the signal is
// "zero enrolled (org member) students", not merely "zero roster rows": a
// classroom with 30 pending invites still warrants the warning.
//
// `show` is gated on the data having settled so the banner never flashes during
// load. When live status is unavailable (non-owner, or a members/invites
// failure) we fall back to the CSV "enrolled" column, mirroring StudentListPage.
export type EmptyRosterWarning = {
  show: boolean
  // No roster rows at all vs. rows exist but nobody has joined the org yet.
  // Lets callers tailor copy ("add students" vs. "students haven't joined yet").
  hasRosterRows: boolean
  isLoading: boolean
}

const useEmptyRosterWarning = (
  org: string | undefined,
  classroom: string | undefined,
): EmptyRosterWarning => {
  const { students, isLoading: studentsLoading } = useGetStudents(
    org,
    classroom,
  )
  const { statusAvailable, statusLoading, partition } = useRosterStatus(
    org ?? "",
    classroom ?? "",
    students,
  )

  const enrolledCount =
    statusAvailable && !statusLoading
      ? partition.enrolled.length
      : students.filter((s) => s.enrollment_status === "enrolled").length

  // Don't decide until the roster and (when available) live status have loaded.
  const isLoading = studentsLoading || (statusAvailable && statusLoading)

  return {
    show: !isLoading && enrolledCount === 0,
    hasRosterRows: students.length > 0,
    isLoading,
  }
}

export default useEmptyRosterWarning
