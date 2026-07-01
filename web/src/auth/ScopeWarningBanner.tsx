import { useState } from "react"
import { ShieldAlert, TriangleAlert } from "lucide-react"
import { AnimatePresence } from "motion/react"

import { useGithubAuth } from "./useGithubAuth"
import { AppBanner } from "@/components/AppBanner"
import {
  useMissingScopes,
  useTokenRevoked,
} from "@/context/github/GitHubProvider"

// Surfaces two distinct token problems detected from live API responses:
//   1. Revoked / expired token (401 Bad credentials) — the app can't make any
//      authenticated call; show an error and route to a fresh sign-in.
//   2. Missing required scopes — best-effort; offer re-authorize.
// Both are non-blocking. The revoked case takes precedence because a dead token
// makes the scope question moot.
export function ScopeWarningBanner() {
  const revoked = useTokenRevoked()
  const missing = useMissingScopes()
  const { startWebFlow, signOut } = useGithubAuth()
  const [dismissed, setDismissed] = useState(false)

  if (revoked) {
    return (
      <AnimatePresence initial={false}>
        <AppBanner
          key="revoked"
          tone="error"
          icon={<TriangleAlert className="size-5" aria-hidden="true" />}
          title="Your GitHub session has expired"
        >
          <p className="text-base-content/70">
            This app&apos;s access was revoked or the session timed out —
            requests are failing with{" "}
            <code className="font-mono text-xs">401 Bad credentials</code>. Sign
            in again to continue.
          </p>
          <button
            type="button"
            className="btn btn-sm btn-error self-start"
            onClick={() => signOut()}
          >
            Sign in again
          </button>
        </AppBanner>
      </AnimatePresence>
    )
  }

  const show = missing.length > 0 && !dismissed

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <AppBanner
          key="missing-scopes"
          tone="warning"
          icon={<ShieldAlert className="size-5" aria-hidden="true" />}
          title="Some GitHub permissions are missing"
          onDismiss={() => setDismissed(true)}
        >
          <p className="text-base-content/70">
            This app needs the {missing.length === 1 ? "scope" : "scopes"}{" "}
            <code className="font-mono text-xs">{missing.join(", ")}</code>.
            Some actions may fail until{" "}
            {missing.length === 1 ? "it is" : "they are"} granted.
          </p>
          <button
            type="button"
            className="btn btn-sm btn-warning self-start"
            onClick={() => void startWebFlow()}
          >
            Re-authorize
          </button>
          <p className="text-xs text-base-content/70">
            If re-authorizing doesn&apos;t clear this, an organization owner may
            need to approve the app in the org&apos;s OAuth policy settings.
          </p>
        </AppBanner>
      ) : null}
    </AnimatePresence>
  )
}
