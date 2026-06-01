import { useRef, useState } from "react"
import type { AssignmentTest } from "@/types/classroom"
import { Check, Pencil, Trash, X } from "lucide-react"

const emptyTest = (): AssignmentTest => ({
  name: "",
  input: "",
  output: "",
  points: 10,
})

type AutogradingTestModalProps = {
  form: any
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

  return (
    <dialog ref={dialogRef} className="modal">
      <div className="modal-box max-w-3xl">
        <div className="mb-6">
          <h3 className="text-lg font-bold">Edit Test {index + 1}</h3>
          <p className="text-sm opacity-70">
            Define the input, expected output, and point value for this
            autograding test.
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
              </div>
            )}
          </form.Field>

          <form.Field name={`tests[${index}].input`}>
            {(field) => (
              <div>
                <label className="label font-bold">Input / Command</label>
                <textarea
                  className="textarea w-full font-mono"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g., python main.py"
                  rows={5}
                />
              </div>
            )}
          </form.Field>

          <form.Field name={`tests[${index}].output`}>
            {(field) => (
              <div>
                <label className="label font-bold">Output</label>
                <textarea
                  className="textarea w-full font-mono"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Expected stdout"
                  rows={7}
                />
              </div>
            )}
          </form.Field>

          <form.Field name={`tests[${index}].points`}>
            {(field) => (
              <div>
                <label className="label font-bold">Points</label>
                <input
                  className="input w-32"
                  type="number"
                  min={0}
                  step={1}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) =>
                    field.handleChange(
                      e.target.value === "" ? 0 : e.target.valueAsNumber,
                    )
                  }
                />
              </div>
            )}
          </form.Field>
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>

        <form method="dialog" className="modal-backdrop">
          <button type="button" onClick={onClose}>
            close
          </button>
        </form>
      </div>
    </dialog>
  )
}
const AutogradingTestsPane = ({ form }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const openEditor = (index: number) => {
    setEditingIndex(index)
    dialogRef.current?.showModal()
  }

  const closeEditor = () => {
    dialogRef.current?.close()
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
                          (sum: number, test: AssignmentTest) =>
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
                    field.pushValue(emptyTest())
                    openEditor(field.state.value.length)
                  }}
                >
                  + Add Test
                </button>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Test Name / Command</th>
                  <th>Input</th>
                  <th>Expected Output</th>
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
                    (test: AssignmentTest, index: number) => (
                      <tr key={index}>
                        <td>
                          <div className="font-bold">
                            {test.name || `Test ${index + 1}`}
                          </div>
                        </td>

                        <td>
                          <div className="max-w-xs">
                            <pre className="whitespace-pre-wrap rounded bg-base-200 p-2 text-xs">
                              {test.input || "-"}
                            </pre>
                          </div>
                        </td>

                        <td>
                          <div className="max-w-xs">
                            <pre className="whitespace-pre-wrap rounded bg-base-200 p-2 text-xs">
                              {test.output || "-"}
                            </pre>
                          </div>
                        </td>

                        <td>
                          <span className="badge badge-primary badge-soft">
                            {test.points} Points
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
