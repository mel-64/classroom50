import { Check, Copy, Send, Trash } from "lucide-react"

import { getName, getInitials } from "@/util/students"
import { formatInvitedAt } from "@/util/formatDate"
import Avatar from "@/components/avatar"
import type { Student } from "@/types/classroom"
import { ConfirmModal } from "@/components/modals"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { unenrollStudent } from "@/api/mutations/students"
import type { UnenrollStudentInput } from "@/api/mutations/students"
import { resendOrgInvitation, getErrorMessage } from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { githubKeys } from "@/hooks/github/queries"
import useGetOrgMembers from "@/hooks/useGetOrgMembers"
import useGetOrgInvitations from "@/hooks/useGetOrgInvitations"
import { useGitHubViewer } from "@/hooks/github/hooks"
import {
  buildInviteStatusLookup,
  type InviteStatus,
  type StudentInviteStatus,
} from "@/util/inviteStatus"
import { useEffect, useMemo, useRef, useState } from "react"

const UnenrollStudentButton = ({
  org,
  classroom,
  student,
  status,
  isSelf = false,
  onRemoveStudent,
}: {
  org: string
  classroom: string
  student: Student
  status?: InviteStatus
  isSelf?: boolean
  onRemoveStudent: (username: string, teamWarning?: string) => void
}) => {
  const client = useGitHubClient()
  const unenrollStudentMutation = useMutation({
    mutationFn: (input: UnenrollStudentInput) => unenrollStudent(client, input),
  })
  const [open, setOpen] = useState(false)
  const [removeFromOrg, setRemoveFromOrg] = useState(false)

  // Only an active member offers the "also remove from org" choice. A pending
  // invite is always cancelled by the mutation (they were never a member), and
  // a non-member has nothing org-side to do — so no checkbox in those cases.
  // The signed-in account (e.g. an owner who added themselves as a test
  // student) can't be removed from their own org here, so no checkbox either.
  const isMember = status === "member"
  const canRemoveFromOrg = isMember && !isSelf
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const closeDialog = () => {
    if (submitting) return
    setOpen(false)
    setRemoveFromOrg(false)
    setError(null)
  }

  const handleConfirm = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await unenrollStudentMutation.mutateAsync({
        org,
        classroom,
        student,
        removeFromOrg: canRemoveFromOrg ? removeFromOrg : false,
      })
      // Hand the warning to the list keyed by username (this button unmounts
      // on roster refetch); keying stops a concurrent clean unenroll from
      // clobbering an unread warning.
      onRemoveStudent(student.username, result.teamWarning)
      setOpen(false)
      setRemoveFromOrg(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={unenrollStudentMutation.isPending}
        className="btn btn-ghost btn-square text-error"
        aria-label={`Unenroll ${student.username}`}
      >
        <Trash />
      </button>

      <dialog
        ref={dialogRef}
        className="modal"
        onClose={closeDialog}
        onCancel={(event) => {
          if (submitting) {
            event.preventDefault()
            return
          }
          closeDialog()
        }}
      >
        <div className="modal-box max-w-lg">
          <h3 className="text-lg font-bold">Unenroll student from roster?</h3>

          <div className="mt-2 text-sm leading-6 text-base-content/70">
            This will remove student{" "}
            <span className="font-semibold text-base-content">
              {student.username}
            </span>{" "}
            from the{" "}
            <span className="font-semibold text-base-content">{org}</span>{" "}
            {classroom} classroom. Student assignment repositories will not be
            deleted.
            {status === "pending" ? (
              <span className="mt-2 block">
                Their pending organization invite will be cancelled.
              </span>
            ) : null}
          </div>

          {isMember && isSelf ? (
            <div className="mt-4 rounded-box border border-base-300 bg-base-200/50 p-4 text-sm text-base-content/70">
              This is your signed-in account, so it will stay in the{" "}
              <span className="font-semibold">{org}</span> organization. Remove
              yourself from the organization's people page if you really intend
              to.
            </div>
          ) : null}

          {canRemoveFromOrg ? (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-box border border-base-300 bg-base-200/50 p-4">
              <input
                type="checkbox"
                className="checkbox checkbox-sm mt-0.5"
                checked={removeFromOrg}
                disabled={submitting}
                onChange={(event) => setRemoveFromOrg(event.target.checked)}
              />
              <span className="text-sm text-base-content/80">
                Also remove{" "}
                <span className="font-semibold text-base-content">
                  {student.username}
                </span>{" "}
                from the <span className="font-semibold">{org}</span>{" "}
                organization. Leave unchecked if they are switching between your
                classes — keeping their membership avoids re-inviting them.
              </span>
            </label>
          ) : null}

          {error ? (
            <div className="alert alert-error alert-soft mt-4 text-sm">
              {error}
            </div>
          ) : null}

          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={submitting}
              onClick={closeDialog}
            >
              Keep student
            </button>
            <button
              type="button"
              className="btn btn-error text-white"
              disabled={submitting}
              onClick={() => void handleConfirm()}
            >
              {submitting ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Working...
                </>
              ) : isMember && removeFromOrg && !isSelf ? (
                "Unenroll & remove from org"
              ) : (
                "Unenroll student"
              )}
            </button>
          </div>
        </div>

        <form method="dialog" className="modal-backdrop">
          <button type="button" disabled={submitting} onClick={closeDialog}>
            close
          </button>
        </form>
      </dialog>
    </>
  )
}

const InviteStatusBadge = ({ status }: { status: InviteStatus }) => {
  if (status === "pending") {
    return (
      <span className="badge badge-warning badge-soft">Pending invite</span>
    )
  }
  if (status === "expired") {
    return <span className="badge badge-error badge-soft">Expired invite</span>
  }
  if (status === "none") {
    return <span className="badge badge-ghost badge-soft">Not in org</span>
  }
  return null
}

// A copy-pasteable link teachers can share so students land on GitHub's org
// invitation page and accept. It's the same org-wide accept URL for everyone —
// no per-student token — so it's safe to share with the whole class.
const InviteLink = ({ org }: { org: string }) => {
  const inviteUrl = `https://github.com/orgs/${org}/invitation`
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-1 px-6 py-3 border-b border-base-300 bg-base-200/40">
      <span className="text-xs font-medium text-base-content/60">
        Share this link so students can accept their organization invite:
      </span>
      <div className="join w-full">
        <input
          type="text"
          readOnly
          value={inviteUrl}
          aria-label="Student invite link"
          onFocus={(event) => event.currentTarget.select()}
          className="input input-sm input-bordered join-item w-full font-mono text-xs"
        />
        <button
          type="button"
          className="btn btn-sm join-item"
          onClick={() => void handleCopy()}
          aria-label="Copy invite link"
        >
          {copied ? (
            <>
              <Check className="size-4 text-success" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-4" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  )
}

const EnrolledStudents = ({
  students = [],
  org,
  classroom,
}: {
  students: Student[]
  org: string
  classroom: string
}) => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  // Keyed by username so a clean unenroll can't clobber another student's
  // unread warning.
  const [teamWarnings, setTeamWarnings] = useState<Record<string, string>>({})
  const [confirmResendAllOpen, setConfirmResendAllOpen] = useState(false)
  const [resendingUsernames, setResendingUsernames] = useState<Set<string>>(
    new Set(),
  )

  const { members } = useGetOrgMembers(org)
  const { data: viewer } = useGitHubViewer()
  const {
    invitations,
    failedInvitations,
    isLoading: invitesLoading,
    isForbidden: invitesForbidden,
  } = useGetOrgInvitations(org)

  const statusLoading = members === undefined || invitesLoading
  // Owner-only endpoints 403 for non-owners: we can't determine invite status,
  // so hide all badges/affordances and explain why instead of an empty grid.
  const statusAvailable = !invitesForbidden

  const getStatus = useMemo(
    () =>
      buildInviteStatusLookup(
        members ?? [],
        invitations,
        failedInvitations,
      ),
    [members, invitations, failedInvitations],
  )

  const statusByUsername = useMemo(() => {
    const map = new Map<string, StudentInviteStatus>()
    if (statusLoading || !statusAvailable) return map
    for (const student of students) {
      map.set(student.username, getStatus(student))
    }
    return map
  }, [students, getStatus, statusLoading, statusAvailable])

  // Everyone who is not already an org member — pending, expired, or never
  // invited. "Resend invites" targets this set: cancel any existing invitation
  // (pending/expired) and create a fresh one for each.
  const nonMemberStudents = useMemo(
    () =>
      students.filter((student) => {
        const status = statusByUsername.get(student.username)?.status
        return status != null && status !== "member"
      }),
    [students, statusByUsername],
  )

  const setWarning = (username: string, message: string) =>
    setTeamWarnings((prev) => ({ ...prev, [username]: message }))

  const dismissWarning = (username: string) =>
    setTeamWarnings((prev) => {
      const next = { ...prev }
      delete next[username]
      return next
    })

  const invalidateInviteQueries = () => {
    queryClient.invalidateQueries({ queryKey: githubKeys.orgInvitations(org) })
    queryClient.invalidateQueries({
      queryKey: githubKeys.orgFailedInvitations(org),
    })
    queryClient.invalidateQueries({
      queryKey: ["orgs", "list", "members", org],
    })
  }

  // Resend (or first-time invite) for one student. Returns true on success.
  // `none` students have no invitation id, so this is a plain create; `expired`
  // students carry an id we cancel before re-creating.
  const resendForStudent = async (student: Student): Promise<boolean> => {
    const inviteeId = Number(student.github_id)
    if (!Number.isFinite(inviteeId) || inviteeId <= 0) {
      setWarning(
        student.username,
        `Can't re-send the invite for ${student.username}: missing GitHub id. Re-add them to the roster.`,
      )
      return false
    }

    const status = statusByUsername.get(student.username)
    await resendOrgInvitation(client, {
      org,
      username: student.username,
      inviteeId,
      invitationId: status?.invitationId,
    })
    return true
  }

  const resendMutation = useMutation({
    mutationFn: (student: Student) => resendForStudent(student),
  })

  const handleResend = async (student: Student) => {
    setResendingUsernames((prev) => new Set(prev).add(student.username))
    dismissWarning(student.username)
    try {
      await resendMutation.mutateAsync(student)
      invalidateInviteQueries()
    } catch (err) {
      setWarning(
        student.username,
        `Re-sending the invite for ${student.username} failed (${getErrorMessage(err)}).`,
      )
    } finally {
      setResendingUsernames((prev) => {
        const next = new Set(prev)
        next.delete(student.username)
        return next
      })
    }
  }

  // Sequential (not concurrent) to respect GitHub's 50/24h invite cap and
  // secondary rate limiting. Cancels any existing invitation then re-creates,
  // for every non-member student. Aggregates a single summary warning.
  const handleResendAll = async () => {
    let succeeded = 0
    const failures: string[] = []

    for (const student of nonMemberStudents) {
      try {
        const ok = await resendForStudent(student)
        if (ok) succeeded++
        else failures.push(student.username)
      } catch (err) {
        failures.push(student.username)
        console.error(`resend failed for ${student.username}:`, err)
      }
    }

    invalidateInviteQueries()

    const summaryKey = "__resend_all__"
    if (failures.length === 0) {
      setWarning(
        summaryKey,
        `Re-sent ${succeeded} invite${succeeded === 1 ? "" : "s"}.`,
      )
    } else {
      setWarning(
        summaryKey,
        `Re-sent ${succeeded} of ${nonMemberStudents.length}; ${failures.length} failed (${failures.join(", ")}).`,
      )
    }
  }

  return (
    <div className="card card-border w-full bg-base-100 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
        <h2 className="text-lg font-semibold">Enrolled Students</h2>

        <div className="flex items-center gap-2">
          {statusAvailable ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setConfirmResendAllOpen(true)}
            >
              <Send className="size-4" />
              Resend invites
            </button>
          ) : null}

          <div className="badge badge-primary badge-soft text-base">
            {students.length}
          </div>
        </div>
      </div>

      <InviteLink org={org} />

      {!statusAvailable ? (
        <div role="alert" className="alert alert-info alert-soft mx-6 mt-4">
          <span className="text-sm">
            Invite status requires organization owner access, so it isn't shown
            here.
          </span>
        </div>
      ) : null}

      {Object.entries(teamWarnings).map(([username, warning]) => (
        <div
          key={username}
          role="alert"
          className="alert alert-warning alert-soft mx-6 mt-4"
        >
          <span className="text-sm">{warning}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => dismissWarning(username)}
          >
            Dismiss
          </button>
        </div>
      ))}

      <ul className="divide-y divide-base-300">
        {students?.map((student) => {
          const statusEntry = statusByUsername.get(student.username)
          const status = statusEntry?.status
          const showResend = status === "expired" || status === "none"
          const isResending = resendingUsernames.has(student.username)
          const invitedAtLabel =
            status === "pending" || status === "expired"
              ? formatInvitedAt(statusEntry?.invitedAt)
              : null
          const isSelf =
            viewer != null &&
            (String(viewer.id) === String(student.github_id) ||
              viewer.login.toLowerCase() === student.username.toLowerCase())

          return (
            <li
              key={student.username}
              className="flex items-center gap-4 px-6 py-4 justify-between"
            >
              <Avatar
                name={getName(student.username, students)}
                github={student.username}
                initials={getInitials(student.username, students)}
              />

              <div className="flex items-center gap-2">
                {statusAvailable && status ? (
                  <div className="flex flex-col items-end gap-0.5">
                    <InviteStatusBadge status={status} />
                    {invitedAtLabel ? (
                      <span className="text-xs text-base-content/50">
                        Invited {invitedAtLabel}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {statusAvailable && showResend ? (
                  <button
                    type="button"
                    className="btn btn-xs"
                    disabled={isResending}
                    aria-label={
                      status === "none"
                        ? `Send invite to ${student.username}`
                        : `Re-send invite to ${student.username}`
                    }
                    onClick={() => void handleResend(student)}
                  >
                    {isResending ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : status === "none" ? (
                      "Send invite"
                    ) : (
                      "Re-send"
                    )}
                  </button>
                ) : null}

                <UnenrollStudentButton
                  org={org}
                  classroom={classroom}
                  student={student}
                  status={statusAvailable ? status : undefined}
                  isSelf={isSelf}
                  onRemoveStudent={(username: string, warning?: string) => {
                    // Record only a real warning; a clean unenroll must not wipe one.
                    if (warning) {
                      setWarning(username, warning)
                    }
                    queryClient.invalidateQueries({
                      queryKey: githubKeys.csvFile(
                        org,
                        "classroom50",
                        `${classroom}/students.csv`,
                      ),
                    })
                    // Unenroll may have cancelled a pending invite or removed an
                    // org member — refresh the lists that drive invite status.
                    invalidateInviteQueries()
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      <ConfirmModal
        open={confirmResendAllOpen}
        title="Resend invites to all students?"
        description={
          <>
            All pending organization invitations will be{" "}
            <span className="font-semibold text-base-content">
              deleted and then resent
            </span>
            . After this, every student who is not already a member of{" "}
            <span className="font-semibold text-base-content">{org}</span> —{" "}
            <span className="font-semibold text-base-content">
              {nonMemberStudents.length}
            </span>{" "}
            student{nonMemberStudents.length === 1 ? "" : "s"} — will receive a
            new invitation email.
          </>
        }
        confirmText="resend"
        confirmLabel="Resend invites"
        cancelLabel="Cancel"
        dangerous={false}
        needsConfirm={false}
        onConfirm={async () => {
          await handleResendAll()
        }}
        onClose={() => setConfirmResendAllOpen(false)}
      />
    </div>
  )
}

export default EnrolledStudents
