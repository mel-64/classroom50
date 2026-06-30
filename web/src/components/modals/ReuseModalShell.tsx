import { Copy, TriangleAlert, X } from "lucide-react"
import { useEffect, type ReactNode, type RefObject } from "react"

// Shared chrome for the two reuse modals — close button, header, error/warning
// alerts, Cancel/Reuse footer — so each only supplies its title, description,
// and direction-specific selectors. The modal owns the <dialog> ref (the reuse
// hook needs it for its closer); the shell just opens it on mount.
export const ReuseModalShell = ({
  dialogRef,
  title,
  description,
  isPending,
  warning,
  errorMessage,
  canSubmit,
  showSubmit,
  onSubmit,
  onClose,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>
  title: string
  description: ReactNode
  isPending: boolean
  warning: string | null
  errorMessage: string | null
  canSubmit: boolean
  // Hide the Reuse button when there's nothing to submit into / from, or after a
  // grant warning has turned the flow into a "Done" acknowledgement.
  showSubmit: boolean
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}) => {
  // Mounted only while reuse is active (parent gates + remounts), so open once.
  useEffect(() => {
    dialogRef.current?.showModal()
  }, [dialogRef])

  const closeDialog = () => dialogRef.current?.close()

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box max-w-lg">
        <form method="dialog">
          <button
            className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3"
            aria-label="Close"
            disabled={isPending}
          >
            <X className="size-4" />
          </button>
        </form>

        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Copy className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold">{title}</h3>
            <p className="mt-1 text-sm text-base-content/70">{description}</p>
          </div>
        </div>

        {children}

        {errorMessage ? (
          <div className="alert alert-error alert-soft mt-4 text-sm">
            {errorMessage}
          </div>
        ) : null}

        {warning ? (
          <div className="alert alert-warning alert-soft mt-4 items-start text-sm">
            <TriangleAlert className="size-4 shrink-0" />
            <span>{warning}</span>
          </div>
        ) : null}

        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={isPending}
            onClick={closeDialog}
          >
            {warning ? "Done" : "Cancel"}
          </button>
          {showSubmit && !warning ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canSubmit}
              onClick={onSubmit}
            >
              {isPending ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Copying…
                </>
              ) : (
                <>
                  <Copy className="size-4" /> Reuse assignment
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button disabled={isPending}>close</button>
      </form>
    </dialog>
  )
}

export default ReuseModalShell

// Slug-field helper text. `loading`/`error`/`slugTaken` are prioritized in
// order; otherwise preview the normalized form or fall back to `uniqueHint`.
// `classroomLabel`/`uniqueHint` carry each modal's wording.
export const reuseSlugStatus = ({
  loading,
  error,
  slugTaken,
  slugTouched,
  normalizedSlug,
  displayedSlug,
  classroomLabel,
  uniqueHint,
}: {
  loading: boolean
  error: boolean
  slugTaken: boolean
  slugTouched: boolean
  normalizedSlug: string
  displayedSlug: string
  classroomLabel: string
  uniqueHint: string
}): string => {
  if (loading) return "Checking existing assignments…"
  if (error)
    return "Couldn’t check existing slugs — you can still try; we’ll re-check on save."
  if (slugTaken)
    return `“${normalizedSlug}” is already used in ${classroomLabel} — pick another.`
  if (slugTouched && normalizedSlug !== displayedSlug)
    return `Will be saved as “${normalizedSlug}”.`
  return uniqueHint
}
