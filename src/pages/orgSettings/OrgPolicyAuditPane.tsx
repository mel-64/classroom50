import { useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react"

import { githubKeys } from "@/hooks/github/queries"
import useGetOrgAudit from "@/hooks/useGetOrgAudit"
import useGetOrgMembership from "@/hooks/useGetOrgMembership"
import useGetOrgPlanDetails from "@/hooks/useGetOrgPlanDetails"
import type {
  AuditVerdict,
  ConcernCheck,
  OrgAuditReport,
} from "@/orgPolicy/audit"
import type { CheckState } from "@/hooks/github/orgChecks"

// Org policy audit pane: surfaces every org/repo policy concern with its live
// drift verdict, the unenforced member-default fields (each with its manual
// fix), and the four API-less manual steps. Repairs run through the re-run
// onboarding flow (owner-gated), so this pane is read-only review plus a
// pointer to that action. Mirrors the service-token pane's banner shape.

const VERDICT_BANNER: Record<
  AuditVerdict,
  { className: string; Icon: typeof CheckCircle2; iconClassName: string; title: string }
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
  unenforced: "Drifted",
  unreadable: "Unreadable",
}

const CONCERN_STATE_BADGE: Record<CheckState, string> = {
  enforced: "badge-success",
  unenforced: "badge-warning",
  unreadable: "badge-neutral badge-ghost",
}

function ConcernRow({ concern }: { concern: ConcernCheck }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-base-300 bg-base-100 p-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{concern.title}</div>
        {concern.verdict.detail && (
          <p className="mt-0.5 text-xs text-base-content/60">
            {concern.verdict.detail}
          </p>
        )}
      </div>
      <span className={`badge ${CONCERN_STATE_BADGE[concern.verdict.state]}`}>
        {CONCERN_STATE_LABEL[concern.verdict.state]}
      </span>
    </div>
  )
}

function AuditBody({ report }: { report: OrgAuditReport }) {
  const banner = VERDICT_BANNER[report.verdict]
  const { Icon } = banner

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
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {report.concerns.map((c) => (
          <ConcernRow key={c.id} concern={c} />
        ))}
      </div>

      {report.unenforcedDefaults.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">
            Member-privilege settings to fix
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-base-content/70">
            {report.unenforcedDefaults.map((s) => (
              <li key={s.field}>
                {s.desc}
                {s.manualFix && (
                  <span className="text-base-content/50"> — {s.manualFix}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-semibold">Confirm by hand</h3>
        <p className="mt-1 text-xs text-base-content/50">
          These settings have no API to read; confirm them on the{" "}
          <a
            href={report.settingsUrl}
            target="_blank"
            rel="noreferrer"
            className="link"
          >
            member privileges page
          </a>
          .
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-base-content/70">
          {report.manualUnreadable.map((step) => (
            <li key={step.setting}>{step.setting}</li>
          ))}
        </ul>
      </div>
    </>
  )
}

const OrgPolicyAuditPane = ({ org }: { org: string }) => {
  const queryClient = useQueryClient()
  const { data: planDetails } = useGetOrgPlanDetails(org)
  const { data: membership } = useGetOrgMembership(org)
  const isOwner = membership?.role === "admin"

  const {
    data: report,
    isLoading,
    isError,
    refetch,
  } = useGetOrgAudit(org, planDetails?.plan.name)

  return (
    <section className="mt-8 rounded-2xl border border-base-300 bg-base-100 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Organization policy</h2>
          <p className="mt-1 text-sm text-base-content/60">
            What Classroom 50 configures on your behalf, and whether anything has
            drifted from the expected lockdown.
          </p>
        </div>
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
      </div>

      {isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-base-content/60">
          <span className="loading loading-spinner loading-sm" />
          Auditing organization policy…
        </div>
      )}

      {isError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>Couldn&apos;t run the policy audit. Try re-checking.</span>
        </div>
      )}

      {report && <AuditBody report={report} />}

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-info" />
        <div>
          <p className="font-semibold text-base-content">Repairing drift</p>
          <p className="mt-1 text-base-content/70">
            {isOwner
              ? "Re-run setup below to re-apply the full lockdown, rulesets, and repo settings."
              : "Ask an organization owner to re-run setup to re-apply the lockdown — these changes require owner permissions."}
          </p>
        </div>
      </div>
    </section>
  )
}

export default OrgPolicyAuditPane
