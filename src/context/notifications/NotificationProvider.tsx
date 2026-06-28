import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react"
import { X } from "lucide-react"

export type ToastTone = "info" | "success" | "warning" | "error"

export type Toast = {
  // Stable id for React keys + dismissal. Auto-generated unless `key` is given.
  id: string
  tone: ToastTone
  message: React.ReactNode
  // Auto-dismiss after this many ms; 0/undefined means it stays until dismissed.
  durationMs?: number
}

export type NotifyInput = {
  tone?: ToastTone
  message: React.ReactNode
  // Optional dedup key: a later notify() with the same key replaces the prior
  // toast in place instead of stacking a duplicate (e.g. repeated retries).
  key?: string
  durationMs?: number
}

type NotificationContextValue = {
  notify: (input: NotifyInput) => string
  dismiss: (id: string) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

// daisyUI alert classes per tone. `alert-soft` matches the house style used by
// the inline alerts this provider generalizes (EnrolledStudents, EditAssignment).
const TONE_CLASS: Record<ToastTone, string> = {
  info: "alert alert-info alert-soft",
  success: "alert alert-success alert-soft",
  warning: "alert alert-warning alert-soft",
  error: "alert alert-error alert-soft",
}

let toastSeq = 0
const nextId = () => `toast-${++toastSeq}`

// App-wide toast surface. Lives above the router so a toast survives the
// component that fired it unmounting (archiving removes the card, reuse
// navigates away). Modeled on the ad-hoc inline-alert region in
// EnrolledStudents (tones, keyed dedup, dismissible) — that surface still runs
// its own inline alerts; migrating it onto notify()/useToast is a follow-up.
export function NotificationProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Track auto-dismiss timers so a keyed replace / manual dismiss clears them.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    },
    [clearTimer],
  )

  const notify = useCallback(
    ({ tone = "info", message, key, durationMs }: NotifyInput): string => {
      // A keyed toast reuses its id so a replace updates in place; otherwise a
      // fresh id stacks a new toast.
      const id = key ?? nextId()
      clearTimer(id)

      const toast: Toast = { id, tone, message, durationMs }
      setToasts((prev) => {
        const without = prev.filter((t) => t.id !== id)
        return [...without, toast]
      })

      if (durationMs && durationMs > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), durationMs),
        )
      }
      return id
    },
    [clearTimer, dismiss],
  )

  // Snapshot the timer map for cleanup on unmount.
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((timer) => clearTimeout(timer))
      map.clear()
    }
  }, [])

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss])

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </NotificationContext.Provider>
  )
}

const ToastViewport = ({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) => {
  if (toasts.length === 0) return null

  return (
    <div className="toast toast-end toast-bottom z-50">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
          className={`${TONE_CLASS[toast.tone]} max-w-sm`}
        >
          <span className="text-sm">{toast.message}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

// Access notify()/dismiss() from any component under the provider.
export function useToast() {
  const ctx = useContext(NotificationContext)
  if (!ctx) {
    throw new Error("useToast must be used within a NotificationProvider")
  }
  return ctx
}
