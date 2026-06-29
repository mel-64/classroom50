import { Mail, UserRound, Users } from "lucide-react"
import { revalidateLogic, useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import GitHub from "@/assets/github.svg?react"
import { updateStudentWithConflictRetry } from "@/api/mutations/students"
import { getErrorMessage } from "@/hooks/github/mutations"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useSafeSubmit } from "@/hooks/useSafeSubmit"
import { isValidEmail } from "@/util/onboarding"
import { studentKey } from "@/util/roster"
import type { Student } from "@/types/classroom"
import type { StudentCsvRow } from "@/api/mutations/students"

type EditStudentProps = {
  org: string
  classroom: string
  student: Student
  open: boolean
  onClose: () => void
  onSaved: (updated: StudentCsvRow) => void
}

type EditStudentFormValues = {
  first_name: string
  last_name: string
  email: string
  section: string
}

// Edit modal for a roster row's teacher-facing fields. Identity (username,
// github_id) is shown read-only — it's bound by onboarding/reconcile, not the
// teacher — and only first/last name, email, and section are editable (#74).
const EditStudent = ({
  org,
  classroom,
  student,
  open,
  onClose,
  onSaved,
}: EditStudentProps) => {
  const client = useGitHubClient()
  const runSave = useSafeSubmit()
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  const displayHandle = student.username || student.email
  const isEnrolled = student.enrollment_status === "enrolled"

  const updateMutation = useMutation({
    mutationFn: (value: EditStudentFormValues) =>
      updateStudentWithConflictRetry(client, {
        org,
        classroom,
        key: studentKey(student),
        patch: {
          first_name: value.first_name.trim(),
          last_name: value.last_name.trim(),
          email: value.email.trim(),
          section: value.section.trim(),
        },
      }),
  })

  const form = useForm({
    defaultValues: {
      first_name: student.first_name ?? "",
      last_name: student.last_name ?? "",
      email: student.email ?? "",
      section: student.section ?? "",
    } satisfies EditStudentFormValues,
    // Validate on submit, then re-validate on change so a corrected field clears
    // its error and the button recovers (mirrors AddStudent).
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: ({ value }) => {
        const email = value.email.trim()
        if (email && !isValidEmail(email)) {
          return { fields: { email: "Enter a valid email address." } }
        }
        return undefined
      },
    },
    onSubmit: async ({ value }) => {
      setError(null)
      // Re-entrancy guard around the awaitable write. runSave swallows the
      // rejection, so capture the error inside fn before it propagates.
      await runSave(async () => {
        try {
          const result = await updateMutation.mutateAsync(value)
          onSaved(result.student)
          onClose()
        } catch (err) {
          setError(getErrorMessage(err))
          throw err
        }
      })
    },
  })

  // Drive the native dialog from the `open` prop. Reset the form to the
  // student's CURRENT values each time it opens (argument-less reset reverts to
  // the values captured at mount, which go stale after a save since this dialog
  // is never remounted — the row key is stable across an edit), so a reopen
  // always reflects what's persisted.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setError(null)
      form.reset({
        first_name: student.first_name ?? "",
        last_name: student.last_name ?? "",
        email: student.email ?? "",
        section: student.section ?? "",
      })
      dialog.showModal()
    }
    if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, form, student])

  const submitting = form.state.isSubmitting

  const closeDialog = () => {
    if (submitting) return
    onClose()
  }

  return (
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
        <h3 className="text-lg font-bold">Edit student</h3>
        <p className="mt-1 text-sm text-base-content/60">
          Editing{" "}
          <span className="font-semibold text-base-content">
            {displayHandle ? `@${displayHandle}` : "this student"}
          </span>
          . Their GitHub identity can&apos;t be changed here.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <div className="mt-4 flex flex-col gap-3">
            <form.Field name="first_name">
              {(field) => (
                <div className="flex items-center">
                  <UserRound className="mr-2 text-[#bbb]" />
                  <input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder="First name"
                    className="input w-full"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="last_name">
              {(field) => (
                <div className="flex items-center">
                  <UserRound className="mr-2 text-[#bbb]" />
                  <input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder="Last name"
                    className="input w-full"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="email">
              {(field) => (
                <div>
                  <div className="flex items-center">
                    <Mail className="size-6 mr-2 text-[#bbb]" />
                    <input
                      id={field.name}
                      name={field.name}
                      type="email"
                      placeholder="student@university.edu"
                      className="input w-full"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-error text-sm mt-1">
                      {String(field.state.meta.errors[0] ?? "")}
                    </p>
                  )}
                  {isEnrolled &&
                  field.state.value.trim().toLowerCase() !==
                    (student.email ?? "").trim().toLowerCase() ? (
                    <p className="mt-1 text-xs text-base-content/60">
                      This student is already enrolled. Changing their email
                      won&apos;t re-bind their confirmed GitHub identity; it
                      only affects future email-based matching.
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field name="section">
              {(field) => (
                <div className="flex items-center">
                  <Users className="mr-2 text-[#bbb]" />
                  <input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder="Section (e.g. Period 3)"
                    className="input w-full"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>

            {student.username ? (
              <div className="flex items-center gap-2 rounded-box border border-base-300 bg-base-200/50 px-3 py-2 text-sm text-base-content/60">
                <GitHub className="size-5 opacity-40" />
                <span>
                  GitHub: <span className="font-mono">@{student.username}</span>
                  {student.github_id ? ` (id ${student.github_id})` : ""}
                </span>
              </div>
            ) : null}
          </div>

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
              Cancel
            </button>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!canSubmit || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="loading loading-spinner loading-sm" />
                      Saving...
                    </>
                  ) : (
                    "Save changes"
                  )}
                </button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button type="button" disabled={submitting} onClick={closeDialog}>
          close
        </button>
      </form>
    </dialog>
  )
}

export default EditStudent
