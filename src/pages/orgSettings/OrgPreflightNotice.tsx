import { Link } from "@tanstack/react-router"
import { AlertTriangle, XCircle } from "lucide-react"

import useGetServiceTokenStatus from "@/hooks/useGetServiceTokenStatus"
import useGetOrgAudit from "@/hooks/useGetOrgAudit"
import useGetOrgPlanDetails from "@/hooks/useGetOrgPlanDetails"

// Teacher preflight banner shown when an org is opened. The service-token and
// policy checks live HERE (one org at a time) rather than on the org list,
// which would fan out these reads across every org the user can see.
//
// One aggregated "preflight check" banner names every failing category rather
// than surfacing them one at a time; the org settings page is the source of
// truth for the per-item detail. Severity is the worst of the failing checks:
// a missing token or critical policy gap is an error; non-critical policy
// drift is a softer warning. Renders nothing while loading or when all checks
// pass.
const OrgPreflightNotice = ({ org }: { org: string }) => {
  const { data: tokenStatus } = useGetServiceTokenStatus(org)
  const { data: planDetails } = useGetOrgPlanDetails(org)
  const { data: audit } = useGetOrgAudit(org, planDetails?.plan.name)

  const tokenMissing = tokenStatus?.status === "missing"
  const policyFail = audit?.verdict === "fail"
  const policyWarn = audit?.verdict === "warn"

  // Each failing check contributes a named category and a severity. The banner
  // aggregates them; the worst severity drives the styling.
  const failing: { label: string; severity: "error" | "warning" }[] = []
  if (tokenMissing) failing.push({ label: "service token", severity: "error" })
  if (policyFail)
    failing.push({ label: "organization policy", severity: "error" })
  else if (policyWarn)
    failing.push({ label: "organization policy", severity: "warning" })

  if (failing.length === 0) return null

  const isError = failing.some((f) => f.severity === "error")
  const categories = failing.map((f) => f.label).join(", ")

  return (
    <div
      role="alert"
      className={`alert ${isError ? "alert-error" : "alert-warning"} alert-soft mb-6`}
    >
      {isError ? (
        <XCircle className="size-5" />
      ) : (
        <AlertTriangle className="size-5" />
      )}
      <div className="text-sm">
        <p className="font-semibold">
          {isError
            ? "Organization preflight check failed"
            : "Organization preflight check needs attention"}
        </p>
        <p className="mt-0.5 text-base-content/70">
          {failing.length === 1
            ? `An issue was found with this organization's ${categories}.`
            : `Issues were found with this organization's ${categories}.`}{" "}
          Review and fix on the{" "}
          <Link to="/$org/settings" params={{ org }} className="link">
            organization settings page
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

export default OrgPreflightNotice
