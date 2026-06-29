import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  TriangleAlert,
  XCircle,
} from "lucide-react"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { githubKeys } from "@/hooks/github/queries"
import { useSafeSubmit } from "@/hooks/useSafeSubmit"
import useGetOrgAudit from "@/hooks/useGetOrgAudit"
import useGetOrgMembership from "@/hooks/useGetOrgMembership"
import useGetOrgPlanDetails from "@/hooks/useGetOrgPlanDetails"
import type {
  AuditVerdict,
  ConcernCheck,
  ConcernId,
  OrgAuditReport,
} from "@/orgPolicy/audit"
import { REPAIRABLE_CONCERNS, repairConcern } from "@/orgPolicy/repair"
import type { CheckState } from "@/hooks/github/orgChecks"
import SettingsSection from "./SettingsSection"

// Org policy audit pane: surfaces every org/repo policy concern with its live
// drift verdict, the unenforced member-default fields (each with its manual
// fix), and the four API-less manual steps. Repairs run through the re-run
// onboarding flow (owner-gated), so this pane is read-only review plus a
// pointer to that action. Mirrors the service-token pane's banner shape.

const VERDICT_BANNER: Record<
  AuditVerdict,
  {
    className: string
    Icon: typeof CheckCircle2
    iconClassName: string
    title: string
  }
> = {
  ok: {
    className: "border-success/30 bg-success/10",
    Icon: CheckCircle2,
    iconClassName: "text-success",
    title: "Org policy verified",
  },
  warn: {
    className: "border-warning/30 bg-warning/10",
    Icon: TriangleAlert,
    iconClassName: "text-warning",
    title: "Org policy OK, but some settings drifted",
  },
  fail: {
    className: "border-error/30 bg-error/10",
    Icon: XCircle,
    iconClassName: "text-error",
    title: "Org policy incomplete",
  },
}

const CONCERN_STATE_LABEL: Record<CheckState, string> = {
  enforced: "OK",
  unenforced: "Needs attention",
  unreadable: "Unreadable",
}

const CONCERN_STATE_BADGE: Record<CheckState, string> = {
  enforced: "badge-success",
  unenforced: "badge-error",
  unreadable: "badge-neutral badge-ghost",
}

function ConcernRow({
  concern,
  canFix,
  fixing,
  onFix,
}: {
  concern: ConcernCheck
  canFix: boolean
  fixing: boolean
  onFix: (id: ConcernId) => void
}) {
  const isDrifted = concern.verdict.state === "unenforced"
  const showFix = isDrifted && canFix && REPAIRABLE_CONCERNS.has(concern.id)

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-base-300 bg-base-100 p-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{concern.title}</div>
        {concern.verdict.detail && (
          <p className="mt-0.5 text-xs text-base-content/60">
            {concern.verdict.detail}
          </p>
        )}
        <a
          href={concern.settingsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-base-content/50 hover:text-primary"
        >
          View on GitHub
          <ExternalLink className="size-3" />
        </a>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showFix && (
          <button
            type="button"
            className="btn btn-xs btn-primary"
            disabled={fixing}
            onClick={() => onFix(concern.id)}
          >
            {fixing ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Fix it"
            )}
          </button>
        )}
        <span className={`badge ${CONCERN_STATE_BADGE[concern.verdict.state]}`}>
          {CONCERN_STATE_LABEL[concern.verdict.state]}
        </span>
      </div>
    </div>
  )
}

function AuditBody({
  report,
  canFix,
  fixingId,
  onFix,
}: {
  report: OrgAuditReport
  canFix: boolean
  fixingId: ConcernId | null
  onFix: (id: ConcernId) => void
}) {
  const banner = VERDICT_BANNER[report.verdict]
  const { Icon } = banner
  const [showPermissions, setShowPermissions] = useState(false)

  return (
    <>
      <div
        className={[
          "mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm",
          banner.className,
        ].join(" ")}
      >
        <Icon className={`mt-0.5 size-5 shrink-0 ${banner.iconClassName}`} />
        <div className="min-w-0">
          <p className="font-semibold text-base-content">{banner.title}</p>
          {!report.readOk && (
            <p className="mt-1 text-base-content/70">
              Couldn&apos;t read the organization to audit the lockdown. Check
              your access and retry.
            </p>
          )}
          {report.readOk && report.verdict !== "ok" && (
            <p className="mt-1 text-base-content/70">
              {canFix
                ? "Use “Fix it” on a drifted setting, or re-run setup below to re-apply everything at once."
                : "Ask an organization owner to repair the drift — these changes require owner permissions."}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {report.concerns.map((c) => (
          <ConcernRow
            key={c.id}
            concern={c}
            canFix={canFix}
            fixing={fixingId === c.id}
            onFix={onFix}
          />
        ))}
      </div>

      {report.manualUnreadable.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold">Confirm by hand</h3>
          <p className="mt-1 text-xs text-base-content/50">
            GitHub exposes no API to read these settings, so we can&apos;t
            verify them automatically — confirm each one on the member
            privileges page.
          </p>
          <div className="mt-2 grid gap-2">
            {report.manualUnreadable.map((step) => (
              <div
                key={step.setting}
                className="flex items-start justify-between gap-4 rounded-lg border border-warning/40 bg-warning/5 p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-base-content/80">
                    {step.setting}
                  </div>
                  <a
                    href={step.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-base-content/50 hover:text-primary"
                  >
                    View on GitHub
                    <ExternalLink className="size-3" />
                  </a>
                </div>
                <span className="badge badge-warning badge-soft shrink-0">
                  Confirm manually
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.defaultVerdicts.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-semibold hover:text-primary"
            aria-expanded={showPermissions}
            onClick={() => setShowPermissions((open) => !open)}
          >
            {showPermissions ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            Member permissions we configure
          </button>
          {showPermissions && (
            <>
              <p className="mt-1 text-xs text-base-content/50">
                The organization member privileges Classroom 50 sets on your
                behalf, and whether each currently matches.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {report.defaultVerdicts.map((v) => (
                  <li
                    key={v.setting.field}
                    className="flex items-start justify-between gap-3"
                  >
                    <span className="text-base-content/70">
                      {v.setting.desc}
                      {!v.enforced && v.setting.manualFix && (
                        <span className="text-base-content/40">
                          {" "}
                          — {v.setting.manualFix}
                        </span>
                      )}
                    </span>
                    {v.enforced ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    ) : (
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  )
}

const OrgPolicyAuditPane = ({ org }: { org: string }) => {
  const client = useGitHubClient()
  const queryClient = useQueryClient()
  const runFix = useSafeSubmit()
  const { data: planDetails } = useGetOrgPlanDetails(org)
  const { data: membership } = useGetOrgMembership(org)
  const isOwner = membership?.role === "admin"

  const {
    data: report,
    isLoading,
    isError,
    refetch,
  } = useGetOrgAudit(org, planDetails?.plan.name)

  const fixMutation = useMutation({
    mutationFn: (id: ConcernId) =>
      repairConcern(client, org, id, planDetails?.plan.name),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: githubKeys.orgAudit(org),
      })
    },
  })
  // The concern currently being repaired, so only its button shows a spinner.
  const fixingId = fixMutation.isPending
    ? (fixMutation.variables ?? null)
    : null

  return (
    <SettingsSection
      title="Organization policy"
      description="What Classroom 50 configures on your behalf, and whether anything has drifted from the expected lockdown."
      action={
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            void queryClient.invalidateQueries({
              queryKey: githubKeys.orgAudit(org),
            })
            void refetch()
          }}
        >
          Re-check
        </button>
      }
    >
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-base-content/60">
          <span className="loading loading-spinner loading-sm" />
          Auditing organization policy…
        </div>
      )}

      {isError && (
        <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>Couldn&apos;t run the policy audit. Try re-checking.</span>
        </div>
      )}

      {fixMutation.isError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Couldn&apos;t apply the fix. You may lack owner permissions, or an
            enterprise policy blocks this change.
          </span>
        </div>
      )}

      {report && (
        <AuditBody
          report={report}
          canFix={Boolean(isOwner)}
          fixingId={fixingId}
          onFix={(id) => {
            if (!fixMutation.isPending)
              void runFix(() => fixMutation.mutateAsync(id))
          }}
        />
      )}
    </SettingsSection>
  )
}

export default OrgPolicyAuditPane
