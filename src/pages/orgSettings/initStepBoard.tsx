import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react"
import type { ReactNode } from "react"

import type {
  InitStepId,
  InitStepStatus,
  InitStepUpdate,
} from "@/hooks/github/mutations"

// Shared init "badge board" used by both the onboarding wizard (OrgSetupPage)
// and the re-run action on the Org Settings page. One source of truth for the
// step order, titles, and per-step rendering so the two surfaces can't drift.

export const INIT_STEP_ORDER: InitStepId[] = [
  "orgDefaults",
  "orgActions",
  "orgPrCreation",
  "configRepo",
  "skeleton",
  "branchProtection",
  "workflowPermissions",
  "reusableWorkflowAccess",
  "pages",
  "rulesets",
]

export const initialInitSteps: Record<InitStepId, InitStepUpdate> = {
  orgDefaults: {
    id: "orgDefaults",
    status: "pending",
    title: "Organization safety defaults",
  },
  orgActions: {
    id: "orgActions",
    status: "pending",
    title: "Actions permissions",
  },
  orgPrCreation: {
    id: "orgPrCreation",
    status: "pending",
    title: "Actions pull request creation",
  },
  configRepo: {
    id: "configRepo",
    status: "pending",
    title: "Config repository",
  },
  skeleton: { id: "skeleton", status: "pending", title: "Skeleton files" },
  branchProtection: {
    id: "branchProtection",
    status: "pending",
    title: "Branch protection",
  },
  workflowPermissions: {
    id: "workflowPermissions",
    status: "pending",
    title: "Workflow permissions",
  },
  reusableWorkflowAccess: {
    id: "reusableWorkflowAccess",
    status: "pending",
    title: "Reusable workflow access",
  },
  pages: { id: "pages", status: "pending", title: "GitHub Pages" },
  rulesets: {
    id: "rulesets",
    status: "pending",
    title: "Branch protection rulesets",
  },
}

export function applyStepUpdate(
  steps: Record<InitStepId, InitStepUpdate>,
  update: InitStepUpdate,
): Record<InitStepId, InitStepUpdate> {
  return {
    ...steps,
    [update.id]: {
      ...steps[update.id],
      ...update,
    },
  }
}

const STATUS_BADGE_CLASS: Record<InitStepStatus, string> = {
  complete: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  pending: "badge-neutral badge-ghost",
  running: "badge-neutral badge-ghost",
  skipped: "badge-neutral badge-ghost",
}

const STATUS_ICON: Record<InitStepStatus, ReactNode> = {
  complete: <CheckCircle className="size-4" />,
  warning: <AlertCircle className="size-4" />,
  error: <AlertTriangle className="size-4" />,
  running: <span className="loading loading-spinner size-4" />,
  pending: null,
  skipped: null,
}

export const InitStep = ({
  title,
  description,
  status,
  message,
}: {
  title: string
  description?: string
  status: InitStepStatus
  message?: string
}) => {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-base-300 bg-base-100 p-4">
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm text-base-content/70">
          {message || description}
        </p>
      </div>
      <span className={`badge ${STATUS_BADGE_CLASS[status]}`}>
        {STATUS_ICON[status]}
      </span>
    </div>
  )
}

export const InitStepBoard = ({
  steps,
}: {
  steps: Record<InitStepId, InitStepUpdate>
}) => (
  <div className="grid gap-3">
    {INIT_STEP_ORDER.map((id) => {
      const step = steps[id]
      return (
        <InitStep
          key={step.id}
          title={step.title ?? step.id}
          status={step.status}
          description={step.message ?? step.error}
        />
      )
    })}
  </div>
)
