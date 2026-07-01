import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import type {
  InitStepId,
  InitStepStatus,
  InitStepUpdate,
} from "@/hooks/github/mutations"

// Shared init "badge board" used by both the onboarding wizard (OrgSetupPage)
// and the re-run action on the Org Settings page. One source of truth for the
// step order, titles, per-step explanations, and rendering so the two surfaces
// can't drift.

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

// Per-step explanation shared by the wizard and the re-run surface. `what`
// says what we change on the org/repo, `why` says why Classroom 50 needs it,
// and `remediation` is the actionable next step a teacher takes when the step
// warns or errors (paired with the GitHub deep link below).
type InitStepMeta = {
  what: string
  why: string
  remediation: string
  // The GitHub settings page where the teacher inspects/fixes this step. Some
  // steps are org-scoped, others target the classroom50 config repo. Returns
  // null for steps with no single settings page to point at (repo + file
  // creation), where the remediation is "retry" rather than "go change X".
  settingsUrl: (org: string) => string | null
}

const orgSettingsBase = (org: string) =>
  `https://github.com/organizations/${org}/settings`
const repoSettingsBase = (org: string) =>
  `https://github.com/${org}/classroom50/settings`

export const INIT_STEP_META: Record<InitStepId, InitStepMeta> = {
  orgDefaults: {
    what: "Locks down organization member privileges to safe defaults (base permissions, repo creation, visibility changes, and related settings).",
    why: "Stops students from changing or deleting each other's repositories, or making private classroom work public.",
    remediation:
      "Open the org member-privileges page and apply the flagged settings by hand — some are controlled by an enterprise policy and can only be set there.",
    settingsUrl: (org) => `${orgSettingsBase(org)}/member_privileges`,
  },
  orgActions: {
    what: "Enables GitHub Actions for the organization.",
    why: "Autograding and the published assignment site run as Actions workflows, so they can't run until Actions is enabled.",
    remediation:
      "Open the org Actions settings and allow Actions to run (set the policy to allow all actions, or at minimum the workflows Classroom 50 ships).",
    settingsUrl: (org) => `${orgSettingsBase(org)}/actions`,
  },
  orgPrCreation: {
    what: "Allows GitHub Actions to create and approve pull requests in the organization.",
    why: "Some Classroom 50 workflows open pull requests on a student's behalf; without this they fail with a permissions error.",
    remediation:
      'Open the org Actions settings and enable "Allow GitHub Actions to create and approve pull requests".',
    settingsUrl: (org) => `${orgSettingsBase(org)}/actions`,
  },
  configRepo: {
    what: "Creates the private classroom50 configuration repository in the organization.",
    why: "Classroom 50 has no backend — this repo holds all classroom config, manifests, workflows, and scores.",
    remediation:
      "This is a required step. Re-run setup; if it keeps failing, confirm you have owner permissions and that an org/enterprise policy isn't blocking private repository creation.",
    settingsUrl: () => null,
  },
  skeleton: {
    what: "Commits or updates the workflow and script files Classroom 50 needs in the classroom50 repository.",
    why: "These bundled files run autograding, publishing, and scoring; re-running setup also upgrades them to the latest version.",
    remediation:
      "This is a required step. Re-run setup; if it keeps failing, check that you can push to the classroom50 repo's default branch.",
    settingsUrl: () => null,
  },
  branchProtection: {
    what: "Protects the classroom50 repository's main branch.",
    why: "Keeps the source-of-truth config and scores from being force-pushed or deleted.",
    remediation:
      "Open the repository branch settings and protect the main branch, or re-run setup to re-apply it.",
    settingsUrl: (org) => `${repoSettingsBase(org)}/branches`,
  },
  workflowPermissions: {
    what: "Sets the default GITHUB_TOKEN workflow permissions for the classroom50 repository.",
    why: "Autograding and publishing workflows need write access to commit results and deploy Pages.",
    remediation:
      "Open the repository Actions settings and set workflow permissions to read and write, or re-run setup.",
    settingsUrl: (org) => `${repoSettingsBase(org)}/actions`,
  },
  reusableWorkflowAccess: {
    what: "Allows other repositories in the org to use the reusable workflows in classroom50.",
    why: "Assignment repos call the shared autograding workflow from classroom50; without access sharing, their runs fail.",
    remediation:
      'Open the repository Actions settings and, under "Access", allow access from repositories in the organization. Or re-run setup.',
    settingsUrl: (org) => `${repoSettingsBase(org)}/actions`,
  },
  pages: {
    what: "Enables GitHub Pages for the classroom50 repository (built from Actions).",
    why: "Published assignment instructions and dashboards are served from this Pages site.",
    remediation:
      "Open the repository Pages settings and enable Pages with the GitHub Actions source. Pages from a private repo may require GitHub Team or Enterprise.",
    settingsUrl: (org) => `${repoSettingsBase(org)}/pages`,
  },
  rulesets: {
    what: "Creates organization rulesets that protect classroom and assignment repositories.",
    why: "Rulesets enforce the classroom guardrails (protected branches, restricted deletions) across every repo the org creates.",
    remediation:
      "Open the org rulesets page to review them, or re-run setup to re-apply. Rulesets may require GitHub Team or Enterprise.",
    settingsUrl: (org) => `${orgSettingsBase(org)}/rules`,
  },
}

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
  complete: <CheckCircle aria-hidden="true" className="size-4" />,
  warning: <AlertCircle aria-hidden="true" className="size-4" />,
  error: <AlertTriangle aria-hidden="true" className="size-4" />,
  running: (
    <span className="loading loading-spinner size-4" aria-hidden="true" />
  ),
  pending: null,
  skipped: null,
}

export const InitStep = ({
  id,
  title,
  status,
  message,
  org,
}: {
  id: InitStepId
  title: string
  status: InitStepStatus
  message?: string
  // Without an org the per-step GitHub deep link can't be built, so it's
  // omitted; the explanation and remediation text still render.
  org?: string
}) => {
  const meta = INIT_STEP_META[id]
  const needsAttention = status === "warning" || status === "error"
  // Auto-expand the steps that need action so the teacher sees the fix without
  // hunting; everything else starts collapsed to keep the board scannable. We
  // keep `open` as the single source of truth (seeded from needsAttention and
  // re-opened whenever a step transitions into attention) so the disclosure
  // toggle can always collapse a panel — even a warning/error one.
  const [open, setOpen] = useState(needsAttention)
  const prevNeedsAttention = useRef(needsAttention)
  useEffect(() => {
    if (needsAttention && !prevNeedsAttention.current) setOpen(true)
    prevNeedsAttention.current = needsAttention
  }, [needsAttention])

  const settingsUrl = org ? meta.settingsUrl(org) : null

  return (
    <div className="rounded-xl border border-base-300 bg-base-100">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-start justify-between gap-4 p-4 text-left"
      >
        <div className="flex min-w-0 items-start gap-2">
          {open ? (
            <ChevronDown
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-base-content/70"
            />
          ) : (
            <ChevronRight
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-base-content/70"
            />
          )}
          <div className="min-w-0">
            <div className="font-semibold">{title}</div>
            <p className="mt-1 text-sm text-base-content/70">
              {message || meta.what}
            </p>
          </div>
        </div>
        <span className={`badge shrink-0 ${STATUS_BADGE_CLASS[status]}`}>
          {STATUS_ICON[status]}
        </span>
      </button>

      {open && (
        <div className="border-t border-base-200 px-4 pb-4 pt-3 pl-10 text-sm">
          <p className="text-base-content/70">{meta.what}</p>
          <p className="mt-1 text-base-content/70">
            <span className="font-medium text-base-content/70">Why: </span>
            {meta.why}
          </p>

          {needsAttention && (
            <div
              className={`mt-3 rounded-lg border p-3 ${
                status === "error"
                  ? "border-error/30 bg-error/10"
                  : "border-warning/30 bg-warning/10"
              }`}
            >
              <p className="font-medium text-base-content/80">
                {status === "error" ? "How to fix" : "What to do"}
              </p>
              <p className="mt-1 text-base-content/70">{meta.remediation}</p>
              {settingsUrl && (
                <a
                  href={settingsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-base-content/70 hover:text-primary"
                >
                  Open the relevant GitHub settings
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const InitStepBoard = ({
  steps,
  org,
}: {
  steps: Record<InitStepId, InitStepUpdate>
  org?: string
}) => (
  <div className="grid gap-3">
    {INIT_STEP_ORDER.map((id) => {
      const step = steps[id]
      return (
        <InitStep
          key={step.id}
          id={step.id}
          title={step.title ?? step.id}
          status={step.status}
          message={step.message ?? step.error}
          org={org}
        />
      )
    })}
  </div>
)
