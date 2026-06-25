import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  ServerCog,
} from "lucide-react"
import AutogradingTestsPane from "./AutogradingTestsPane"
import type { AssignmentTestDraft } from "@/util/assignmentTests"
import {
  testToDraft,
  validateTestDrafts,
  isSetupTest,
} from "@/util/assignmentTests"
import {
  parseAllowedFiles,
  allowedFilesToText,
  validateAllowedFiles,
} from "@/util/allowedFiles"
import {
  containerRunnerWarning,
  isRunnerLabelShapeValid,
  verifyRunnerLabels,
  parseRunnerLabels,
  isKnownHostedRunnerLabel,
  isStandardSelfHostedLabel,
  type OrgRunnersResult,
  type RunnerVerification,
} from "@/util/runners"
import { orgRunnersQuery } from "@/hooks/github/queries"
import { useOptionalGitHubClient } from "@/context/github/GitHubProvider"
import { TemplateField } from "./TemplateField"
import {
  useDebouncedValue,
  normalizeOnBlur,
  type StringField,
} from "./formFieldHelpers"
import type { Assignment } from "@/types/classroom"
import { GROUP_SIZE_MAX, GROUP_SIZE_MIN } from "@/types/classroom"

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
  // Raw textarea text; parsed to string[] on save, joined back on read.
  allowed_files: string
  tests: AssignmentTestDraft[]
}

// The concrete form instance type for this form's values, shared with child
// panes (AutogradingTestsPane, FormErrors) so their `form` prop is fully typed
// without re-stating useForm's many (invariant) generics. Derived from the
// actual hook below so the validator generics always match the real form.
export type AssignmentForm = ReturnType<typeof useAssignmentForm>

const useAssignmentForm = (
  defaultValues: Partial<CreateAssignmentFormValues> | undefined,
  onSubmit: (values: CreateAssignmentFormValues) => void | Promise<void>,
) =>
  useForm({
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
      allowed_files: defaultValues?.allowed_files || "",
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
        } else if (
          value.mode === "group" &&
          (!Number.isInteger(Number(value.max_group_size)) ||
            Number(value.max_group_size) < GROUP_SIZE_MIN ||
            Number(value.max_group_size) > GROUP_SIZE_MAX)
        ) {
          // Mirror the buildAssignmentEntry guard: the CLI schema needs a whole
          // number in [MIN, MAX] or assignments.json becomes unparseable.
          errors.max_group_size = `Group size must be a whole number between ${GROUP_SIZE_MIN} and ${GROUP_SIZE_MAX}.`
        }

        // Mirrors gh-teacher's write-time validation so a bad test is
        // caught in the form, not by a failed commit (or worse, a file
        // the CLI later refuses to parse).
        Object.assign(errors, validateTestDrafts(value.tests))

        // Mirror the CLI's cap/shape rules so a bad value can't reach the file.
        const allowedFilesError = validateAllowedFiles(
          parseAllowedFiles(value.allowed_files),
        )
        if (allowedFilesError) {
          errors.allowed_files = allowedFilesError
        }

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
        runs_on: value.runs_on.trim(),
        container_image: value.container_image.trim(),
        container_user: value.container_user.trim(),
        setup_command: value.setup_command.trim(),
        allowed_files: value.allowed_files,
        tests: value.tests,
      })
    },
  })

type CreateAssignmentFormProps = {
  defaultValues?: Partial<CreateAssignmentFormValues>
  onSubmit: (values: CreateAssignmentFormValues) => void | Promise<void>
  onCancel?: () => void
  edit?: boolean
  loading?: boolean
  // Org slug for verifying a runner label against the org's self-hosted
  // runners. When absent, verification never blocks.
  org?: string
  // Classroom slug, used by the template pre-flight to check whether the
  // classroom team already has read on an in-org private template.
  classroom?: string
}
const FormErrors = ({ form }: { form: AssignmentForm }) => (
  <form.Subscribe selector={(state) => [state.errors]}>
    {([errors]) => (
      <div>
        {errors.map((err) => (
          <p className="text-error" key={String(err)}>
            {String(err)}
          </p>
        ))}
      </div>
    )}
  </form.Subscribe>
)

// Free-form runner input with advisory, non-blocking verification: it
// annotates the value but never rewrites or clears what the teacher typed.
const RunnerField = ({ field, org }: { field: StringField; org?: string }) => {
  const client = useOptionalGitHubClient()
  const rawValue = field.state.value
  const debouncedValue = useDebouncedValue(rawValue.trim(), 400)

  // Hit the org runners API only for a well-shaped label not already
  // recognized client-side; everything else needs no network call.
  const needsOrgLookup = Boolean(
    client &&
    org &&
    parseRunnerLabels(debouncedValue).some(
      (label) =>
        isRunnerLabelShapeValid(label) &&
        !isKnownHostedRunnerLabel(label) &&
        !isStandardSelfHostedLabel(label),
    ),
  )

  const orgRunnersResultQuery = useQuery({
    ...orgRunnersQuery(client!, org ?? ""),
    enabled: needsOrgLookup,
  })

  const orgRunners: OrgRunnersResult = needsOrgLookup
    ? (orgRunnersResultQuery.data ?? { available: false, reason: "error" })
    : { available: false, reason: "no-access" }

  // Hold off on the "not found" verdict while the lookup is in flight.
  const isVerifying = needsOrgLookup && orgRunnersResultQuery.isLoading

  const pending = rawValue.trim() !== debouncedValue
  const verification = verifyRunnerLabels(debouncedValue, orgRunners)

  return (
    <div>
      <label htmlFor={field.name} className="label block font-bold mb-1.5">
        GitHub Runner
      </label>
      <input
        id={field.name}
        name={field.name}
        type="text"
        autoComplete="off"
        spellCheck={false}
        className="input w-full max-w-xs"
        placeholder="ubuntu-latest"
        value={rawValue}
        onBlur={normalizeOnBlur(field, (value) =>
          parseRunnerLabels(value).join(", "),
        )}
        onChange={(e) => field.handleChange(e.target.value)}
      />

      <RunnerVerificationNote
        verification={verification}
        pending={pending || isVerifying}
        hasValue={verification.kind !== "empty"}
      />

      {verification.kind === "self-hosted" && (
        <p className="mt-1.5 text-xs text-base-content/50">
          Combine comma-separated labels for a self-hosted runner (e.g.{" "}
          <code>self-hosted, linux, x64</code>).
        </p>
      )}
    </div>
  )
}

const RunnerVerificationNote = ({
  verification,
  pending,
  hasValue,
}: {
  verification: RunnerVerification
  pending: boolean
  hasValue: boolean
}) => {
  if (pending && hasValue) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-base-content/60">
        <Loader2 className="size-4 shrink-0 animate-spin" />
        Checking…
      </p>
    )
  }

  switch (verification.kind) {
    case "empty":
      return (
        <p className="mt-1.5 text-sm text-base-content/60">
          Leave blank for <code>ubuntu-latest</code>.
        </p>
      )

    case "hosted":
      return (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          GitHub-hosted runner
        </p>
      )

    case "self-hosted": {
      const matched = verification.labels.filter(
        (l) => l.kind === "self-hosted-match",
      )
      const matchNames = matched.flatMap((l) =>
        l.kind === "self-hosted-match" ? l.runnerNames : [],
      )
      const uniqueNames = Array.from(new Set(matchNames))
      return (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-success">
          <ServerCog className="size-4 shrink-0" />
          {verification.confirmed && uniqueNames.length > 0
            ? `Self-hosted runner${
                uniqueNames.length === 1 ? "" : "s"
              } match (${uniqueNames.slice(0, 3).join(", ")}${
                uniqueNames.length > 3 ? "…" : ""
              })`
            : "Self-hosted runner labels"}
        </p>
      )
    }

    case "problem": {
      const badShape = verification.labels
        .filter((l) => l.kind === "invalid-shape")
        .map((l) => l.label)
      const unverified = verification.labels
        .filter((l) => l.kind === "unverified")
        .map((l) => l.label)
      const parts: string[] = []
      if (badShape.length > 0) {
        parts.push(
          `Invalid label ${badShape
            .map((l) => `"${l}"`)
            .join(", ")} — letters, numbers, . - _ only.`,
        )
      }
      if (unverified.length > 0) {
        parts.push(
          `No runner matches ${unverified
            .map((l) => `"${l}"`)
            .join(", ")} — check the spelling.`,
        )
      }
      return (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-error">
          <AlertTriangle className="size-4 shrink-0" />
          {parts.join(" ")}
        </p>
      )
    }

    case "too-many":
      return (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-error">
          <AlertTriangle className="size-4 shrink-0" />
          Too many labels ({verification.count}) — 10 max.
        </p>
      )

    case "unknown":
      return (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-base-content/60">
          <HelpCircle className="size-4 shrink-0" />
          Can't verify — used as entered.
        </p>
      )

    default:
      return null
  }
}

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
    runs_on: parseRunnerLabels(assignment.runtime?.["runs-on"] ?? "").join(
      ", ",
    ),
    container_image: assignment.runtime?.container?.image ?? "",
    container_user: assignment.runtime?.container?.user ?? "",
    setup_command: setupCommand,
    allowed_files: allowedFilesToText(assignment.allowed_files),
    tests,
  }
}

const CreateAssignmentForm = ({
  defaultValues,
  onSubmit,
  onCancel,
  edit = false,
  loading = false,
  org,
  classroom,
}: CreateAssignmentFormProps) => {
  const form = useAssignmentForm(defaultValues, onSubmit)
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

          <div className="grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2 sm:items-start">
            <div>
              <form.Field name="template_repo">
                {(field) => (
                  <TemplateField
                    field={field}
                    org={org}
                    classroom={classroom}
                  />
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
                      className="input w-full"
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
                          min={GROUP_SIZE_MIN}
                          max={GROUP_SIZE_MAX}
                          step="1"
                          title={`Must be a whole number between ${GROUP_SIZE_MIN} and ${GROUP_SIZE_MAX}`}
                          value={
                            Number.isFinite(field.state.value)
                              ? field.state.value
                              : ""
                          }
                          onBlur={() => {
                            // Snap to a valid whole number on blur so the CLI
                            // never sees a non-integer or out-of-range size.
                            const raw = field.state.value
                            const next = Number.isFinite(raw)
                              ? Math.min(
                                  Math.max(Math.floor(raw), GROUP_SIZE_MIN),
                                  GROUP_SIZE_MAX,
                                )
                              : GROUP_SIZE_MIN
                            if (next !== raw) field.handleChange(next)
                            field.handleBlur()
                          }}
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
                    <label htmlFor={field.name} className="label font-bold">
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

            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <form.Field name="runs_on">
                {(field) => <RunnerField field={field} org={org} />}
              </form.Field>

              <form.Field name="container_image">
                {(field) => (
                  <div>
                    <label
                      htmlFor={field.name}
                      className="label block font-bold mb-1.5"
                    >
                      Docker Image
                    </label>
                    <input
                      id={field.name}
                      name={field.name}
                      type="text"
                      className="input w-full max-w-xs"
                      placeholder="e.g. gcc:13"
                      value={field.state.value}
                      onBlur={normalizeOnBlur(field)}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <p className="mt-1.5 text-sm text-base-content/60">
                      Run the autograder inside this public image.
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
                        <div>
                          <label
                            htmlFor={field.name}
                            className="block font-bold mb-1.5"
                          >
                            Container User
                          </label>
                          <input
                            id={field.name}
                            name={field.name}
                            type="text"
                            className="input w-full max-w-xs"
                            placeholder="e.g. root"
                            value={field.state.value}
                            onBlur={normalizeOnBlur(field)}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                          <p className="mt-1.5 text-sm text-base-content/60">
                            Use <code>root</code> if checkout fails with a
                            permission error.
                          </p>
                        </div>
                      )}
                    </form.Field>
                  ) : null
                }
              </form.Subscribe>
            </div>

            <form.Subscribe
              selector={(state) => [
                state.values.runs_on,
                state.values.container_image,
              ]}
            >
              {([runsOn, containerImage]) => {
                const warning = containerRunnerWarning(runsOn, containerImage)
                return warning ? (
                  <p
                    role="alert"
                    className="mt-3 flex items-center gap-1.5 text-sm text-error"
                  >
                    <AlertTriangle className="size-4 shrink-0" />
                    {warning}
                  </p>
                ) : null
              }}
            </form.Subscribe>

            <form.Field name="setup_command">
              {(field) => (
                <div className="mt-4">
                  <label
                    htmlFor={field.name}
                    className="label block font-bold mb-1.5"
                  >
                    Setup Command
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type="text"
                    className="input w-full"
                    placeholder="e.g., gcc -o hello hello.c"
                    value={field.state.value}
                    onBlur={normalizeOnBlur(field)}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <p className="mt-1.5 text-sm text-base-content/60">
                    Runs once before grading (e.g. to compile). Added as a
                    leading 0-point autograding step named “setup”.
                  </p>
                </div>
              )}
            </form.Field>

            <form.Field name="allowed_files">
              {(field) => {
                const patterns = parseAllowedFiles(field.state.value)
                const error = field.state.meta.errors[0] as string | undefined
                return (
                  <div className="mt-4">
                    <label
                      htmlFor={field.name}
                      className="label block font-bold mb-1.5"
                    >
                      Allowed files
                    </label>
                    <textarea
                      id={field.name}
                      name={field.name}
                      className="textarea w-full font-mono"
                      rows={4}
                      spellCheck={false}
                      placeholder={"*\n!hello.py"}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <p className="mt-1.5 text-sm text-base-content/60">
                      Ordered <code>.gitignore</code>-style patterns, one per
                      line, defining which files belong to a submission (last
                      match wins, <code>!</code> re-includes). E.g.{" "}
                      <code>*</code> then <code>!hello.py</code> allows only{" "}
                      <code>hello.py</code>. Leave blank to allow every file.
                    </p>
                    {error ? (
                      <p
                        role="alert"
                        className="mt-1.5 flex items-center gap-1.5 text-sm text-error"
                      >
                        <AlertTriangle className="size-4 shrink-0" />
                        {error}
                      </p>
                    ) : (
                      patterns.length > 0 && (
                        <p className="mt-1.5 text-xs text-base-content/50">
                          {patterns.length} pattern
                          {patterns.length === 1 ? "" : "s"}
                        </p>
                      )
                    )}
                  </div>
                )
              }}
            </form.Field>
          </details>
        </div>
      </div>

      <AutogradingTestsPane form={form} />
      <div className="divider" />
      <div className="card-actions justify-end p-2">
        {onCancel && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
        )}
        <form.Subscribe
          selector={(state) => [
            state.canSubmit,
            state.isSubmitting,
            state.isDefaultValue,
          ]}
        >
          {([canSubmit, isSubmitting, isDefaultValue]) => (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                !canSubmit ||
                isSubmitting ||
                loading ||
                (edit && isDefaultValue)
              }
            >
              {isSubmitting || loading ? (
                <span className="loading loading-spinner" />
              ) : edit ? (
                "Save Changes"
              ) : (
                "Create Assignment"
              )}
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

export default CreateAssignmentForm
