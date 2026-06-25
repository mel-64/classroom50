import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, Trash2, UsersRound } from "lucide-react"

import GitHub from "@/assets/github.svg?react"
import { useGithubAuth } from "@/auth/useGithubAuth"
import useGetRepoCollaborators from "@/hooks/useGetRepoCollaborators"
import useAddRepoCollaborator from "@/hooks/useAddRepoCollaborator"
import useRemoveRepoCollaborator from "@/hooks/useRemoveRepoCollaborator"
import { getName } from "@/util/students"
import { GitHubAPIError } from "@/hooks/github/errors"
import type { Student } from "@/types/classroom"

const normalizeUsername = (username: string) => username.trim().toLowerCase()

// Turn a rejected add/remove into a human-readable reason. GitHub's status
// codes mean very different things here, so collapsing everything into "bad
// username" misleads users (e.g. a 429 rate limit or a 403 permission error).
const describeFailure = (reason: unknown): string | null => {
  if (reason instanceof GitHubAPIError) {
    if (reason.isRateLimited)
      return "GitHub rate limit hit — wait a moment and try again."
    if (reason.status === 403)
      return "You don't have permission to change collaborators on this repository."
    if (reason.status === 404)
      return "Username not found, or not a member of the GitHub organization."
    if (reason.status === 422)
      return "Already a collaborator, or the request was rejected by GitHub."
    return reason.message
  }
  return reason instanceof Error ? reason.message : null
}

type GroupCollaboratorsModalProps = {
  open: boolean
  onClose: () => void
  org: string
  repoName: string
  // The group founder / repository owner — the student who accepted the
  // assignment. This is the `owner` segment of the repo name, NOT inferred from
  // GitHub admin permissions (org owners hold admin on every repo and would
  // otherwise be mistaken for the founder).
  ownerLogin?: string
  repoUrl?: string
  assignmentName?: string
  maxGroupSize?: number
  // Optional roster, used to show full names alongside GitHub handles.
  students?: Student[]
}

export function GroupCollaboratorsModal({
  open,
  onClose,
  org,
  repoName,
  ownerLogin,
  repoUrl,
  assignmentName,
  maxGroupSize,
  students = [],
}: GroupCollaboratorsModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { user } = useGithubAuth()

  const {
    data: collaborators,
    isLoading: loadingCollaborators,
    refetch: refetchCollaborators,
  } = useGetRepoCollaborators(org, repoName)

  const addCollaboratorMutation = useAddRepoCollaborator()
  const removeCollaboratorMutation = useRemoveRepoCollaborator()

  const [draftCollaborators, setDraftCollaborators] = useState<string[]>([])
  const [newCollaborator, setNewCollaborator] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [invalidCollaborators, setInvalidCollaborators] = useState<Set<string>>(
    () => new Set(),
  )

  const maxCollaborators = maxGroupSize ?? 1

  const normalizedOwner = ownerLogin ? normalizeUsername(ownerLogin) : null

  // The repository owner (group founder) is identified by the repo name's
  // `owner` segment, passed in as `ownerLogin` — never inferred from admin
  // permissions, because org owners hold admin on every repo. As a fallback
  // (e.g. owner not passed), use the sole direct admin collaborator.
  const directAdminLogins = useMemo(
    () =>
      new Set(
        collaborators
          ?.filter((c) => c.permissions?.admin === true)
          .map((c) => normalizeUsername(c.login)) ?? [],
      ),
    [collaborators],
  )

  const ownerLoginResolved =
    normalizedOwner ??
    (directAdminLogins.size === 1 ? [...directAdminLogins][0] : null)

  // Whoever is viewing can manage collaborators if they are the founder or hold
  // admin on this specific repo (direct or inherited via org ownership). This
  // matches what the GitHub API will actually allow.
  const viewerLogin = user?.login ? normalizeUsername(user.login) : null
  const canManage = Boolean(
    viewerLogin &&
    (viewerLogin === ownerLoginResolved || directAdminLogins.has(viewerLogin)),
  )

  // Members are every collaborator that isn't the founder. (The list is already
  // `affiliation=direct`, so inherited org-owner access doesn't appear here.)
  const initialCollaborators = useMemo(
    () =>
      collaborators
        ?.map((c) => normalizeUsername(c.login))
        .filter((login) => login && login !== ownerLoginResolved) ?? [],
    [collaborators, ownerLoginResolved],
  )

  // Seed the editable draft from the live collaborators once per open, and again
  // when the underlying repo changes (the shared modal in the teacher table
  // switches between groups without closing). A background refetch — e.g.
  // refetchOnWindowFocus — must NOT reseed, or it would clobber unsaved edits;
  // so we key the seed on `open` + `repoName`, not on the collaborators identity.
  const seededKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      seededKeyRef.current = null
      return
    }
    if (loadingCollaborators) return
    if (seededKeyRef.current === repoName) return
    seededKeyRef.current = repoName
    setDraftCollaborators(initialCollaborators)
  }, [open, repoName, loadingCollaborators, initialCollaborators])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    }

    if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setNewCollaborator("")
      setSubmitError(null)
      setSaved(false)
      setInvalidCollaborators(new Set())
    }
  }, [open])

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    },
    [],
  )

  const clearInvalidCollaborator = (username: string) => {
    const normalized = normalizeUsername(username)
    setInvalidCollaborators((current) => {
      if (!current.has(normalized)) return current
      const next = new Set(current)
      next.delete(normalized)
      return next
    })
  }

  const addPendingUsername = () => {
    const username = normalizeUsername(newCollaborator)
    if (!username) return

    if (draftCollaborators.map(normalizeUsername).includes(username)) {
      setNewCollaborator("")
      return
    }

    clearInvalidCollaborator(username)
    setDraftCollaborators((current) => [...current, username])
    setNewCollaborator("")
  }

  const tooMany = draftCollaborators.length > maxCollaborators
  const hasDuplicates =
    new Set(draftCollaborators.map(normalizeUsername)).size !==
    draftCollaborators.length

  const isSaving =
    addCollaboratorMutation.isPending || removeCollaboratorMutation.isPending

  const handleSave = async () => {
    if (tooMany || hasDuplicates || isSaving) return

    setSubmitError(null)
    setInvalidCollaborators(new Set())
    setSaved(false)

    const next = draftCollaborators.map(normalizeUsername).filter(Boolean)
    const previous = new Set(initialCollaborators)
    const nextSet = new Set(next)

    const toAdd = [...nextSet].filter((username) => !previous.has(username))
    const toRemove = [...previous].filter((username) => !nextSet.has(username))

    // Removes run before adds so a member swap at max group size frees a slot
    // before the replacement is added.
    const removeResults = await Promise.allSettled(
      toRemove.map(async (username) => {
        await removeCollaboratorMutation.mutateAsync({
          org,
          repo: repoName,
          username,
        })
        return username
      }),
    )

    const addResults = await Promise.allSettled(
      toAdd.map(async (username) => {
        await addCollaboratorMutation.mutateAsync({
          org,
          repo: repoName,
          username,
          permission: "push",
        })
        return username
      }),
    )

    const failedAdds = addResults
      .map((result, index) =>
        result.status === "rejected" ? toAdd[index] : null,
      )
      .filter(Boolean) as string[]

    const failedRemoves = removeResults
      .map((result, index) =>
        result.status === "rejected" ? toRemove[index] : null,
      )
      .filter(Boolean) as string[]

    if (failedAdds.length || failedRemoves.length) {
      setInvalidCollaborators(new Set(failedAdds.map(normalizeUsername)))

      const firstReason =
        [...addResults, ...removeResults].find(
          (r) => r.status === "rejected",
        ) ?? null
      const detail =
        firstReason && firstReason.status === "rejected"
          ? describeFailure(firstReason.reason)
          : null
      const suffix = detail ? ` ${detail}` : ""

      if (failedAdds.length && failedRemoves.length) {
        setSubmitError(
          `Some collaborators could not be added or removed. Check the highlighted usernames and try again.${suffix}`,
        )
      } else if (failedAdds.length) {
        setSubmitError(
          `Some collaborators could not be added. Check the highlighted usernames and try again.${suffix}`,
        )
      } else {
        setSubmitError(
          `Some collaborators could not be removed. Refresh and try again.${suffix}`,
        )
      }

      await refetchCollaborators()
      return
    }

    await refetchCollaborators()
    setSaved(true)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaved(false), 3000)
  }

  // Prefer the roster/collaborator casing of the owner login for display.
  const ownerDisplayLogin =
    collaborators?.find(
      (c) => normalizeUsername(c.login) === ownerLoginResolved,
    )?.login ??
    ownerLogin ??
    ownerLoginResolved ??
    undefined

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClose={() => {
        if (!isSaving) onClose()
      }}
      onCancel={(event) => {
        if (isSaving) {
          event.preventDefault()
          return
        }
        onClose()
      }}
    >
      <div className="modal-box max-w-xl">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UsersRound className="size-5" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold">
              {assignmentName || "Group collaborators"}
            </h3>
            <p className="text-sm font-medium text-base-content/60">
              Group members
            </p>
            {repoName && (
              <a
                className="link mt-1 inline-flex items-center gap-2 font-mono text-sm"
                href={repoUrl || `https://github.com/${org}/${repoName}`}
                target="_blank"
                rel="noreferrer"
              >
                <GitHub className="size-4" />
                {`${org}/${repoName}`}
              </a>
            )}
          </div>
        </div>

        {loadingCollaborators ? (
          <div className="flex py-10">
            <span className="loading loading-spinner m-auto" />
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-base-content/70">
              This assignment allows up to{" "}
              <span className="font-semibold text-base-content">
                {maxCollaborators}
              </span>{" "}
              student{maxCollaborators === 1 ? "" : "s"} in addition to the
              group owner.
            </p>

            {saved && (
              <div className="alert alert-success alert-soft mt-4 text-sm">
                Collaborators saved!
              </div>
            )}

            {submitError && (
              <div className="alert alert-error alert-soft mt-4 text-sm">
                {submitError}
              </div>
            )}

            {!canManage && (
              <div className="alert alert-info alert-soft mt-4 text-sm">
                Only the group owner
                {ownerDisplayLogin ? (
                  <>
                    {" "}
                    (<span className="font-mono">{ownerDisplayLogin}</span>)
                  </>
                ) : null}{" "}
                can manage collaborators for this repository.
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <span className="label-text font-medium">Collaborators</span>
                <span className="text-xs text-base-content/60">
                  {draftCollaborators.length} / {maxCollaborators}
                </span>
              </div>

              {ownerDisplayLogin && (
                <div className="flex items-center gap-2 rounded-2xl border border-base-200 bg-base-50 p-2 pl-4">
                  <GitHub className="size-6 shrink-0" />
                  <span className="flex-1 truncate text-sm">
                    {getName(ownerDisplayLogin, students) || ownerDisplayLogin}
                  </span>
                  <span className="badge badge-primary badge-soft">Owner</span>
                </div>
              )}

              {draftCollaborators.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
                  No collaborators added yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {draftCollaborators.map((username, index) => {
                    const normalized = normalizeUsername(username)
                    const isInvalid = invalidCollaborators.has(normalized)
                    const name = getName(normalized, students)

                    return (
                      <div key={`${username}-${index}`} className="space-y-1">
                        <div
                          className={[
                            "flex items-center gap-2 rounded-2xl border p-2 pl-4 transition-colors",
                            isInvalid
                              ? "border-error bg-error/5"
                              : "border-base-200 bg-base-50",
                          ].join(" ")}
                        >
                          <GitHub
                            className={[
                              "size-6 shrink-0",
                              isInvalid ? "text-error" : "text-base-content/70",
                            ].join(" ")}
                          />

                          {canManage ? (
                            <input
                              className={[
                                "input input-md min-w-0 flex-1",
                                isInvalid
                                  ? "input-error bg-base-100"
                                  : "input-ghost",
                              ].join(" ")}
                              value={username}
                              onChange={(e) => {
                                clearInvalidCollaborator(username)
                                setDraftCollaborators((current) => {
                                  const nextDraft = [...current]
                                  nextDraft[index] = e.target.value
                                  return nextDraft
                                })
                              }}
                              onBlur={(e) => {
                                const value = normalizeUsername(e.target.value)
                                setDraftCollaborators((current) => {
                                  const nextDraft = [...current]
                                  nextDraft[index] = value
                                  return nextDraft
                                })
                              }}
                            />
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {name ? `${name} (${username})` : username}
                            </span>
                          )}

                          {canManage && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-square text-error"
                              aria-label={`Remove ${username}`}
                              onClick={() => {
                                clearInvalidCollaborator(username)
                                setDraftCollaborators((current) =>
                                  current.filter((_, i) => i !== index),
                                )
                              }}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>

                        {isInvalid && (
                          <p className="pl-11 text-xs text-error">
                            Could not add this user. Make sure the username is
                            correct and that they are a member of the GitHub
                            organization.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {tooMany && (
                <p className="text-sm text-error">
                  Assignment has a max group size of {maxCollaborators}.
                </p>
              )}
              {hasDuplicates && (
                <p className="text-sm text-error">
                  Collaborators must be unique.
                </p>
              )}

              {canManage && (
                <div className="rounded-2xl border border-base-200 bg-base-200/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      className="input input-bordered flex-1"
                      placeholder="GitHub username"
                      value={newCollaborator}
                      onChange={(e) => setNewCollaborator(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addPendingUsername()
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={addPendingUsername}
                      disabled={draftCollaborators.length >= maxCollaborators}
                    >
                      <Plus className="size-4" />
                      Add
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-base-content/60">
                    Use GitHub usernames only. Collaborators receive repository
                    access when you save.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={isSaving}
            onClick={() => onClose()}
          >
            Close
          </button>
          {canManage && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                loadingCollaborators || isSaving || tooMany || hasDuplicates
              }
              onClick={() => void handleSave()}
            >
              {isSaving && <span className="loading loading-spinner" />}
              Save collaborators
            </button>
          )}
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button disabled={isSaving}>close</button>
      </form>
    </dialog>
  )
}

export default GroupCollaboratorsModal
