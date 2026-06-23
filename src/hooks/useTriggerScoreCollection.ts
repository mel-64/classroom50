import { useMutation, useQuery } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { useEffect, useState } from "react"
import { triggerScoreCollection } from "./github/mutations"
import { getLatestCollectScoresRun, githubKeys } from "./github/queries"

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
const isRunFinished = (run: { status: string; conclusion: string | null } | null | undefined) =>
  Boolean(run && (run.status === "completed" || run.conclusion !== null))

/**
 * Triggers the collect-scores workflow and tracks the resulting run. After
 * dispatch we poll the latest matching workflow_dispatch run (the dispatch API
 * returns no run id) until it finishes or times out. `phase` is derived from the
 * mutation and the live run, so callers can react to completion (e.g. refetch
 * scores) via their own effect. `dispatchedAt` is never cleared, so a finished
 * run keeps `phase` latched at completed/failed/timeout until the next dispatch.
 */
const useTriggerScoreCollection = (org: string) => {
  const client = useGitHubClient()
  const [dispatchedAt, setDispatchedAt] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  const mutation = useMutation({
    // Collect all classrooms (org-wide), matching the "Last collected" timestamp
    // semantics. To narrow to a single classroom later, pass its slug as the
    // third arg: triggerScoreCollection(client, org, classroom). The workflow
    // already accepts a `classroom` dispatch input.
    mutationFn: () => triggerScoreCollection(client, org),
    onSuccess: (result) => {
      setTimedOut(false)
      setDispatchedAt(result.dispatchedAt)
    },
  })

  const runQuery = useQuery({
    queryKey: githubKeys.collectScoresRun(org, dispatchedAt),
    queryFn: ({ signal }) =>
      getLatestCollectScoresRun(client, org, dispatchedAt ?? "", signal),
    enabled: Boolean(org && dispatchedAt && !timedOut),
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
  const runCompleted = Boolean(dispatchedAt) && isRunFinished(run)

  // Bound the wait so a run that never registers or hangs doesn't poll forever;
  // on timeout we flip a flag that both stops the query (via `enabled`) and
  // latches `phase` to "timeout".
  useEffect(() => {
    if (!dispatchedAt || runCompleted || timedOut) return
    const id = window.setTimeout(() => setTimedOut(true), POLL_TIMEOUT_MS)
    return () => window.clearTimeout(id)
  }, [dispatchedAt, runCompleted, timedOut])

  let phase: CollectScoresPhase = "idle"
  if (mutation.isPending) phase = "dispatching"
  else if (mutation.isError) phase = "failed"
  // A persistent poll error (no retry) is a failure, not an endless spin.
  else if (Boolean(dispatchedAt) && runQuery.isError) phase = "failed"
  else if (runCompleted)
    phase = run?.conclusion === "success" ? "completed" : "failed"
  else if (timedOut) phase = "timeout"
  else if (dispatchedAt) phase = "running"

  return {
    collect: () => mutation.mutate(),
    phase,
    run,
    error: mutation.error ?? runQuery.error,
  }
}

export default useTriggerScoreCollection
