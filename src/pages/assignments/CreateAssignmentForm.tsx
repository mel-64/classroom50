import { useForm } from "@tanstack/react-form"
import GitHub from "@/assets/github.svg?react"
import AutogradingTestsPane from "./AutogradingTestsPane"
import type { AssignmentTestDraft } from "@/util/assignmentTests"
import { testToDraft, validateTestDrafts, isSetupTest } from "@/util/assignmentTests"
import type { Assignment } from "@/types/classroom"

export type CreateAssignmentFormValues = {
  name: string
  description: string
  mode: "group" | "individual"
  template_repo: string
  due_date: string
  max_group_size: number
  feedback_pr: boolean
  runs_on: string
  container_image: string
  container_user: string
  setup_command: string
  tests: AssignmentTestDraft[]
}

// GitHub-hosted runner labels the CLI allow-lists for runtime.runs-on.
// Self-hosted is intentionally unsupported. "" = omit (defaults to
// ubuntu-latest).
const RUNNER_LABELS = [
  "ubuntu-latest",
  "ubuntu-24.04",
  "ubuntu-22.04",
  "ubuntu-20.04",
  "macos-latest",
  "macos-14",
  "macos-13",
  "windows-latest",
  "windows-2022",
  "windows-2019",
] as const

// When a container is set, the host must be Ubuntu (GitHub Actions runs
// containers on Ubuntu only — the CLI enforces this).
const CONTAINER_RUNNER_LABELS = RUNNER_LABELS.filter((l) =>
  l.startsWith("ubuntu-"),
)

type CreateAssignmentFormProps = {
  defaultValues?: Partial<CreateAssignmentFormValues>
  onSubmit: (values: CreateAssignmentFormValues) => void | Promise<void>
  edit?: boolean
  loading?: boolean
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

// Map a stored classroom50/assignments/v1 entry back into the form's value
// shape: template as `owner/repo`, due as datetime-local, runtime split into
// runner/container fields, and the leading 0-point "setup" run-test lifted
// back into the setup command.
export const assignmentToFormValues = (
  assignment: Assignment,
): Partial<CreateAssignmentFormValues> => {
  const allTests = (assignment.tests ?? []).map(testToDraft)
  // Lift the setup command only from a leading setup test (isSetupTest), never
  // a later or graded one, so a round-trip can't swallow a user-authored test.
  // (Reserved at write time; this also guards pre-reservation assignments.)
  const head = allTests[0]
  const setupIsLeading = head !== undefined && isSetupTest(head)
  const setupCommand = setupIsLeading ? head.run : ""
  const tests = setupIsLeading ? allTests.slice(1) : allTests

  return {
    name: assignment.name,
    description: assignment.description ?? "",
    mode: assignment.mode === "group" ? "group" : "individual",
    template_repo: assignment.template
      ? `${assignment.template.owner}/${assignment.template.repo}`
      : "",
    due_date: utcIsoToDatetimeLocalValue(assignment.due),
    max_group_size: assignment.max_group_size ?? 2,
    feedback_pr: assignment.feedback_pr ?? true,
    runs_on: assignment.runtime?.["runs-on"] ?? "",
    container_image: assignment.runtime?.container?.image ?? "",
    container_user: assignment.runtime?.container?.user ?? "",
    setup_command: setupCommand,
    tests,
  }
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
      feedback_pr: defaultValues?.feedback_pr ?? true,
      runs_on: defaultValues?.runs_on || "",
      container_image: defaultValues?.container_image || "",
      container_user: defaultValues?.container_user || "",
      setup_command: defaultValues?.setup_command || "",
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
        feedback_pr: value.feedback_pr,
        runs_on: value.runs_on,
        container_image: value.container_image.trim(),
        container_user: value.container_user.trim(),
        setup_command: value.setup_command.trim(),
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

          <form.Field name="feedback_pr">
            {(field) => (
              <div className="mt-4 flex items-start gap-3">
                <input
                  id={field.name}
                  type="checkbox"
                  className="toggle toggle-primary mt-0.5"
                  name={field.name}
                  checked={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.checked)}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <label htmlFor={field.name} className="font-bold">
                      Feedback pull request
                    </label>
                    <span
                      className={`badge badge-sm ${
                        field.state.value
                          ? "badge-success badge-soft"
                          : "badge-ghost"
                      }`}
                    >
                      {field.state.value ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="text-sm text-base-content/60">
                    Open a pull request per repo for inline review of each
                    submission.
                  </p>
                </div>
              </div>
            )}
          </form.Field>
        </div>
        <FormErrors form={form} />
      </div>

      <div className="card bg-base-100 w-full shadow-sm mb-6">
        <div className="card-body">
          <details className="group">
            <summary className="cursor-pointer text-lg font-bold marker:content-none flex items-center gap-2">
              <span className="transition-transform group-open:rotate-90">
                ▶
              </span>
              Advanced Settings
            </summary>

            <p className="label pt-2 pb-4">
              Optional runtime overrides. Leave blank for the defaults
              (ubuntu-latest + Python 3.12).
            </p>

            <form.Subscribe
              selector={(state) => state.values.container_image}
            >
              {(containerImage) => {
                const usingContainer = Boolean(containerImage.trim())
                const runnerOptions = usingContainer
                  ? CONTAINER_RUNNER_LABELS
                  : RUNNER_LABELS
                return (
                  <form.Field name="runs_on">
                    {(field) => (
                      <div className="mb-4">
                        <label
                          htmlFor={field.name}
                          className="label font-bold mb-2"
                        >
                          GitHub Runner
                        </label>
                        <select
                          id={field.name}
                          name={field.name}
                          className="select w-full max-w-xs"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        >
                          <option value="">Default (ubuntu-latest)</option>
                          {runnerOptions.map((label) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {usingContainer && (
                          <p className="label pt-1">
                            A container image runs on Ubuntu hosts only.
                          </p>
                        )}
                      </div>
                    )}
                  </form.Field>
                )
              }}
            </form.Subscribe>

            <form.Field name="container_image">
              {(field) => (
                <div className="mb-4">
                  <label htmlFor={field.name} className="label font-bold mb-2">
                    Docker Image
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type="text"
                    className="input w-full"
                    placeholder="e.g., gcc:13 or cs50/cli"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <p className="label pt-1">
                    Run the autograder inside this public image. The image owns
                    its toolchain and packages.
                  </p>
                </div>
              )}
            </form.Field>

            <form.Subscribe
              selector={(state) => state.values.container_image}
            >
              {(containerImage) =>
                containerImage.trim() ? (
                  <form.Field name="container_user">
                    {(field) => (
                      <div className="mb-4">
                        <label
                          htmlFor={field.name}
                          className="label font-bold mb-2"
                        >
                          Container User
                        </label>
                        <input
                          id={field.name}
                          name={field.name}
                          type="text"
                          className="input w-full max-w-xs"
                          placeholder="e.g., root"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                        <p className="label pt-1">
                          Use <code>root</code> if checkout fails with a
                          permission error in a non-root image.
                        </p>
                      </div>
                    )}
                  </form.Field>
                ) : null
              }
            </form.Subscribe>

            <form.Field name="setup_command">
              {(field) => (
                <div>
                  <label htmlFor={field.name} className="label font-bold mb-2">
                    Setup Command
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type="text"
                    className="input w-full"
                    placeholder="e.g., gcc -o hello hello.c"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <p className="label pt-1">
                    Runs once before grading (e.g. to compile). Added as a
                    leading 0-point autograding step named “setup”.
                  </p>
                </div>
              )}
            </form.Field>
          </details>
        </div>
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
