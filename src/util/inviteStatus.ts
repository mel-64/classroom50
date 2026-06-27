import type { Student } from "@/types/classroom"
import type { GitHubOrgInvitation, GitHubUser } from "@/hooks/github/types"
import { normalizeEmail } from "@/util/onboarding"

export type InviteStatus =
  | "member"
  | "pending"
  | "expired"
  | "onboarding"
  | "ready"
  | "removed"
  | "none"

export type StudentInviteStatus = {
  status: InviteStatus
  // The invitation id for an "expired" student, used to cancel before resend.
  invitationId?: number
  // The matched invitation's created_at, for "Invited <when>".
  invitedAt?: string
}

const lower = (value: string | null | undefined) => (value ?? "").toLowerCase()

// Builds lookups once, then classifies each student. Members match on numeric
// id (login fallback); invitations match on login / email (no invitee id).
// onboardedReports are the parsed onboarding self-reports that currently exist
// (one per onboarding repo): a not-yet-enrolled student who matches one has
// onboarded and is "ready" to confirm; one who doesn't is "pending"/"expired"
// (a live GitHub invite is still outstanding) or "onboarding" (invited, no
// self-report yet). Pass undefined while the reports are still loading/errored
// so a not-yet-known empty set isn't mistaken for "nobody onboarded".
export function buildInviteStatusLookup(
  members: GitHubUser[],
  pendingInvitations: GitHubOrgInvitation[],
  failedInvitations: GitHubOrgInvitation[],
  onboardedReports: { github_id: string; email: string }[] = [],
) {
  const memberIds = new Set(members.map((member) => String(member.id)))
  const memberLogins = new Set(members.map((member) => lower(member.login)))

  // Onboarding self-reports indexed by both keys a roster row can match on: the
  // GitHub id (username-invited rows already carry it) and the normalized email
  // (email-invited rows, which have no github_id until reconcile).
  const onboardedIds = new Set(
    onboardedReports.map((report) => report.github_id.trim()).filter(Boolean),
  )
  const onboardedEmails = new Set(
    onboardedReports
      .map((report) => normalizeEmail(report.email))
      .filter(Boolean),
  )

  const pendingByLogin = new Map<string, GitHubOrgInvitation>()
  const pendingByEmail = new Map<string, GitHubOrgInvitation>()
  for (const invite of pendingInvitations) {
    const login = lower(invite.login)
    const email = lower(invite.email)
    if (login && !pendingByLogin.has(login)) pendingByLogin.set(login, invite)
    if (email && !pendingByEmail.has(email)) pendingByEmail.set(email, invite)
  }

  const failedByLogin = new Map<string, GitHubOrgInvitation>()
  const failedByEmail = new Map<string, GitHubOrgInvitation>()
  for (const invite of failedInvitations) {
    const login = lower(invite.login)
    const email = lower(invite.email)
    if (login && !failedByLogin.has(login)) failedByLogin.set(login, invite)
    if (email && !failedByEmail.has(email)) failedByEmail.set(email, invite)
  }

  return (student: Student): StudentInviteStatus => {
    const login = lower(student.username)
    const email = lower(student.email)
    const githubId = student.github_id?.trim()
    const enrollment = student.enrollment_status

    // CSV records completeness, but an enrolled student can later leave (or be
    // removed from) the org. Cross-check the immutable github_id against the
    // LIVE org members: present -> "member"; absent -> "removed" ("Not in
    // organization"). This intentionally narrows the prior contract ("an
    // enrolled row is member regardless of the live lists") for the
    // membership-presence check only — completeness (enrolled) is still CSV-
    // owned, but presence is verified against current GitHub state.
    if (enrollment === "enrolled") {
      if (githubId && !memberIds.has(githubId)) {
        return { status: "removed" }
      }
      return { status: "member" }
    }

    // Not yet enrolled. If an onboarding self-report exists for this student
    // (matched by github_id, or by email for an email-invited row with no id
    // yet), they've onboarded and are READY for the teacher to confirm
    // (state 2). Otherwise they haven't created their onboarding repo yet —
    // surface a still-pending/expired GitHub invite so the teacher can resend,
    // else "onboarding" (invited, nothing to confirm yet = state 1).
    if (enrollment === "invited") {
      const hasOnboarded =
        (Boolean(githubId) && onboardedIds.has(githubId)) ||
        (Boolean(email) && onboardedEmails.has(email))
      if (hasOnboarded) {
        return { status: "ready" }
      }

      const pendingInvite =
        (login ? pendingByLogin.get(login) : undefined) ??
        (email ? pendingByEmail.get(email) : undefined)
      if (pendingInvite) {
        return {
          status: "pending",
          invitationId: pendingInvite.id,
          invitedAt: pendingInvite.created_at,
        }
      }
      const failedInvite =
        (login ? failedByLogin.get(login) : undefined) ??
        (email ? failedByEmail.get(email) : undefined)
      if (failedInvite) {
        return {
          status: "expired",
          invitationId: failedInvite.id,
          invitedAt: failedInvite.created_at,
        }
      }
      return { status: "onboarding" }
    }

    // Legacy rows (no enrollment_status): fall back to the org-list
    // classification so pre-feature classrooms still show sensible status.
    if ((githubId && memberIds.has(githubId)) || memberLogins.has(login)) {
      return { status: "member" }
    }

    const pending =
      (login ? pendingByLogin.get(login) : undefined) ??
      (email ? pendingByEmail.get(email) : undefined)
    if (pending) {
      return {
        status: "pending",
        invitationId: pending.id,
        invitedAt: pending.created_at,
      }
    }

    const failed =
      (login ? failedByLogin.get(login) : undefined) ??
      (email ? failedByEmail.get(email) : undefined)
    if (failed) {
      return {
        status: "expired",
        invitationId: failed.id,
        invitedAt: failed.created_at,
      }
    }

    return { status: "none" }
  }
}
