import { Check, Copy, RefreshCw, Send, Trash } from "lucide-react"

import { getName, getInitials, isSameGitHubUser } from "@/util/students"
import { formatInvitedAt } from "@/util/formatDate"
import Avatar from "@/components/avatar"
import type { Student } from "@/types/classroom"
import { ConfirmModal } from "@/components/modals"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { reconcileOnboarding, unenrollStudent } from "@/api/mutations/students"
import type { UnenrollStudentInput } from "@/api/mutations/students"
import { resendOrgInvitation, getErrorMessage } from "@/hooks/github/mutations"
import { GitHubAPIError } from "@/hooks/github/errors"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import {
  githubKeys,
  invalidateInviteQueries as invalidateInviteQueriesForOrg,
} from "@/hooks/github/queries"
import useGetOrgMembers from "@/hooks/useGetOrgMembers"
import useGetOrgInvitations from "@/hooks/useGetOrgInvitations"
import { useGitHubViewer } from "@/hooks/github/hooks"
import {
  buildInviteStatusLookup,
  type InviteStatus,
  type StudentInviteStatus,
} from "@/util/inviteStatus"
import { isReconcilableRow } from "@/util/onboarding"
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

  // Only an active member offers the org-removal choice. Pending invites are
  // always cancelled, non-members have nothing to remove, and the signed-in
  // account can't remove itself here.
  const isMember = status === "member"
  const canRemoveFromOrg = isMember && !isSelf
  // Email-invited rows have no username yet; show the email so the button and
  // dialog are identifiable before reconciliation.
  const label = student.username || student.email
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
      // Key the warning by a stable identity (username, else email): this button
      // unmounts on roster refetch, and keying stops a concurrent clean unenroll
      // from clobbering it.
      onRemoveStudent(student.username || student.email, result.teamWarning)
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
        aria-label={`Unenroll ${label}`}
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
            <span className="font-semibold text-base-content">{label}</span>{" "}
            from the{" "}
            <span className="font-semibold text-base-content">{org}</span>{" "}
            {classroom} classroom. Student assignment repositories will not be
            deleted.
            {status === "pending" ? (
              <span className="mt-2 block">
                Their pending organization invite will be cancelled.
              </span>
            ) : null}
            {status === "onboarding" ? (
              <span className="mt-2 block">
                Their enrollment will be reset (their onboarding repository is
                removed), so a fresh invite starts over.
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
                classes, since keeping their membership avoids re-inviting them.
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
  if (status === "onboarding") {
    return <span className="badge badge-info badge-soft">Enrolled</span>
  }
  if (status === "none") {
    return <span className="badge badge-ghost badge-soft">Not in org</span>
  }
  return null
}

// A copy-paste link teachers share so students accept on GitHub. Same org-wide
// URL for everyone (no per-student token).
const InviteLink = ({ org }: { org: string }) => {
  const inviteUrl = `https://github.com/orgs/${org}/invitation`
  const { copied, copy } = useCopyToClipboard(inviteUrl)

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
          onClick={() => void copy()}
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

// Per-student secure onboarding link (the opt-in flow). Carries the student's
// email prefill plus the unguessable invite token, so the onboarding repo is
// named by token and only the recipient of this link can create it. The teacher
// emails it to that one student.
const SecureLinkButton = ({
  org,
  classroom,
  email,
  token,
}: {
  org: string
  classroom: string
  email: string
  token: string
}) => {
  const secureUrl = `${window.location.origin}/${org}/${classroom}/onboard?email=${encodeURIComponent(
    email,
  )}&t=${token}`
  const { copied, copy } = useCopyToClipboard(secureUrl)

  return (
    <button
      type="button"
      className="btn btn-xs"
      onClick={() => void copy()}
      aria-label={`Copy secure onboarding link for ${email}`}
    >
      {copied ? (
        <>
          <Check className="size-4 text-success" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-4" />
          Secure link
        </>
      )}
    </button>
  )
}

// Classroom-wide onboarding link. Students open it after accepting the org
// invite, enter their email, and self-report their GitHub identity (which the
// teacher folds in via "Reconcile onboarding"). Same URL for everyone; the
// student supplies the email, so no per-student token is needed.
const OnboardingLink = ({
  org,
  classroom,
}: {
  org: string
  classroom: string
}) => {
  const onboardUrl = `${window.location.origin}/${org}/${classroom}/onboard`
  const { copied, copy } = useCopyToClipboard(onboardUrl)

  return (
    <div className="flex flex-col gap-1 px-6 py-3 border-b border-base-300 bg-base-200/40">
      <span className="text-xs font-medium text-base-content/60">
        Email this onboarding link to students you invited by email:
      </span>
      <div className="join w-full">
        <input
          type="text"
          readOnly
          value={onboardUrl}
          aria-label="Student onboarding link"
          onFocus={(event) => event.currentTarget.select()}
          className="input input-sm input-bordered join-item w-full font-mono text-xs"
        />
        <button
          type="button"
          className="btn btn-sm join-item"
          onClick={() => void copy()}
          aria-label="Copy onboarding link"
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
  // Owner-only endpoints 403 for non-owners; hide status and explain instead.
  const statusAvailable = !invitesForbidden

  const getStatus = useMemo(
    () =>
      buildInviteStatusLookup(members ?? [], invitations, failedInvitations),
    [members, invitations, failedInvitations],
  )

  // Stable per-row identity: email rows have no username yet, so fall back to
  // email (and an index guard) to avoid empty-string key collisions across
  // multiple email-only rows.
  const studentKey = (student: Student, index: number) =>
    student.username || student.email || `row-${index}`

  const statusByKey = useMemo(() => {
    const map = new Map<string, StudentInviteStatus>()
    if (statusLoading || !statusAvailable) return map
    students.forEach((student, index) => {
      map.set(studentKey(student, index), getStatus(student))
    })
    return map
  }, [students, getStatus, statusLoading, statusAvailable])

  // Every non-member (pending, expired, onboarding, or never invited): the
  // "Resend invites" target. Onboarding rows are excluded — they've accepted and
  // just need reconciliation, not another invite.
  const nonMemberStudents = useMemo(
    () =>
      students.filter((student, index) => {
        const status = statusByKey.get(studentKey(student, index))?.status
        return status != null && status !== "member" && status !== "onboarding"
      }),
    [students, statusByKey],
  )

  const setWarning = (username: string, message: string) =>
    setTeamWarnings((prev) => ({ ...prev, [username]: message }))

  const dismissWarning = (username: string) =>
    setTeamWarnings((prev) => {
      const next = { ...prev }
      delete next[username]
      return next
    })

  const invalidateInviteQueries = () =>
    invalidateInviteQueriesForOrg(queryClient, org)

  // Resend (or first-time invite for "none"). Returns true on success. "expired"
  // carries an invitation id we cancel first; "none" is a plain create.
  // What the resend actually did, so callers don't over-report: "invited" = a
  // fresh invite sent; "pending"/"active" = no-op (still valid / already member);
  // "skipped" = couldn't attempt (missing id).
  type ResendOutcome = "invited" | "pending" | "active" | "skipped"

  const resendForStudent = async (student: Student): Promise<ResendOutcome> => {
    const inviteeId = Number(student.github_id)
    if (!Number.isFinite(inviteeId) || inviteeId <= 0) {
      setWarning(
        student.username,
        `Can't re-send the invite for ${student.username}: missing GitHub id. Re-add them to the roster.`,
      )
      return "skipped"
    }

    const status = getStatus(student)
    const result = await resendOrgInvitation(client, {
      org,
      username: student.username,
      inviteeId,
      invitationId: status?.invitationId,
    })
    return result.state
  }

  const resendMutation = useMutation({
    mutationFn: (student: Student) => resendForStudent(student),
  })

  // Rows still awaiting onboarding reconciliation (invited/onboarded, not yet
  // reconciled). Uses the shared isReconcilableRow predicate so this badge
  // count can never drift from reconcileOnboarding's actual target set.
  const pendingOnboardingCount = useMemo(
    () => students.filter(isReconcilableRow).length,
    [students],
  )

  const [reconcileSummary, setReconcileSummary] = useState("")

  const reconcileMutation = useMutation({
    mutationFn: () => reconcileOnboarding(client, { org, classroom }),
    onSuccess: (result) => {
      const parts = [`${result.reconciled.length} reconciled`]
      if (result.deleted.length > 0) {
        parts.push(`${result.deleted.length} deleted`)
      }
      if (result.archived.length > 0) {
        parts.push(`${result.archived.length} archived`)
      }
      if (result.pending.length > 0) {
        parts.push(`${result.pending.length} still pending`)
      }
      if (result.unmatched.length > 0) {
        parts.push(`${result.unmatched.length} unmatched`)
      }
      const summary = parts.join(", ")
      setReconcileSummary(
        result.cleanupWarning
          ? `${summary}. ${result.cleanupWarning}`
          : summary,
      )
      queryClient.invalidateQueries({
        queryKey: githubKeys.csvFile(
          org,
          "classroom50",
          `${classroom}/students.csv`,
        ),
      })
      invalidateInviteQueries()
    },
    onError: (err) => {
      setReconcileSummary(`Reconcile failed (${getErrorMessage(err)}).`)
    },
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

  // Sequential to respect GitHub's 50/24h invite cap and secondary rate limits.
  // Stops early on a rate-limit error to avoid burning the cap further.
  const handleResendAll = async () => {
    let resent = 0
    let alreadyValid = 0
    const failures: string[] = []
    let rateLimited = false
    let stoppedAt = 0

    for (const student of nonMemberStudents) {
      stoppedAt++
      try {
        const outcome = await resendForStudent(student)
        if (outcome === "invited") resent++
        // "pending"/"active" = already has a valid invite / is a member; no
        // invite was re-sent, but it isn't a failure either.
        else if (outcome === "pending" || outcome === "active") alreadyValid++
        else failures.push(student.username)
      } catch (err) {
        failures.push(student.username)
        console.error(`resend failed for ${student.username}:`, err)
        if (err instanceof GitHubAPIError && err.isRateLimited) {
          rateLimited = true
          break
        }
      }
    }

    invalidateInviteQueries()

    const remaining = nonMemberStudents.length - stoppedAt
    const alreadyNote =
      alreadyValid > 0 ? ` ${alreadyValid} already had a pending invite.` : ""
    const summaryKey = "__resend_all__"
    if (rateLimited) {
      const failedList = failures.length ? ` (${failures.join(", ")})` : ""
      setWarning(
        summaryKey,
        `Re-sent ${resent} before GitHub rate-limited the request; ` +
          `${failures.length} failed${failedList}` +
          (remaining > 0 ? `, ${remaining} not attempted` : "") +
          `. Wait a bit and try again.`,
      )
    } else if (failures.length === 0) {
      setWarning(
        summaryKey,
        `Re-sent ${resent} invite${resent === 1 ? "" : "s"}.${alreadyNote}`,
      )
    } else {
      setWarning(
        summaryKey,
        `Re-sent ${resent} of ${nonMemberStudents.length}; ${failures.length} failed (${failures.join(", ")}).${alreadyNote}`,
      )
    }
  }

  return (
    <div className="card card-border w-full bg-base-100 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
        <h2 className="text-lg font-semibold">Enrolled Students</h2>

        <div className="flex items-center gap-2">
          {pendingOnboardingCount > 0 ? (
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
            >
              <RefreshCw
                className={`size-4 ${reconcileMutation.isPending ? "animate-spin" : ""}`}
              />
              Confirm enrollment ({pendingOnboardingCount})
            </button>
          ) : null}

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
      <OnboardingLink org={org} classroom={classroom} />

      {reconcileSummary ? (
        <div role="alert" className="alert alert-info alert-soft mx-6 mt-4">
          <span className="text-sm">Enrollment: {reconcileSummary}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setReconcileSummary("")}
          >
            Dismiss
          </button>
        </div>
      ) : null}

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
        {students?.map((student, index) => {
          const rowKey = studentKey(student, index)
          const statusEntry = statusByKey.get(rowKey)
          const status = statusEntry?.status
          // Resend targets a GitHub org invite, which needs a github_id; an
          // email-only row (no github_id yet) can't be org-resent — it just
          // needs the onboarding link — so don't offer Re-send for it. This
          // also avoids an empty-username ("") key collision across email rows
          // in the resend spinner / warning state below.
          const showResend =
            (status === "expired" || status === "none") &&
            Boolean(student.github_id)
          const isResending = resendingUsernames.has(student.username)
          const invitedAtLabel =
            status === "pending" || status === "expired"
              ? formatInvitedAt(statusEntry?.invitedAt)
              : null
          const isSelf = isSameGitHubUser(viewer, student)
          // Email-only rows have no username yet; show the email so the row is
          // identifiable before reconciliation fills in the GitHub handle.
          const displayName = student.username
            ? getName(student.username, students)
            : student.email
          const displayHandle = student.username || student.email

          return (
            <li
              key={rowKey}
              className="flex items-center gap-4 px-6 py-4 justify-between"
            >
              <Avatar
                name={displayName}
                github={displayHandle}
                initials={
                  student.username
                    ? getInitials(student.username, students)
                    : (student.email[0]?.toUpperCase() ?? "?")
                }
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

                {student.invite_token &&
                student.enrollment_status !== "reconciled" ? (
                  <SecureLinkButton
                    org={org}
                    classroom={classroom}
                    email={student.email}
                    token={student.invite_token}
                  />
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
                    // Unenroll may cancel a pending invite or remove a member.
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
            <span className="font-semibold text-base-content">{org}</span> (
            <span className="font-semibold text-base-content">
              {nonMemberStudents.length}
            </span>{" "}
            student{nonMemberStudents.length === 1 ? "" : "s"}) will receive a
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
