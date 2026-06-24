import { useEffect, useMemo, useState } from "react"
import { useForm } from "@tanstack/react-form"
import { Link, useParams, useRouter } from "@tanstack/react-router"
import { Trash2, UsersRound, Plus } from "lucide-react"
import Breadcrumb from "@/components/breadcrumb"
import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import useGetAssignmentRepo from "@/hooks/useGetAssignmentRepo"
import useGetPublicAssignment from "@/hooks/useGetPublicAssignment"
import useGetRepoCollaborators from "@/hooks/useGetRepoCollaborators"
import useAddRepoCollaborator from "@/hooks/useAddRepoCollaborator"
import useRemoveRepoCollaborator from "@/hooks/useRemoveRepoCollaborator"

import GitHub from "@/assets/github.svg?react"
import { useGithubAuth } from "@/auth/useGithubAuth"
import EditAssignmentForm from "./assignments/EditAssignmentForm"
import useGetClassroomAssignments from "@/hooks/useGetClassAssignments"

const normalizeUsername = (username: string) => username.trim().toLowerCase()

const EditAssignmentFormStudent = ({ org, classroom, assignment }) => {
  const { user } = useGithubAuth()
  const { isLoading: loadingPublic, assignment: assignmentData } =
    useGetPublicAssignment(org, classroom, assignment)
  const { isLoading: loadingRepo, assignment: assignmentRepo } =
    useGetAssignmentRepo(org, classroom, assignment, user?.login)
  const {
    isLoading: loadingCollaborators,
    data: collaborators,
    refetch: refetchRepoCollaborators,
  } = useGetRepoCollaborators(org, assignmentRepo?.name)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const maxCollaborators = assignmentData?.max_group_size ?? 1
  const [collaboratorsSaved, setCollaboratorsSaved] = useState(false)

  const [invalidCollaborators, setInvalidCollaborators] = useState<Set<string>>(
    () => new Set(),
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

  // admins get collab access by default, so we want them to not count toward max group size
  const actualCollaborators = collaborators
    ?.filter((c) => c.permissions?.admin !== true || c.login === user?.login)
    .map((c) => c.login)

  const assignmentMode = assignmentData?.mode

  const addCollaboratorMutation = useAddRepoCollaborator()
  const removeCollaboratorMutation = useRemoveRepoCollaborator()
  const initialCollaboratorUsernames = useMemo(
    () => actualCollaborators?.filter(Boolean).map(normalizeUsername),
    [actualCollaborators],
  )

  const form = useForm({
    defaultValues: {
      collaborators: actualCollaborators || [],
      newCollaborator: "",
    },
    validators: ({ value }) => {
      const errors: Record<string, string> = {}

      const normalized = value.collaborators.map(normalizeUsername)
      const unique = new Set(normalized)

      if (value.collaborators.length > maxCollaborators) {
        errors.collaborators = `Assignment has a max group size of ${maxCollaborators}`
      }

      if (unique.size !== normalized.length) {
        errors.collaborators = "Collaborators must be unique"
      }

      return Object.keys(errors).length > 0 ? { fields: errors } : undefined
    },
    onSubmit: async ({ value }) => {
      if (!assignmentRepo?.name) return

      setSubmitError(null)
      setInvalidCollaborators(new Set())

      const nextCollaborators = value.collaborators
        .map(normalizeUsername)
        .filter(Boolean)

      const previous = new Set(initialCollaboratorUsernames)
      const next = new Set(nextCollaborators)

      const toAdd = [...next].filter((username) => !previous.has(username))
      const toRemove = [...previous].filter((username) => !next.has(username))

      const addResults = await Promise.allSettled(
        toAdd.map(async (username) => {
          await addCollaboratorMutation.mutateAsync({
            org,
            repo: assignmentRepo.name,
            username,
            permission: "push",
          })

          return username
        }),
      )

      const removeResults = await Promise.allSettled(
        toRemove.map(async (username) => {
          await removeCollaboratorMutation.mutateAsync({
            org,
            repo: assignmentRepo.name,
            username,
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

        if (failedAdds.length && failedRemoves.length) {
          setSubmitError(
            "Some collaborators could not be added or removed. Check the highlighted usernames and try again.",
          )
        } else if (failedAdds.length) {
          setSubmitError(
            "Some collaborators could not be added. Check the highlighted usernames and try again.",
          )
        } else {
          setSubmitError(
            "Some collaborators could not be removed. Refresh the page and try again.",
          )
        }

        return
      }

      await refetchRepoCollaborators()
      setCollaboratorsSaved(true)
      setTimeout(() => setCollaboratorsSaved(false), 3000)
    },
  })

  useEffect(() => {
    form.setFieldValue("collaborators", initialCollaboratorUsernames)
  }, [form, initialCollaboratorUsernames])

  const isSaving =
    addCollaboratorMutation.isPending || removeCollaboratorMutation.isPending

  if (loadingPublic || loadingRepo || loadingCollaborators) {
    return (
      <div className="flex">
        <div className="loading loading-spinner m-auto" />
      </div>
    )
  }

  if (!assignmentRepo) {
    return (
      <div className="alert alert-warning mt-6">
        <div>
          You do not have this assignment yet! Do you need to{" "}
          <Link
            className="underline"
            to={`/${org}/${classroom}/assignments/${assignment}/accept`}
          >
            accept it
          </Link>{" "}
          first?
        </div>
      </div>
    )
  }

  if (assignmentMode === "individual") {
    return (
      <div className="alert alert-warning mt-6">
        This is an individual assignment. There is nothing available to edit as
        a Student at this time.
      </div>
    )
  }

  return (
    <>
      {collaboratorsSaved && (
        <div className="alert alert-success mb-6 mt-6">
          Collaborators saved!
        </div>
      )}
      <div className="card mb-6 w-full border border-base-200 bg-base-100 shadow-sm">
        <div className="card-body gap-6">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UsersRound className="size-6" />
            </div>

            <div>
              <h1 className="card-title text-xl">Edit group members</h1>
              <p className="mt-1 text-sm text-base-content/70">
                Add or remove collaborators for this assignment repository. This
                assignment allows up to{" "}
                <span className="font-semibold text-base-content">
                  {maxCollaborators}
                </span>{" "}
                student{maxCollaborators === 1 ? "" : "s"}.
              </p>
            </div>
          </div>

          {submitError && (
            <div className="alert alert-error alert-soft text-sm">
              {submitError}
            </div>
          )}

          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit()
            }}
          >
            <form.Field name="collaborators">
              {(field) => {
                const collaborators = field.state.value ?? []
                const collaboratorError =
                  field.state.meta.errors?.[0]?.fields?.collaborators

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <label className="label p-0">
                        <span className="label-text font-medium">
                          Collaborators
                        </span>
                      </label>

                      <span className="text-xs text-base-content/60">
                        {collaborators.length} / {maxCollaborators}
                      </span>
                    </div>

                    {collaborators.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
                        No collaborators added yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div key={`${user?.login}--1`} className="space-y-1">
                          <div className="flex items-center gap-2 rounded-2xl border p-2 pl-4 border-base-200 bg-base-50">
                            <GitHub className="size-6 shrink-0" />
                            <input
                              className="input input-md min-w-0 flex-1"
                              value={user?.login}
                              disabled
                            />
                          </div>
                        </div>
                        {collaborators
                          .filter(
                            (username) =>
                              normalizeUsername(username) !==
                              normalizeUsername(user?.login ?? ""),
                          )
                          .map((username, index) => {
                            const normalizedUsername =
                              normalizeUsername(username)
                            const isInvalid =
                              invalidCollaborators.has(normalizedUsername)

                            return (
                              <div
                                key={`${username}-${index}`}
                                className="space-y-1"
                              >
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
                                      isInvalid
                                        ? "text-error"
                                        : "text-base-content/70",
                                    ].join(" ")}
                                  />

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

                                      const next = [...collaborators]
                                      next[index] = e.target.value
                                      field.handleChange(next)
                                    }}
                                    onBlur={(e) => {
                                      const next = [...collaborators]
                                      next[index] = normalizeUsername(
                                        e.target.value,
                                      )
                                      field.handleChange(next)
                                      field.handleBlur()
                                    }}
                                  />

                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm btn-square text-error"
                                    aria-label={`Remove ${username}`}
                                    onClick={() => {
                                      clearInvalidCollaborator(username)

                                      field.handleChange(
                                        collaborators.filter(
                                          (_, i) => i !== index,
                                        ),
                                      )
                                    }}
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>

                                {isInvalid && (
                                  <p className="pl-11 text-xs text-error">
                                    Could not add this user. Make sure the
                                    username is correct and that they are a
                                    member of the GitHub organization.
                                  </p>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    )}

                    {collaboratorError && (
                      <p className="text-sm text-error">{collaboratorError}</p>
                    )}
                  </div>
                )
              }}
            </form.Field>

            <div className="rounded-2xl border border-base-200 bg-base-200/30 p-4">
              <form.Field name="newCollaborator">
                {(field) => (
                  <form.Field name="collaborators">
                    {(collaboratorsField) => {
                      const addPendingUsername = () => {
                        const username = normalizeUsername(field.state.value)
                        if (!username) return

                        const current = (
                          collaboratorsField.state.value ?? []
                        ).map(normalizeUsername)

                        if (current.includes(username)) {
                          field.setValue("")
                          return
                        }

                        setInvalidCollaborators((currentInvalid) => {
                          if (!currentInvalid.has(username))
                            return currentInvalid

                          const next = new Set(currentInvalid)
                          next.delete(username)
                          return next
                        })

                        collaboratorsField.handleChange([...current, username])
                        field.setValue("")
                      }

                      return (
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input
                            className="input input-bordered flex-1"
                            placeholder="GitHub username"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
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
                            disabled={
                              (collaboratorsField.state.value?.length ?? 0) >=
                              maxCollaborators
                            }
                          >
                            <Plus className="size-4" />
                            Add
                          </button>
                        </div>
                      )
                    }}
                  </form.Field>
                )}
              </form.Field>

              <p className="mt-2 text-xs text-base-content/60">
                Use GitHub usernames only. Collaborators will receive repository
                access when you save.
              </p>
            </div>

            <div className="card-actions justify-end border-t border-base-200 pt-6">
              <Link
                to={`/${org}/${classroom}/assignments`}
                className="btn btn-ghost"
              >
                Cancel
              </Link>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={!form.state.canSubmit || isSaving}
              >
                {isSaving && <span className="loading loading-spinner" />}
                Save collaborators
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

const EditAssignmentPage = () => {
  const { org, classroom, assignment } = useParams({ strict: false })
  const router = useRouter()
  const { isTeacher, isStudent } = useCourseTeacherAccess(org)
  const { data: assignments } = useGetClassroomAssignments(org, classroom)
  const [editSuccess, setEditSuccess] = useState(false)
  const [editWarning, setEditWarning] = useState("")
  const [editError, setEditError] = useState("")

  const assignmentData = assignments?.assignments.find(
    (a) => a.slug === assignment,
  )

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <Breadcrumb
            endpoint="Edit Assignment"
            isTeacher={isTeacher}
            classroom={classroom}
          />
          {editError && (
            <div className="alert alert-error mt-6">{editError}</div>
          )}
          {editSuccess && (
            <div className="alert alert-success mt-6">
              Your assignment has been edited successfully!
            </div>
          )}
          {editWarning && (
            <div className="alert alert-warning mt-6">{editWarning}</div>
          )}
          <h1 className="text-2xl font-bold mt-4 mb-6">Edit Assignment</h1>
          {isTeacher && (
            <EditAssignmentForm
              org={org}
              classroom={classroom}
              assignment={assignment}
              defaultData={assignmentData}
              onCancel={() => {
                router.history.back()
              }}
              onMutate={() => {
                // Clear prior banners so a re-edit never shows stale state.
                setEditSuccess(false)
                setEditWarning("")
                setEditError("")
              }}
              onError={(error) => {
                setEditError(error.message)
                window.scrollTo({ top: 0, behavior: "smooth" })
              }}
              onSuccess={(result) => {
                // Surface a non-fatal template-grant warning inline if
                // present; otherwise show the success banner.
                if (result?.templateGrantWarning) {
                  setEditWarning(result.templateGrantWarning)
                } else {
                  setEditSuccess(true)
                  setTimeout(() => setEditSuccess(false), 3000)
                }
                window.scrollTo({ top: 0, behavior: "smooth" })
              }}
            />
          )}
          {isStudent && (
            <EditAssignmentFormStudent
              org={org}
              classroom={classroom}
              assignment={assignment}
            />
          )}
        </DrawerContent>
        <DrawerSidebar selected="assignments" />
      </Drawer>
    </div>
  )
}

export default EditAssignmentPage
