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

// A student's onboarding self-report, parsed from the onboarding repo's YAML.
// github_id/github_username are GitHub-attested; email and the names are claimed
// by the student. The match keys (github_id/email) classify "ready"; the names
// let the teacher roster backfill a CSV row missing first/last name before
// enrollment is confirmed. first_name/last_name are optional for back-compat
// with pre-name payloads; github_username is always present (YAML schema
// requires it).
export type OnboardingSelfReport = {
  github_id: string
  email: string
  github_username: string
  first_name?: string
  last_name?: string
}

export type StudentInviteStatus = {
  status: InviteStatus
  // Invitation id for an "expired" student, used to cancel before resend.
  invitationId?: number
  // The matched invitation's created_at, for "Invited <when>".
  invitedAt?: string
  // The onboarding self-report this row matched (by github_id, else email),
  // when one exists. Present for "ready" rows; the edit modal reads its names.
  selfReport?: OnboardingSelfReport
}

const lower = (value: string | null | undefined) => (value ?? "").toLowerCase()

// String github_ids of the org's live members, the key both member-status
// classification and the "Mark enrolled" gate match a roster row's github_id on.
export function memberIdSet(members: GitHubUser[]) {
  return new Set(members.map((member) => String(member.id)))
}

// Builds lookups once, then classifies each student. Members match on numeric
// id (login fallback); invitations match on login / email. onboardedReports are
// the parsed self-reports that currently exist; a not-yet-enrolled student who
// matches one is "ready". Pass undefined while reports are still loading/errored
// so a not-yet-known empty set isn't mistaken for "nobody onboarded".
export function buildInviteStatusLookup(
  members: GitHubUser[],
  pendingInvitations: GitHubOrgInvitation[],
  failedInvitations: GitHubOrgInvitation[],
  onboardedReports: OnboardingSelfReport[] = [],
) {
  const memberIds = memberIdSet(members)
  const memberLogins = new Set(members.map((member) => lower(member.login)))

  // Self-reports indexed by both keys a row can match on: github_id (username-
  // invited rows) and normalized email (email-invited rows, no github_id yet).
  // Keep the full report on each index so a matched row can read its names.
  const reportById = new Map<string, OnboardingSelfReport>()
  const reportByEmail = new Map<string, OnboardingSelfReport>()
  for (const report of onboardedReports) {
    const id = report.github_id.trim()
    const email = normalizeEmail(report.email)
    if (id && !reportById.has(id)) reportById.set(id, report)
    if (email && !reportByEmail.has(email)) reportByEmail.set(email, report)
  }

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

    // CSV records completeness, but an enrolled student can later leave the org.
    // Cross-check the immutable github_id against LIVE org members: present ->
    // "member"; absent -> "removed". Narrows the prior contract for the
    // presence check only — completeness (enrolled) stays CSV-owned.
    if (enrollment === "enrolled") {
      if (githubId && !memberIds.has(githubId)) {
        return { status: "removed" }
      }
      return { status: "member" }
    }

    // Not yet enrolled. A matching self-report (by github_id, or email for an
    // email-invited row) means they've onboarded and are READY to confirm.
    // Otherwise surface a still-pending/expired GitHub invite for resend, else
    // "onboarding" (invited, nothing to confirm yet).
    if (enrollment === "invited") {
      const matchedReport =
        (githubId ? reportById.get(githubId) : undefined) ??
        (email ? reportByEmail.get(email) : undefined)
      if (matchedReport) {
        return { status: "ready", selfReport: matchedReport }
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

    // Legacy rows (no enrollment_status): fall back to org-list classification.
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
