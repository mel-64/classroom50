import type { Student } from "@/types/classroom"
import type { GitHubOrgInvitation, GitHubUser } from "@/hooks/github/types"

export type InviteStatus = "member" | "pending" | "expired" | "none"

export type StudentInviteStatus = {
  status: InviteStatus
  // The invitation id for an "expired" student, used to cancel before resend.
  invitationId?: number
  // The matched invitation's created_at (pending or failed), for "invited <when>".
  invitedAt?: string
}

const lower = (value: string | null | undefined) => (value ?? "").toLowerCase()

// Builds lookups once for a roster, then classifies each student. Members are
// matched on numeric id (authoritative) with a lowercased-login fallback;
// invitations carry no invitee id, so they are matched on login / email.
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

    if ((githubId && memberIds.has(githubId)) || memberLogins.has(login)) {
      return { status: "member" }
    }

    const pending =
      (login ? pendingByLogin.get(login) : undefined) ??
      (email ? pendingByEmail.get(email) : undefined)
    if (pending) {
      return { status: "pending", invitedAt: pending.created_at }
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
