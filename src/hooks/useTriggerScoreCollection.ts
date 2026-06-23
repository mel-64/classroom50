import { useMutation, useQuery } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useEffect, useState } from "react"
import { triggerScoreCollection } from "./github/mutations"
import { getCollectScoresRunAfterId, githubKeys } from "./github/queries"

export type CollectScoresPhase =
  | "idle"
  | "dispatching"
  | "running"
  | "completed"
  | "failed"
  | "timeout"

// Stop polling for the dispatched run after this long; a run that hasn't
// registered or completed by now is treated as a timeout so the UI doesn't spin
// forever (and we don't poll the runs API indefinitely).
const POLL_TIMEOUT_MS = 10 * 60 * 1000
// Poll quickly at first, then back off so a long/stuck run doesn't hammer the
// GitHub runs API every 5s for the full timeout window.
const POLL_INTERVAL_MS = 5000
const POLL_BACKOFF_AFTER_MS = 60 * 1000
const POLL_BACKOFF_INTERVAL_MS = 15000

// A run is finished once GitHub reports a terminal conclusion (success,
// failure, cancelled, timed_out, ...), regardless of whether `status` has
// flipped to "completed" yet. Polling stops on either signal.
const isRunFinished = (
  run: { status: string; conclusion: string | null } | null | undefined,
) => Boolean(run && (run.status === "completed" || run.conclusion !== null))

// The in-flight dispatch we're tracking. `sinceRunId` is the newest dispatch
// run id seen *before* the POST (null = none existed); the run we triggered is
// the oldest dispatch run with a larger id. `startedAt` anchors the timeout to
// the original dispatch so it survives a remount (rather than restarting).
type DispatchState = { sinceRunId: number | null; startedAt: number }

const storageKey = (org: string) => `cl50:collect-scores:${org}`

// Persist the dispatch across unmount/remount so navigating away and back
// re-attaches to the in-flight run instead of going idle (which would re-enable
// "Collect now" and invite a duplicate dispatch). sessionStorage is scoped to
// the tab, which is the right lifetime for "a collection I started this session".
const loadDispatch = (org: string): DispatchState | null => {
  if (!org) return null
  try {
    const raw = sessionStorage.getItem(storageKey(org))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DispatchState
    // Drop a stale entry whose timeout window has already elapsed.
    if (Date.now() - parsed.startedAt > POLL_TIMEOUT_MS) {
      sessionStorage.removeItem(storageKey(org))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const saveDispatch = (org: string, state: DispatchState | null) => {
  if (!org) return
  try {
    if (state) sessionStorage.setItem(storageKey(org), JSON.stringify(state))
    else sessionStorage.removeItem(storageKey(org))
  } catch {
    // Best-effort persistence; tracking still works within this mount.
  }
}

/**
 * Triggers the collect-scores workflow and tracks the resulting run to
 * completion. The dispatch API returns no run id, so we snapshot the newest
 * dispatch run id *before* the POST and then poll for the oldest run with a
 * larger id — binding the poll to our own run (clock-independent, unambiguous
 * across concurrent dispatches). The dispatch is persisted to sessionStorage so
 * a remount re-attaches to an in-flight run. `phase` latches at
 * completed/failed/timeout until the next dispatch.
 */
const useTriggerScoreCollection = (org: string) => {
  const client = useGitHubClient()
  const [dispatch, setDispatch] = useState<DispatchState | null>(() =>
    loadDispatch(org),
  )
  const [timedOut, setTimedOut] = useState(false)
  // The org the current `dispatch`/`timedOut` state belongs to. When `org`
  // changes we re-derive from storage during render (the React-idiomatic
  // alternative to a setState-in-effect), so the hook never tracks one org's
  // run against another.
  const [trackedOrg, setTrackedOrg] = useState(org)
  if (org !== trackedOrg) {
    setTrackedOrg(org)
    setDispatch(loadDispatch(org))
    setTimedOut(false)
  }

  const mutation = useMutation({
    // Collect all classrooms (org-wide), matching the "Last collected" timestamp
    // semantics. To narrow to a single classroom later, pass its slug as the
    // third arg: triggerScoreCollection(client, org, classroom). The workflow
    // already accepts a `classroom` dispatch input.
    mutationFn: () => triggerScoreCollection(client, org),
    onSuccess: (result) => {
      setTimedOut(false)
      const next: DispatchState = {
        sinceRunId: result.sinceRunId,
        startedAt: Date.now(),
      }
      saveDispatch(org, next)
      setDispatch(next)
    },
  })

  const runQuery = useQuery({
    queryKey: githubKeys.collectScoresRun(org, dispatch?.sinceRunId ?? null),
    queryFn: ({ signal }) =>
      getCollectScoresRunAfterId(client, org, dispatch?.sinceRunId ?? null, signal),
    enabled: Boolean(org && dispatch && !timedOut),
    refetchInterval: (query) => {
      if (isRunFinished(query.state.data)) return false
      // Back off the cadence once the run has been pending for a while so a
      // stuck/long run doesn't poll every 5s for the full 10 minutes.
      const polls = query.state.dataUpdateCount
      return polls * POLL_INTERVAL_MS >= POLL_BACKOFF_AFTER_MS
        ? POLL_BACKOFF_INTERVAL_MS
        : POLL_INTERVAL_MS
    },
    // Surface a persistent poll failure instead of retrying invisibly until the
    // 10-minute timeout (the app-wide QueryClient has no retry policy of its own).
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })

  const run = runQuery.data
  const runCompleted = Boolean(dispatch) && isRunFinished(run)

  // Clear the persisted dispatch once the run terminates so a remount doesn't
  // re-attach to a finished run; phase stays latched within this mount because
  // `dispatch` state is only reset on org change or a new dispatch.
  useEffect(() => {
    if (runCompleted) saveDispatch(org, null)
  }, [runCompleted, org])

  // Bound the wait so a run that never registers or hangs doesn't poll forever;
  // on timeout we flip a flag that both stops the query (via `enabled`) and
  // latches `phase` to "timeout". The deadline is anchored to the original
  // dispatch time so a remount doesn't grant a fresh 10 minutes (a deadline
  // already in the past schedules a 0ms timer rather than setting state inline).
  useEffect(() => {
    if (!dispatch || runCompleted || timedOut) return
    const remaining = Math.max(
      0,
      dispatch.startedAt + POLL_TIMEOUT_MS - Date.now(),
    )
    const id = window.setTimeout(() => {
      setTimedOut(true)
      saveDispatch(org, null)
    }, remaining)
    return () => window.clearTimeout(id)
  }, [dispatch, runCompleted, timedOut, org])

  let phase: CollectScoresPhase = "idle"
  if (mutation.isPending) phase = "dispatching"
  else if (mutation.isError) phase = "failed"
  // A persistent poll error (no retry) is a failure, not an endless spin.
  else if (Boolean(dispatch) && runQuery.isError) phase = "failed"
  else if (runCompleted)
    phase = run?.conclusion === "success" ? "completed" : "failed"
  else if (timedOut) phase = "timeout"
  else if (dispatch) phase = "running"

  return {
    collect: () => mutation.mutate(),
    phase,
    run,
    error: mutation.error ?? runQuery.error,
  }
}

export default useTriggerScoreCollection
