import { useMemo } from "react"

// Synchronous re-entrancy guard for write submissions.
//
// react-query's `isPending` (and any React state used to disable a submit
// button) updates a render tick late, so two clicks dispatched in the same tick
// — a fast double-click, or Enter + click — can both pass an `isPending` check
// and both start a write. This guard flips a flag synchronously BEFORE awaiting,
// so a second same-tick call is rejected before it can start a duplicate write,
// and resets the flag once the work settles.
//
// IMPORTANT: `run` only spans the write when `fn` returns the settling promise.
// Pass `() => mutation.mutateAsync(...)` (awaitable), NOT `() => mutation.mutate(...)`
// (fire-and-forget, returns void) — the latter resolves `await fn()` on the next
// microtask and releases the latch before the write settles, reopening the guard.

export type SafeSubmitRun = (fn: () => Promise<unknown>) => Promise<void>

// Pure factory (no React) so the latch behavior is unit-testable in this repo's
// pure-function test style. The hook below is a thin, stable wrapper.
//
// `run` does not surface errors: the wrapped mutation owns failure handling (its
// own `onError`/`isError`), and `run` is purely the re-entrancy guard. It
// swallows the rejection after the latch resets so callers can `void run(...)`
// from an onClick without producing an unhandled promise rejection.
export function createSafeSubmit(): SafeSubmitRun {
  let submitting = false
  return async (fn: () => Promise<unknown>) => {
    if (submitting) return
    submitting = true
    try {
      await fn()
    } catch {
      // Owned by the mutation's error handling; the guard only manages re-entry.
    } finally {
      submitting = false
    }
  }
}

// React-Compiler-safe: the latch lives in a stable closure created once via
// useMemo; nothing is mutated during render.
export function useSafeSubmit(): SafeSubmitRun {
  return useMemo(() => createSafeSubmit(), [])
}

export default useSafeSubmit
