import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, ShieldCheck, UserPlus, X } from "lucide-react"
import { GitHubLink } from "@/components/GitHubLink"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useGithubAuth } from "@/auth/useGithubAuth"
import { useToast } from "@/context/notifications/NotificationProvider"
import {
  githubKeys,
  teamMembersQuery,
  getUserQuery,
} from "@/hooks/github/queries"
import {
  addUserToTeam,
  ensureClassroomRoleTeam,
  removeUserFromTeam,
  staffTeamName,
  grantTeamConfigRepoWrite,
} from "@/hooks/github/mutations"
import { normalizeGithubUsername } from "@/api/mutations/students"
import { GitHubAPIError } from "@/hooks/github/errors"
import { STAFF_ROLES, type StaffRole } from "@/types/classroom"
import type { GitHubUser } from "@/hooks/github/types"

const ROLE_LABEL: Record<StaffRole, string> = {
  instructor: "Instructor",
  ta: "TA",
}

// Manage a classroom's staff (instructor / TA), backed by the per-classroom
// GitHub teams `classroom50-<classroom>-<role>`. The page already gates the
// route; the actions assume instructor/owner.
const ClassroomStaffSection = ({
  org,
  classroom,
  disabled = false,
}: {
  org: string
  classroom: string
  // Archived classroom => read-only (mirrors the settings form's fieldset).
  disabled?: boolean
}) => {
  return (
    <div className="card bg-base-100 w-full shadow-sm mt-8">
      <div className="card-body">
        <div className="flex items-center gap-3 pb-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-base-content/70" />
            <h3 className="text-lg font-bold">Staff &amp; roles</h3>
          </div>
          <GitHubLink
            href={`https://github.com/orgs/${org}/teams`}
            label="GitHub teams"
            title="Open this organization's teams on GitHub"
            className="shrink-0"
          />
        </div>
        <p className="text-sm text-base-content/60 pb-4">
          Instructors and TAs get write access to this organization&apos;s
          Classroom 50 configuration. TAs see the same classroom content as
          instructors, but organization and classroom settings stay
          instructor-only.
        </p>

        <AddStaff org={org} classroom={classroom} disabled={disabled} />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mt-2">
          {STAFF_ROLES.map((role) => (
            <StaffRoleList
              key={role}
              org={org}
              classroom={classroom}
              role={role}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Add a GitHub user to a role team. Ensures the team exists first (the
// "preflight" guarantee: a classroom missing a staff team self-heals here) and
// grants it config-repo write, then adds the user.
const AddStaff = ({
  org,
  classroom,
  disabled,
}: {
  org: string
  classroom: string
  disabled: boolean
}) => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const { user } = useGithubAuth()
  const [username, setUsername] = useState("")
  const [role, setRole] = useState<StaffRole>("ta")

  const addMutation = useMutation({
    mutationFn: async (input: { username: string; role: StaffRole }) => {
      const trimmed = normalizeGithubUsername(input.username)
      if (!trimmed) throw new Error("Enter a GitHub username.")
      // Verify the account exists for a clear error (vs. a confusing team 422).
      await queryClient.ensureQueryData(getUserQuery(client, trimmed))
      // Ensure-as-preflight: create the team if missing + (re)grant config write.
      const team = await ensureClassroomRoleTeam(
        client,
        org,
        classroom,
        input.role,
      )
      await grantTeamConfigRepoWrite(client, org, team.slug)
      // GitHub auto-adds the team CREATOR as a maintainer. If THIS action just
      // created the team, the acting user got auto-added — remove them unless
      // they're the intended target, so adding a TA doesn't make the instructor
      // a TA too.
      if (
        team.created &&
        user?.login &&
        user.login.toLowerCase() !== trimmed.toLowerCase()
      ) {
        try {
          await removeUserFromTeam(client, {
            org,
            teamSlug: team.slug,
            username: user.login,
          })
        } catch {
          // Best-effort; the actor can remove themselves via this same UI.
        }
      }
      await addUserToTeam(client, {
        org,
        teamSlug: team.slug,
        username: trimmed,
        role: "member",
      })
      return { trimmed, role: input.role }
    },
    onSuccess: ({ trimmed, role: addedRole }) => {
      setUsername("")
      queryClient.invalidateQueries({
        queryKey: githubKeys.teamMembers(
          org,
          staffTeamName(classroom, addedRole),
        ),
      })
      notify({
        tone: "success",
        durationMs: 5000,
        message: `Added @${trimmed} as ${ROLE_LABEL[addedRole]}.`,
      })
    },
    onError: (err) => {
      const message =
        err instanceof GitHubAPIError && err.status === 404
          ? "No such GitHub user."
          : err instanceof Error
            ? err.message
            : "Something went wrong."
      notify({ tone: "error", message: `Couldn't add staff: ${message}` })
    },
  })

  return (
    <form
      className="flex flex-wrap items-end gap-2 mb-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (disabled) return
        addMutation.mutate({ username, role })
      }}
    >
      <div className="grow min-w-[12rem]">
        <label htmlFor="staff-username" className="label font-bold text-sm">
          GitHub username
        </label>
        <input
          id="staff-username"
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="input w-full"
          placeholder="e.g. octocat"
          value={username}
          disabled={disabled || addMutation.isPending}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="staff-role" className="label font-bold text-sm">
          Role
        </label>
        <select
          id="staff-role"
          className="select"
          value={role}
          disabled={disabled || addMutation.isPending}
          onChange={(e) => setRole(e.target.value as StaffRole)}
        >
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="btn btn-primary"
        disabled={disabled || addMutation.isPending || !username.trim()}
      >
        {addMutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <UserPlus className="size-4" />
        )}
        Add
      </button>
    </form>
  )
}

const StaffRoleList = ({
  org,
  classroom,
  role,
  disabled,
}: {
  org: string
  classroom: string
  role: StaffRole
  disabled: boolean
}) => {
  const client = useGitHubClient()
  const teamSlug = useMemo(
    () => staffTeamName(classroom, role),
    [classroom, role],
  )
  const membersQuery = useQuery(teamMembersQuery(client, org, teamSlug))
  const members = membersQuery.data ?? []

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h4 className="font-bold">{ROLE_LABEL[role]}s</h4>
        <span className="badge badge-sm badge-ghost">{members.length}</span>
      </div>
      {membersQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-base-content/50">
          No {ROLE_LABEL[role].toLowerCase()}s yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {members.map((member) => (
            <StaffMemberRow
              key={member.id}
              org={org}
              classroom={classroom}
              role={role}
              member={member}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

const StaffMemberRow = ({
  org,
  classroom,
  role,
  member,
  disabled,
}: {
  org: string
  classroom: string
  role: StaffRole
  member: GitHubUser
  disabled: boolean
}) => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const teamSlug = staffTeamName(classroom, role)

  const removeMutation = useMutation({
    mutationFn: () =>
      removeUserFromTeam(client, { org, teamSlug, username: member.login }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: githubKeys.teamMembers(org, teamSlug),
      })
      notify({
        tone: "success",
        durationMs: 4000,
        message: `Removed @${member.login} from ${ROLE_LABEL[role]}s.`,
      })
    },
    onError: (err) => {
      notify({
        tone: "error",
        message: `Couldn't remove @${member.login}: ${
          err instanceof Error ? err.message : "something went wrong"
        }`,
      })
    },
  })

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-base-200 px-2 py-1.5">
      <a
        href={member.html_url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 min-w-0 hover:underline"
      >
        <img
          src={member.avatar_url}
          alt=""
          className="size-6 rounded-full shrink-0"
        />
        <span className="truncate text-sm">@{member.login}</span>
        <span
          className={`badge badge-xs shrink-0 ${
            role === "instructor" ? "badge-primary" : "badge-secondary"
          } badge-soft`}
        >
          {ROLE_LABEL[role]}
        </span>
      </a>
      <button
        type="button"
        className="btn btn-ghost btn-xs text-error"
        title={`Remove ${ROLE_LABEL[role]}`}
        disabled={disabled || removeMutation.isPending}
        onClick={() => removeMutation.mutate()}
      >
        {removeMutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <X className="size-3.5" />
        )}
      </button>
    </li>
  )
}

export default ClassroomStaffSection
