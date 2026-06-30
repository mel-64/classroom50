import { useEffect, useRef, useState } from "react"
import { Pencil, Trash } from "lucide-react"
import type { AssignmentForm } from "./CreateAssignmentForm"

import type { AssignmentTestDraft } from "@/util/assignmentTests"
import { emptyTestDraft, validateTestDraft } from "@/util/assignmentTests"
import type { AssignmentTestComparison } from "@/types/classroom"

const TYPE_OPTIONS = [
  {
    value: "io",
    label: "Input/Output",
    hint: "Run a command, feed it stdin, and compare its stdout against an expected value.",
  },
  {
    value: "run",
    label: "Run command",
    hint: "Run a command and pass when its exit code matches (0 by default).",
  },
  {
    value: "python",
    label: "Python (pytest)",
    hint: "Run a pytest command; points are split across discovered test cases at grade time.",
  },
] as const

const FieldError = ({ error }: { error?: string }) =>
  error ? <p className="text-error text-sm mt-1">{error}</p> : null

// Every draft field that can carry a validation error; stale errors on
// these are cleared whenever the test re-validates.
const VALIDATED_FIELDS = [
  "name",
  "run",
  "points",
  "timeout",
  "input",
  "inputFile",
  "expected",
  "expectedFile",
  "exitCode",
] as const

type AutogradingTestModalProps = {
  form: AssignmentForm
  dialogRef: React.RefObject<HTMLDialogElement | null>
  index: number | null
  onClose: () => void
}
const AutogradingTestModal = ({
  form,
  dialogRef,
  index,
  onClose,
}: AutogradingTestModalProps) => {
  if (index === null) return null

  // Validate this test now (the form-level validator only runs on the
  // page's submit) and surface per-field errors. Returns whether the
  // test is valid; "Done" keeps the modal open until it is.
  const validateAndShowErrors = () => {
    const drafts: AssignmentTestDraft[] = form.state.values.tests
    const otherNames = drafts
      .filter((_, i) => i !== index)
      .map((d) => d.name.trim())
    const errors = validateTestDraft(drafts[index], otherNames)

    for (const fieldName of VALIDATED_FIELDS) {
      const message = errors[fieldName]
      const key = `tests[${index}].${fieldName}` as Parameters<
        typeof form.getFieldMeta
      >[0]
      // Fields that never mounted (e.g. exit code on an io test, or the
      // not-yet-built fixture-file inputs) have no meta to update — and
      // nowhere to display an error anyway.
      if (!form.getFieldMeta(key)) continue
      form.setFieldMeta(key, (meta) => ({
        ...meta,
        errorMap: { ...meta.errorMap, onSubmit: message },
      }))
    }

    return Object.keys(errors).length === 0
  }

  const handleDone = () => {
    if (validateAndShowErrors()) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClose={onClose}
      onKeyDown={(e) => {
        // Enter inside a modal input would implicitly submit the
        // surrounding create-assignment form (this dialog renders
        // inside it). Repurpose it as "Done"; textareas keep Enter
        // for newlines.
        if (
          e.key === "Enter" &&
          e.target instanceof HTMLElement &&
          e.target.tagName !== "TEXTAREA" &&
          e.target.tagName !== "BUTTON"
        ) {
          e.preventDefault()
          handleDone()
        }
      }}
    >
      <div className="modal-box max-w-3xl max-h-[90vh]">
        <div className="mb-6">
          <h3 className="text-lg font-bold">Edit Test {index + 1}</h3>
          <p className="text-sm opacity-70">
            Pick a test type, then fill in the command and pass criteria.
            Commands run in the student&apos;s repository checkout.
          </p>
        </div>

        <div className="space-y-5">
          <form.Field name={`tests[${index}].name`}>
            {(field) => (
              <div>
                <label className="label font-bold">Test Name</label>
                <input
                  className="input w-full"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g., Prints hello"
                />
                <FieldError error={field.state.meta.errors[0]} />
              </div>
            )}
          </form.Field>

          <form.Field name={`tests[${index}].type`}>
            {(field) => (
              <div>
                <label className="label font-bold">Test Type</label>
                <div className="join w-full">
                  {TYPE_OPTIONS.map((option) => (
                    <input
                      key={option.value}
                      type="radio"
                      className="join-item btn btn-sm"
                      name={`tests-${index}-type`}
                      aria-label={option.label}
                      checked={field.state.value === option.value}
                      onChange={() => field.handleChange(option.value)}
                    />
                  ))}
                </div>
                <p className="label text-sm pt-1">
                  {
                    TYPE_OPTIONS.find((o) => o.value === field.state.value)
                      ?.hint
                  }
                </p>
              </div>
            )}
          </form.Field>

          <form.Field name={`tests[${index}].setup`}>
            {(field) => (
              <div>
                <label className="label font-bold">Setup Command</label>
                <input
                  className="input w-full font-mono"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="optional — e.g., gcc -o hello hello.c"
                />
              </div>
            )}
          </form.Field>

          <form.Field name={`tests[${index}].run`}>
            {(field) => (
              <div>
                <label className="label font-bold">Run Command</label>
                <input
                  className="input w-full font-mono"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g., ./hello or python3 main.py"
                />
                <FieldError error={field.state.meta.errors[0]} />
              </div>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.tests[index]?.type}>
            {(typeValue) => (
              <>
                {typeValue === "io" && (
                  <>
                    <form.Field name={`tests[${index}].input`}>
                      {(field) => (
                        <div>
                          <label className="label font-bold">
                            Input (stdin)
                          </label>
                          <textarea
                            className="textarea w-full font-mono"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="optional — text fed to the command on stdin"
                            rows={3}
                          />
                        </div>
                      )}
                    </form.Field>

                    <form.Field name={`tests[${index}].expected`}>
                      {(field) => (
                        <div>
                          <label className="label font-bold">
                            Expected Output
                          </label>
                          <textarea
                            className="textarea w-full font-mono"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="Expected stdout"
                            rows={5}
                          />
                          <FieldError error={field.state.meta.errors[0]} />
                        </div>
                      )}
                    </form.Field>

                    <form.Field name={`tests[${index}].comparison`}>
                      {(field) => (
                        <div>
                          <label className="label font-bold">Comparison</label>
                          <select
                            className="select w-full"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) =>
                              field.handleChange(
                                e.target.value as AssignmentTestComparison,
                              )
                            }
                          >
                            <option value="included">
                              Included — expected appears anywhere in the output
                            </option>
                            <option value="exact">
                              Exact — output equals expected (surrounding
                              whitespace ignored)
                            </option>
                            <option value="regex">
                              Regex — Python re.search, multiline
                            </option>
                          </select>
                        </div>
                      )}
                    </form.Field>
                  </>
                )}

                {typeValue === "run" && (
                  <form.Field name={`tests[${index}].exitCode`}>
                    {(field) => (
                      <div className="flex flex-col">
                        <label className="label font-bold">
                          Required Exit Code
                        </label>
                        <input
                          className="input w-32"
                          type="number"
                          min={0}
                          max={255}
                          step={1}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(
                              e.target.value === ""
                                ? ""
                                : e.target.valueAsNumber,
                            )
                          }
                          placeholder="0"
                        />
                        <p className="label text-sm pt-1">
                          Leave empty to require a successful exit (0).
                        </p>
                        <FieldError error={field.state.meta.errors[0]} />
                      </div>
                    )}
                  </form.Field>
                )}

                {typeValue === "python" && (
                  <p className="rounded-box border border-dashed p-3 text-sm opacity-70">
                    The run command should invoke pytest (e.g.{" "}
                    <code>python3 -m pytest -q</code>) against test files in the
                    assignment template. Points are split across the cases
                    pytest discovers.
                  </p>
                )}
              </>
            )}
          </form.Subscribe>

          <div className="flex gap-8">
            <form.Field name={`tests[${index}].timeout`}>
              {(field) => (
                <div className="flex flex-col">
                  <label className="label font-bold">Timeout (seconds)</label>
                  <input
                    className="input w-32"
                    type="number"
                    min={0}
                    max={600}
                    step={1}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) =>
                      field.handleChange(
                        e.target.value === "" ? 0 : e.target.valueAsNumber,
                      )
                    }
                  />
                  <p className="label text-sm pt-1">0 = default (10s)</p>
                  <FieldError error={field.state.meta.errors[0]} />
                </div>
              )}
            </form.Field>

            <form.Field name={`tests[${index}].points`}>
              {(field) => (
                <div className="flex flex-col">
                  <label className="label font-bold">Points</label>
                  <input
                    className="input w-32"
                    type="number"
                    min={0}
                    max={1000}
                    step={1}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) =>
                      field.handleChange(
                        e.target.value === "" ? 0 : e.target.valueAsNumber,
                      )
                    }
                  />
                  <FieldError error={field.state.meta.errors[0]} />
                </div>
              )}
            </form.Field>
          </div>
        </div>

        <div className="modal-action">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDone}
          >
            Done
          </button>
        </div>
      </div>
      <div className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </div>
    </dialog>
  )
}

const typeBadge = (type: AssignmentTestDraft["type"]) =>
  TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type

const AutogradingTestsPane = ({ form }: { form: AssignmentForm }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  useEffect(() => {
    if (editingIndex === null) return

    const dialog = dialogRef.current
    if (!dialog || dialog.open) return

    dialog.showModal()
  }, [editingIndex])

  const openEditor = (index: number) => {
    setEditingIndex(index)
  }

  const closeEditor = () => {
    const dialog = dialogRef.current
    if (dialog?.open) dialog.close()
    setEditingIndex(null)
  }

  return (
    <div className="card bg-base-100 shadow-sm">
      <form.Field name="tests" mode="array">
        {(field) => (
          <div className="card-body">
            <div className="flex justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold">Autograding Tests</h3>
                <h3 className="text-md opacity-70">
                  <form.Subscribe selector={(state) => state.values.tests}>
                    {(tests) => (
                      <>
                        {tests.length} tests •{" "}
                        {tests.reduce(
                          (sum: number, test: AssignmentTestDraft) =>
                            sum + test.points,
                          0,
                        )}{" "}
                        total points
                      </>
                    )}
                  </form.Subscribe>
                </h3>
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-primary btn-outline"
                  onClick={() => {
                    const newIndex = field.state.value.length
                    field.pushValue(emptyTestDraft())
                    openEditor(newIndex)
                  }}
                >
                  + Add Test
                </button>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Test Name</th>
                  <th>Type</th>
                  <th>Run Command</th>
                  <th>Points</th>
                  <th className="w-28"></th>
                </tr>
              </thead>
              <tbody>
                {field.state.value.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="rounded-box border border-dashed p-4 text-sm opacity-70">
                        No autograding tests have been defined yet.
                      </div>
                    </td>
                  </tr>
                ) : (
                  field.state.value.map(
                    (test: AssignmentTestDraft, index: number) => (
                      <tr key={index}>
                        <td>
                          <div className="font-bold max-w-[12rem] truncate">
                            {test.name || `Test ${index + 1}`}
                          </div>
                        </td>

                        <td>
                          <span className="badge badge-ghost badge-soft">
                            {typeBadge(test.type)}
                          </span>
                        </td>

                        <td>
                          <div className="max-w-xs">
                            <pre className="max-w-[12rem] truncate rounded bg-base-200 p-2 text-xs">
                              {test.run || "-"}
                            </pre>
                          </div>
                        </td>

                        <td>
                          <span className="badge badge-primary badge-soft">
                            {test.points}
                          </span>
                        </td>

                        <td>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => openEditor(index)}
                              aria-label={`Edit test ${index + 1}`}
                            >
                              <Pencil size={16} />
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-ghost text-error"
                              onClick={() => field.removeValue(index)}
                              aria-label={`Remove test ${index + 1}`}
                            >
                              <Trash size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>

            <AutogradingTestModal
              form={form}
              dialogRef={dialogRef}
              index={editingIndex}
              onClose={closeEditor}
            />
          </div>
        )}
      </form.Field>
    </div>
  )
}

export default AutogradingTestsPane
