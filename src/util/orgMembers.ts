import type { Student } from "@/types/classroom"
import type { GitHubUser } from "@/hooks/github/types"
import { memberIdSet } from "@/util/inviteStatus"
import { studentKey } from "@/util/roster"

// One classroom a student appears on, with that classroom's per-row status.
export type ClassroomAccess = {
  classroom: string
  archived: boolean
  enrollment_status: Student["enrollment_status"]
  section: string
}

// How an aggregated row relates org membership to roster presence (#76):
//  - member-on-roster: a healthy member on >=1 roster.
//  - on-roster-not-member: the discrepancy this issue targets — on a roster but
//    no longer (or never) an org member.
//  - member-no-roster: an org member on no classroom roster (e.g. a co-teacher,
//    or a leftover after an unenroll).
export type MemberClassification =
  | "member-on-roster"
  | "on-roster-not-member"
  | "member-no-roster"

export type OrgMemberRow = {
  // Stable identity, mirroring studentKey (github_id || username || email).
  key: string
  username: string
  github_id: string
  name: string
  email: string
  avatarUrl?: string
  isMember: boolean
  classrooms: ClassroomAccess[]
  classification: MemberClassification
}

export type ClassroomRoster = {
  classroom: string
  archived: boolean
  students: Student[]
}

// Pick the better display name for the same student seen across rosters: prefer
// a row that carries a name over one that doesn't.
const fullName = (s: Student) =>
  [s.first_name, s.last_name].map((part) => part.trim()).filter(Boolean).join(" ")

// Deduplicate students across every roster (by studentKey), match each to a live
// org member by numeric github_id, fold in org members that appear on no roster,
// and classify every row. Pure so the dedupe/match/classify logic is testable
// without react-query. Members and rosters are matched on the SAME keys the
// per-classroom roster uses (studentKey / memberIdSet) so the two views agree.
export function aggregateOrgMembers(
  members: GitHubUser[],
  rosters: ClassroomRoster[],
): OrgMemberRow[] {
  const memberIds = memberIdSet(members)

  type Acc = {
    key: string
    username: string
    github_id: string
    name: string
    email: string
    classrooms: ClassroomAccess[]
  }
  const byKey = new Map<string, Acc>()

  for (const roster of rosters) {
    for (const student of roster.students) {
      const key = studentKey(student)
      if (!key) continue
      const access: ClassroomAccess = {
        classroom: roster.classroom,
        archived: roster.archived,
        enrollment_status: student.enrollment_status,
        section: student.section?.trim() ?? "",
      }
      const existing = byKey.get(key)
      if (existing) {
        existing.classrooms.push(access)
        // Backfill identity/name from whichever row carries it.
        if (!existing.username && student.username)
          existing.username = student.username
        if (!existing.github_id && student.github_id)
          existing.github_id = student.github_id
        if (!existing.email && student.email) existing.email = student.email
        if (!existing.name && fullName(student)) existing.name = fullName(student)
      } else {
        byKey.set(key, {
          key,
          username: student.username ?? "",
          github_id: student.github_id ?? "",
          name: fullName(student),
          email: student.email ?? "",
          classrooms: [access],
        })
      }
    }
  }

  const rows: OrgMemberRow[] = []
  const matchedMemberIds = new Set<string>()

  for (const acc of byKey.values()) {
    const isMember = Boolean(acc.github_id) && memberIds.has(acc.github_id)
    if (isMember) matchedMemberIds.add(acc.github_id)
    rows.push({
      key: acc.key,
      username: acc.username,
      github_id: acc.github_id,
      name: acc.name,
      email: acc.email,
      isMember,
      classrooms: acc.classrooms,
      classification: isMember ? "member-on-roster" : "on-roster-not-member",
    })
  }

  // Org members on no roster.
  for (const member of members) {
    const id = String(member.id)
    if (matchedMemberIds.has(id)) continue
    rows.push({
      key: id,
      username: member.login,
      github_id: id,
      name: member.name ?? "",
      email: member.email ?? "",
      avatarUrl: member.avatar_url,
      isMember: true,
      classrooms: [],
      classification: "member-no-roster",
    })
  }

  // Discrepancies first (the actionable rows), then members, then by login/name.
  const order: Record<MemberClassification, number> = {
    "on-roster-not-member": 0,
    "member-on-roster": 1,
    "member-no-roster": 2,
  }
  rows.sort((a, b) => {
    const byClass = order[a.classification] - order[b.classification]
    if (byClass !== 0) return byClass
    return (a.username || a.name || a.email).localeCompare(
      b.username || b.name || b.email,
    )
  })

  return rows
}
