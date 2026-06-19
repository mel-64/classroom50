import { AlertTriangle } from "lucide-react"
import { useEffect, useRef, useState } from "react"

type ConfirmModalProps = {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmText: string
  confirmLabel?: string
  cancelLabel?: string
  dangerous?: boolean
  needsConfirm?: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmText,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  dangerous = true,
  needsConfirm = true,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [hasAcknowledged, setHasAcknowledged] = useState(false)
  const [typedText, setTypedText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = typedText === confirmText
  const canSubmit = !needsConfirm || matches

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
      setHasAcknowledged(false)
      setTypedText("")
      setIsSubmitting(false)
      setError(null)
    }
  }, [open])

  const handleClose = (event?: React.MouseEvent | Event) => {
    event?.stopPropagation?.()

    if (isSubmitting) return

    onClose()
  }

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmButtonClass = dangerous
    ? "btn btn-error text-white"
    : "btn btn-primary"

  const acknowledgeButtonClass = dangerous
    ? "btn btn-error text-white"
    : "btn btn-warning"

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClose={(event) => handleClose(event)}
      onCancel={(event) => {
        if (isSubmitting) {
          event.preventDefault()
          return
        }

        handleClose(event)
      }}
    >
      <div className="modal-box max-w-lg">
        <div className="flex items-start gap-4">
          <div
            className={[
              "flex size-11 shrink-0 items-center justify-center rounded-full",
              dangerous
                ? "bg-error/10 text-error"
                : "bg-warning/10 text-warning",
            ].join(" ")}
          >
            <AlertTriangle className="size-5" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold">{title}</h3>

            {description ? (
              <div className="mt-2 text-sm leading-6 text-base-content/70">
                {description}
              </div>
            ) : null}
          </div>
        </div>

        {!hasAcknowledged ? (
          <>
            <div className="mt-6 rounded-box border border-base-300 bg-base-200/50 p-4 text-sm text-base-content/70">
              Are you sure you want to continue? This action may be difficult or
              impossible to undo.
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
                disabled={isSubmitting}
                onClick={handleClose}
              >
                No
              </button>

              <button
                type="button"
                className={acknowledgeButtonClass}
                disabled={isSubmitting}
                onClick={(event) => {
                  event.stopPropagation()

                  if (needsConfirm) {
                    setHasAcknowledged(true)
                    return
                  }

                  void handleSubmit()
                }}
              >
                {isSubmitting && !needsConfirm ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Working...
                  </>
                ) : needsConfirm ? (
                  "Yes, continue"
                ) : (
                  confirmLabel
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-6 space-y-3">
              <p className="text-sm text-base-content/70">
                To confirm, type{" "}
                <span className="font-mono font-semibold text-base-content">
                  {confirmText}
                </span>{" "}
                below.
              </p>

              <input
                type="text"
                className="input input-bordered w-full font-mono"
                value={typedText}
                disabled={isSubmitting}
                autoFocus
                onChange={(event) => setTypedText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && matches) {
                    void handleSubmit()
                  }
                }}
              />

              {error ? (
                <div className="alert alert-error alert-soft text-sm">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={isSubmitting}
                onClick={handleClose}
              >
                {cancelLabel}
              </button>

              <button
                type="button"
                className={confirmButtonClass}
                disabled={!canSubmit || isSubmitting}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Working...
                  </>
                ) : (
                  confirmLabel
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <form method="dialog" className="modal-backdrop">
        <button disabled={isSubmitting}>close</button>
      </form>
    </dialog>
  )
}
