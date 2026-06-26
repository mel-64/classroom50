import type { Student } from "@/types/classroom"
import type { GitHubOrgInvitation, GitHubUser } from "@/hooks/github/types"

export type InviteStatus =
  | "member"
  | "pending"
  | "expired"
  | "onboarding"
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
export function buildInviteStatusLookup(
  members: GitHubUser[],
  pendingInvitations: GitHubOrgInvitation[],
  failedInvitations: GitHubOrgInvitation[],
) {
  const memberIds = new Set(members.map((member) => String(member.id)))
  const memberLogins = new Set(members.map((member) => lower(member.login)))

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

    // CSV is the source of truth for completeness: a reconciled row is "member"
    // (complete) regardless of the live org lists.
    if (enrollment === "reconciled") {
      return { status: "member" }
    }

    // Not yet reconciled but invited/onboarded -> "onboarding" (awaiting the
    // teacher's reconcile), even if the student is already an org member (the
    // username invite flow). This is the hybrid: org lists no longer decide the
    // onboarded/complete state; enrollment_status does.
    if (enrollment === "invited" || enrollment === "onboarded") {
      // Surface a still-pending/expired GitHub invite (org-list derived) so the
      // teacher can resend; otherwise it's simply awaiting onboarding.
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
