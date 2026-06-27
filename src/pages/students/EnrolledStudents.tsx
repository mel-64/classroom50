import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Link as LinkIcon,
  RefreshCw,
  Send,
  Trash,
} from "lucide-react"

import { getName, getInitials, isSameGitHubUser } from "@/util/students"
import { formatInvitedAt } from "@/util/formatDate"
import Avatar from "@/components/avatar"
import type { Student } from "@/types/classroom"
import { ConfirmModal } from "@/components/modals"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { reconcileOnboarding, unenrollStudent } from "@/api/mutations/students"
import type { UnenrollStudentInput } from "@/api/mutations/students"
import { resendOrgInvitation, getErrorMessage } from "@/hooks/github/mutations"
import { GitHubAPIError } from "@/hooks/github/errors"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import {
  githubKeys,
  invalidateInviteQueries as invalidateInviteQueriesForOrg,
  listOnboardingSelfReports,
} from "@/hooks/github/queries"
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

// The native GitHub org-invite link, shown behind an expandable toggle (the
// in-app onboarding link is the primary path). Same org-wide URL for everyone.
const InviteLink = ({
  org,
  expanded,
  onToggle,
}: {
  org: string
  expanded: boolean
  onToggle: () => void
}) => {
  const inviteUrl = `https://github.com/orgs/${org}/invitation`
  const { copied, copy } = useCopyToClipboard(inviteUrl)

  return (
    <div className="border-b border-base-300 bg-base-200/40 px-6 py-2">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-xs font-medium text-base-content/60 hover:text-base-content"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        Native GitHub organization invite link
      </button>
      {expanded ? (
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xs text-base-content/50">
            Advanced: share this so students can accept the org invite directly
            on GitHub. Most students use the onboarding link above instead.
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
      ) : null}
    </div>
  )
}

// Per-student secure onboarding link (icon-only). Carries the student's email
// prefill plus the unguessable invite token, so reconcile can bind the
// self-report to this exact row. The teacher copies it and emails that one
// student. Shown only for a pending-invite student (icon-only to reduce
// clutter; the green check confirms a copy).
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
      className="btn btn-xs btn-square btn-ghost"
      onClick={() => void copy()}
      aria-label={`Copy secure onboarding link for ${email}`}
      title="Copy secure onboarding link"
    >
      {copied ? (
        <Check className="size-4 text-success" />
      ) : (
        <LinkIcon className="size-4" />
      )}
    </button>
  )
}

// Classroom-wide onboarding link. Students open it after accepting the org
// invite, enter their email, and self-report their GitHub identity (which the
// teacher folds in via "Confirm enrollment"). Same URL for everyone; the
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
  // The native GitHub org-invite link is secondary (most teachers use the
  // in-app onboarding link); keep it behind an expandable toggle.
  const [showGithubInvite, setShowGithubInvite] = useState(false)
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

  // Onboarding self-reports that currently exist (one per onboarding repo), used
  // to tell a student who has onboarded ("ready to confirm") apart from one who
  // hasn't yet ("awaiting"). The empty list is only authoritative once the query
  // SUCCEEDS — while it's loading or after it errors (e.g. the org repo listing
  // is access-limited), we must not treat "no reports" as fact, or every
  // onboarded student would be mislabeled "awaiting" and hidden from the
  // Ready-to-confirm section. We pass the reports only when loaded.
  const {
    data: onboardedReports,
    isSuccess: reportsLoaded,
    isError: reportsErrored,
  } = useQuery({
    queryKey: ["github", "onboarding-reports", org, classroom],
    queryFn: () => listOnboardingSelfReports(client, org, classroom),
    enabled: Boolean(org && classroom && statusAvailable),
    staleTime: 30 * 1000,
  })

  const getStatus = useMemo(
    () =>
      buildInviteStatusLookup(
        members ?? [],
        invitations,
        failedInvitations,
        // Only authoritative once loaded; undefined keeps "ready" unresolved.
        reportsLoaded ? (onboardedReports ?? []) : undefined,
      ),
    [members, invitations, failedInvitations, reportsLoaded, onboardedReports],
  )

  // Stable, position-independent per-row identity. github_id is the most stable
  // (survives a username rename); fall back to username, then email. Rows always
  // carry at least one of these (parseStudentsCsv filters out fully-empty rows),
  // so no index fallback is needed — and an index would desync statusByKey
  // (built over the full array) from the section-local render indices.
  const studentKey = (student: Student) =>
    student.github_id || student.username || student.email

  const statusByKey = useMemo(() => {
    const map = new Map<string, StudentInviteStatus>()
    if (statusLoading || !statusAvailable) return map
    students.forEach((student) => {
      map.set(studentKey(student), getStatus(student))
    })
    return map
  }, [students, getStatus, statusLoading, statusAvailable])

  // Every non-member who still needs an invite re-sent: pending, expired, or
  // never invited. Excludes students who've onboarded (ready) or are simply
  // awaiting onboarding — they've accepted and don't need another invite.
  const nonMemberStudents = useMemo(
    () =>
      students.filter((student) => {
        const status = statusByKey.get(studentKey(student))?.status
        return (
          status != null &&
          status !== "member" &&
          status !== "onboarding" &&
          status !== "ready"
        )
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

  const [reconcileSummary, setReconcileSummary] = useState("")

  const reconcileMutation = useMutation({
    mutationFn: () => reconcileOnboarding(client, { org, classroom }),
    onSuccess: (result) => {
      const parts = [`${result.reconciled.length} enrolled`]
      if (result.deleted.length > 0) {
        parts.push(`${result.deleted.length} deleted`)
      }
      if (result.archived.length > 0) {
        parts.push(`${result.archived.length} archived`)
      }
      if (result.pending.length > 0) {
        parts.push(`${result.pending.length} still pending`)
      }
      if (result.needsAttention.length > 0) {
        parts.push(`${result.needsAttention.length} need attention`)
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
      // Reconcile deletes/archives onboarding repos, so the ready-to-confirm
      // self-report set is now stale.
      queryClient.invalidateQueries({
        queryKey: ["github", "onboarding-reports", org, classroom],
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

  // Partition the roster into the three teacher-facing sections, driven by the
  // computed invite status so each section matches the row badges exactly:
  //  - readyToConfirm: onboarded, repo exists -> confirmable now ("ready").
  //  - awaitingEnrollment: invited but not yet onboarded ("pending"/"expired"/
  //    "onboarding"/"none") — not yet enrolled, nothing to confirm yet.
  //  - enrolled: completed enrollment ("member") or enrolled-but-since-removed
  //    ("removed").
  const { readyToConfirm, awaitingEnrollment, enrolled } = useMemo(() => {
    const ready: Student[] = []
    const awaiting: Student[] = []
    const done: Student[] = []
    students.forEach((student) => {
      const status = statusByKey.get(studentKey(student))?.status
      if (status === "ready") {
        ready.push(student)
      } else if (status === "member" || status === "removed") {
        done.push(student)
      } else {
        awaiting.push(student)
      }
    })
    return {
      readyToConfirm: ready,
      awaitingEnrollment: awaiting,
      enrolled: done,
    }
  }, [students, statusByKey])

  const renderStudentRow = (student: Student) => {
    const rowKey = studentKey(student)
    const statusEntry = statusByKey.get(rowKey)
    const status = statusEntry?.status
    // Per-row invite (re)send: offered for an outstanding GitHub invite the
    // teacher may want to re-trigger (pending or expired), or a roster row that
    // was never invited (none). Onboarded ("ready") / awaiting ("onboarding") /
    // enrolled ("member") rows don't need an invite. Resend targets a GitHub org
    // invite, which needs a github_id; an email-only row (no github_id yet)
    // can't be org-resent — it just needs the onboarding link — so skip it (this
    // also avoids an empty-username key collision across email rows below).
    const showResend =
      (status === "pending" || status === "expired" || status === "none") &&
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
        className="flex items-center justify-between gap-4 px-6 py-4"
      >
        <div className="min-w-0 flex-1">
          <Avatar
            name={displayName}
            github={displayHandle}
            initials={
              student.username
                ? getInitials(student.username, students)
                : (student.email[0]?.toUpperCase() ?? "?")
            }
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {statusAvailable && invitedAtLabel ? (
            <span className="whitespace-nowrap text-xs text-base-content/50">
              Invited {invitedAtLabel}
            </span>
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

          {statusAvailable && status === "pending" && student.invite_token ? (
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
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Action results (confirm enrollment, resend, unenroll) surface here at
          the top: the section that triggered them often changes or unmounts
          afterward (e.g. confirming empties the Ready section), so a page-level
          notification region is the reliable place for the user to see them. */}
      {reconcileSummary || Object.keys(teamWarnings).length > 0 ? (
        <div className="flex w-full flex-col gap-2">
          {reconcileSummary ? (
            <div role="alert" className="alert alert-info alert-soft">
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

          {Object.entries(teamWarnings).map(([username, warning]) => (
            <div
              key={username}
              role="alert"
              className="alert alert-warning alert-soft"
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
        </div>
      ) : null}

      {/* Ready for enrollment confirmation (state 2) — the teacher's first
          priority: confirm students who have onboarded. */}
      {readyToConfirm.length > 0 ? (
        <div className="card card-border w-full overflow-hidden border-info/30 bg-info/5 shadow-sm">
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-info/20">
            <div className="flex flex-col">
              <h2 className="text-lg font-semibold text-info">
                Ready for enrollment confirmation
              </h2>
              <span className="mt-0.5 text-sm text-base-content/60">
                {readyToConfirm.length} student
                {readyToConfirm.length === 1 ? " has" : "s have"} onboarded.
                Confirm to add them to your roster.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary shrink-0"
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
            >
              <RefreshCw
                className={`size-4 ${reconcileMutation.isPending ? "animate-spin" : ""}`}
              />
              Confirm enrollment ({readyToConfirm.length})
            </button>
          </div>
          <ul className="divide-y divide-base-300 bg-base-100">
            {readyToConfirm.map((student) => renderStudentRow(student))}
          </ul>
        </div>
      ) : null}

      {/* Invite students: share links. */}
      <div className="card card-border w-full overflow-hidden bg-base-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
          <h2 className="text-lg font-semibold">Invite students</h2>
        </div>
        <OnboardingLink org={org} classroom={classroom} />
        <InviteLink
          org={org}
          expanded={showGithubInvite}
          onToggle={() => setShowGithubInvite((prev) => !prev)}
        />

        {!statusAvailable ? (
          <div role="alert" className="alert alert-info alert-soft mx-6 my-4">
            <span className="text-sm">
              Invite status requires organization owner access, so it isn't
              shown here.
            </span>
          </div>
        ) : null}

        {statusAvailable && reportsErrored ? (
          <div
            role="alert"
            className="alert alert-warning alert-soft mx-6 my-4"
          >
            <span className="text-sm">
              Couldn&apos;t check who has onboarded (the organization
              repositories couldn&apos;t be read). The &quot;Ready for
              enrollment confirmation&quot; list may be incomplete — refresh to
              retry.
            </span>
          </div>
        ) : null}
      </div>

      {/* Awaiting enrollment (state 1): invited, not yet onboarded. Bulk
          "Resend invites" lives here, where the outstanding invitations are. */}
      {awaitingEnrollment.length > 0 ? (
        <div className="card card-border w-full overflow-hidden bg-base-100 shadow-sm">
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-base-300">
            <div className="flex flex-col">
              <h2 className="text-lg font-semibold">Awaiting enrollment</h2>
              <span className="mt-0.5 text-sm text-base-content/60">
                Invited, but haven&apos;t completed onboarding yet.
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {statusAvailable ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setConfirmResendAllOpen(true)}
                >
                  <Send className="size-4" />
                  Resend invites
                </button>
              ) : null}
              <div className="badge badge-ghost badge-soft text-base">
                {awaitingEnrollment.length}
              </div>
            </div>
          </div>
          <ul className="divide-y divide-base-300">
            {awaitingEnrollment.map((student) => renderStudentRow(student))}
          </ul>
        </div>
      ) : null}

      {/* Enrolled students (state 3) — reviewed last. */}
      <div className="card card-border w-full overflow-hidden bg-base-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
          <h2 className="text-lg font-semibold">Enrolled students</h2>
          <div className="badge badge-primary badge-soft text-base">
            {enrolled.length}
          </div>
        </div>
        {enrolled.length > 0 ? (
          <ul className="divide-y divide-base-300">
            {enrolled.map((student) => renderStudentRow(student))}
          </ul>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-base-content/50">
            No students enrolled yet.
          </div>
        )}
      </div>

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
