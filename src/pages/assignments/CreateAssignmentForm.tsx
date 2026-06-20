import { useForm } from "@tanstack/react-form"
import GitHub from "@/assets/github.svg?react"
import AutogradingTestsPane from "./AutogradingTestsPane"
import type { AssignmentTestDraft } from "@/util/assignmentTests"
import { validateTestDrafts } from "@/util/assignmentTests"

export type CreateAssignmentFormValues = {
  name: string
  description: string
  mode: "group" | "individual"
  template_repo: string
  due_date: string
  max_group_size: number
  tests: AssignmentTestDraft[]
}

type CreateAssignmentFormProps = {
  defaultValues?: Partial<CreateAssignmentFormValues>
  onSubmit: (values: CreateAssignmentFormValues) => void | Promise<void>
}
const FormErrors = ({ form }) => (
  <form.Subscribe selector={(state) => [state.errors]}>
    {([errors]) => (
      <div>
        {errors.map((err) => (
          <p className="text-error" key={err}>
            {err}
          </p>
        ))}
      </div>
    )}
  </form.Subscribe>
)

const toDatetimeLocalValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0")

  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const utcIsoToDatetimeLocalValue = (value?: string) => {
  if (!value) return ""

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return toDatetimeLocalValue(date)
}

const CreateAssignmentForm = ({
  defaultValues,
  onSubmit,
  edit = false,
  loading = false,
}: CreateAssignmentFormProps) => {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name || "",
      description: defaultValues?.description || "",
      mode: defaultValues?.mode || "individual",
      template_repo: defaultValues?.template_repo || "",
      due_date:
        utcIsoToDatetimeLocalValue(defaultValues?.due_date) ||
        toDatetimeLocalValue(new Date()),
      max_group_size: defaultValues?.max_group_size || 2,
      tests: defaultValues?.tests || [],
    } satisfies CreateAssignmentFormValues,
    validators: {
      onSubmit: ({ value }) => {
        const errors: Record<string, string> = {}
        if (!value.name.trim()) {
          errors.name = "Assignment name is required."
        }
        if (!Number(value.max_group_size)) {
          errors.max_group_size = "Max group size must be a valid number."
        }

        // Mirrors gh-teacher's write-time validation so a bad test is
        // caught in the form, not by a failed commit (or worse, a file
        // the CLI later refuses to parse).
        Object.assign(errors, validateTestDrafts(value.tests))

        return Object.keys(errors).length > 0 ? { fields: errors } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name.trim(),
        description: value.description.trim(),
        mode: value.mode,
        template_repo: value.template_repo.trim(),
        due_date: value.due_date.trim(),
        max_group_size: value.max_group_size,
        tests: value.tests,
      })
    },
  })
  const tzShort = new Intl.DateTimeFormat(undefined, {
    timeZoneName: "short",
  })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="card bg-base-100 w-full shadow-sm mb-6">
        <div className="card-body">
          <h3 className="text-lg font-bold pb-4">Basic Information</h3>

          <form.Field name="name">
            {(field) => (
              <>
                <label htmlFor={field.name} className="label font-bold">
                  Assignment Name<span className="text-[#f00]">*</span>
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="text"
                  className="input w-full mb-4"
                  placeholder="e.g., Loops Assignment"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <>
                <label htmlFor={field.name} className="label font-bold">
                  Description
                </label>
                <textarea
                  id={field.name}
                  name={field.name}
                  className="textarea w-full mb-4"
                  placeholder="Describe the assignment objectives..."
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </>
            )}
          </form.Field>

          <div className="flex justify-between mb-4">
            <div>
              <form.Field name="template_repo">
                {(field) => (
                  <>
                    <div>
                      <label
                        htmlFor={field.name}
                        className="label font-bold mb-2"
                      >
                        Template Repository
                      </label>
                    </div>
                    <div className="flex">
                      <GitHub className="size-6 mr-2 text-[#ddd] opacity-50" />
                      <input
                        id={field.name}
                        name={field.name}
                        type="text"
                        placeholder="org-name/repo-name"
                        className="input"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                    <p className="label pt-2">
                      Students will receive a copy of this repository.
                    </p>
                  </>
                )}
              </form.Field>
            </div>
            <div>
              <form.Field name="due_date">
                {(field) => (
                  <>
                    <label
                      htmlFor={field.name}
                      className="label font-bold mb-2"
                    >
                      Due Date ({tzShort})
                    </label>
                    <input
                      id={field.name}
                      name={field.name}
                      type="datetime-local"
                      className="input"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </>
                )}
              </form.Field>
            </div>
          </div>

          <div>
            <form.Field name="mode">
              {(field) => (
                <>
                  <div>
                    <label className="label font-bold mb-2">
                      Assignment Type
                    </label>
                  </div>
                  <input
                    type="radio"
                    className="radio"
                    name={field.name}
                    value="individual"
                    checked={field.state.value === "individual"}
                    onBlur={field.handleBlur}
                    onChange={() => field.handleChange("individual")}
                  />
                  <label className="label pl-2">Individual</label>
                  <input
                    type="radio"
                    className="radio ml-6"
                    name={field.name}
                    value="group"
                    checked={field.state.value === "group"}
                    onBlur={field.handleBlur}
                    onChange={() => field.handleChange("group")}
                  />
                  <label className="label pl-2">Group Project</label>
                </>
              )}
            </form.Field>
          </div>

          <form.Subscribe selector={(state) => state.values.mode}>
            {(modeValue) =>
              modeValue === "group" && (
                <div>
                  <form.Field name="max_group_size">
                    {(field) => (
                      <>
                        <div>
                          <label className="label font-bold mb-2">
                            Max Group Size
                          </label>
                        </div>
                        <input
                          id={field.name}
                          name={field.name}
                          type="number"
                          className="input validator"
                          placeholder="#"
                          min="1"
                          max="100"
                          title="Must be a valid number between 1 and 100"
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(e.target.valueAsNumber)
                          }
                        />
                      </>
                    )}
                  </form.Field>
                </div>
              )
            }
          </form.Subscribe>
        </div>
        <FormErrors form={form} />
      </div>
      <AutogradingTestsPane form={form} />
      <div className="divider" />
      <div className="card-actions justify-end p-2">
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSubmit || isSubmitting || loading}
            >
              {isSubmitting || loading ? (
                <span className="loading loading-spinner" />
              ) : (
                `${edit ? "Edit" : "Create"} Assignment`
              )}
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

export default CreateAssignmentForm
