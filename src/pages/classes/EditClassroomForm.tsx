import {
  deleteClassroom,
  type DeleteClassroomInput,
} from "@/api/mutations/classrooms"
import { ConfirmModal } from "@/components/modals"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { githubKeys } from "@/hooks/github/queries"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import {
  DEFAULT_ONBOARDING_CLEANUP,
  type Classroom,
  type OnboardingCleanupMode,
} from "@/types/classroom"

export type EditClassroomFormValues = {
  name: string
  term: string
  onboarding_cleanup: OnboardingCleanupMode
}

type EditClassroomFormProps = {
  defaultValues?: Partial<EditClassroomFormValues>
  onSubmit: (values: EditClassroomFormValues) => void | Promise<void>
  cl?: Classroom
}

const DeleteClassroomButton = ({
  org,
  classroom,
  onDeleteClassroom,
}: {
  org: string
  classroom: string
  onDeleteClassroom: () => void
}) => {
  const client = useGitHubClient()
  const [open, setOpen] = useState(false)
  const deleteClassroomMutation = useMutation({
    mutationFn: (input: DeleteClassroomInput) => deleteClassroom(client, input),
    onSuccess: () => onDeleteClassroom(),
  })

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className="btn btn-circle btn-sm btn-ghost text-error"
      >
        <Trash2 className="size-4" />
      </button>

      <ConfirmModal
        open={open}
        title="Delete classroom?"
        description={
          <>
            This will remove the{" "}
            <span className="font-semibold text-base-content">{classroom}</span>{" "}
            classroom from the{" "}
            <span className="font-semibold text-base-content">{org}</span>{" "}
            organization. Student assignment repositories will not be deleted.
          </>
        }
        confirmText={`${org}/${classroom}`}
        confirmLabel="Delete classroom"
        cancelLabel="Keep classroom"
        dangerous
        onConfirm={async () => {
          await deleteClassroomMutation.mutateAsync({
            org,
            classroom,
          })
          onDeleteClassroom()
        }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

const EditClassroomForm = ({ onSubmit, cl }: EditClassroomFormProps) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { org, classroom } = useParams({ strict: false })
  const [submitted, setSubmitted] = useState(false)

  const form = useForm({
    defaultValues: {
      name: cl?.name || cl?.short_name || "",
      term: cl?.term || "",
      onboarding_cleanup: cl?.onboarding_cleanup ?? DEFAULT_ONBOARDING_CLEANUP,
    } satisfies EditClassroomFormValues,
    validators: {
      onSubmit: ({ value }) => {
        const errors: Partial<Record<keyof EditClassroomFormValues, string>> =
          {}
        if (!value.name.trim()) {
          errors.name = "Classroom name is required."
        }

        return Object.keys(errors).length > 0
          ? {
              fields: errors,
            }
          : undefined
      },
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name.trim(),
        term: value.term.trim(),
        onboarding_cleanup: value.onboarding_cleanup,
      })
      setSubmitted(true)
    },
  })

  if (!org || !classroom) return null

  return (
    <form
      className="card bg-base-100 w-full shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="card-body">
        <div className="flex justify-between">
          <h3 className="text-lg font-bold pb-4">Basic Information</h3>
          <DeleteClassroomButton
            org={org}
            classroom={classroom}
            onDeleteClassroom={() => {
              queryClient.invalidateQueries({
                queryKey: githubKeys.jsonFile(org, "classroom50"),
              })
              navigate({ to: "/$org", params: { org } })
            }}
          />
        </div>

        <form.Field name="name">
          {(field) => (
            <>
              <label htmlFor={field.name} className="label font-bold">
                Classroom Name<span className="text-[#f00]">*</span>
              </label>

              <input
                id={field.name}
                name={field.name}
                type="text"
                className="input w-full mb-4"
                placeholder="e.g., AP CS Principles"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />

              {field.state.meta.errors.length > 0 && (
                <p className="text-error text-sm mb-4">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </>
          )}
        </form.Field>

        <>
          <label className="label font-bold">
            Classroom Slug<span className="text-[#f00]">*</span>
          </label>

          <input
            type="text"
            disabled
            className="input w-full mb-4"
            placeholder="e.g., ap-cs-principles"
            value={classroom}
          />
        </>

        <form.Field name="term">
          {(field) => (
            <>
              <label htmlFor={field.name} className="label font-bold">
                Classroom Term
              </label>

              <input
                id={field.name}
                name={field.name}
                type="text"
                className="input w-full mb-4"
                placeholder="e.g., Fall 2026"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />

              {field.state.meta.errors.length > 0 && (
                <p className="text-error text-sm mb-4">
                  {field.state.meta.errors[0]}
                </p>
              )}
            </>
          )}
        </form.Field>

        <form.Field name="onboarding_cleanup">
          {(field) => (
            <>
              <label htmlFor={field.name} className="label font-bold">
                Onboarding repo cleanup
              </label>
              <p className="text-sm text-base-content/60 mb-2">
                What to do with a student&apos;s onboarding repository once
                their GitHub identity is reconciled into the roster.
              </p>

              <select
                id={field.name}
                name={field.name}
                className="select w-full mb-4"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(e.target.value as OnboardingCleanupMode)
                }
              >
                <option value="delete">
                  Delete (default; removes the repo after reconcile)
                </option>
                <option value="archive">
                  Archive (reversible; hides the repo)
                </option>
                <option value="keep">Keep (leave the repo untouched)</option>
              </select>
            </>
          )}
        </form.Field>

        <div className="card-actions justify-end p-2">
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmit || isSubmitting || submitted}
              >
                {isSubmitting ? "Saving..." : "Save Classroom"}
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </form>
  )
}

export default EditClassroomForm
