import { useParams } from "@tanstack/react-router"

import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import useGetOrgMembership from "@/hooks/useGetOrgMembership"
import useGetOrgPlanDetails from "@/hooks/useGetOrgPlanDetails"

const InitStep = ({
  title,
  description,
  status,
  message,
}: {
  title: string
  description: string
  status: "pending" | "running" | "complete" | "warning" | "error"
  message?: string
}) => {
  const badgeClass =
    status === "complete"
      ? "badge-success"
      : status === "warning"
        ? "badge-warning"
        : status === "error"
          ? "badge-error"
          : "badge-neutral"

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-base-300 bg-base-100 p-4">
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm text-base-content/70">
          {message || description}
        </p>
      </div>
      <span className={`badge ${badgeClass}`}>{status}</span>
    </div>
  )
}

const OrgSteps = ({ runInit }) => {
  const status = {
    orgDefaults: { status: "pending" as const, message: "" },
    configRepo: { status: "pending" as const, message: "" },
    skeleton: { status: "pending" as const, message: "" },
    pages: { status: "pending" as const, message: "" },
    collectToken: { status: "pending" as const, message: "" },
  }

  return (
    <div className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-5">
        <div>
          <h2 className="card-title">Initialize Classroom50</h2>
          <p className="text-sm text-base-content/70">
            This creates and configures the private classroom50 repo for this
            teaching organization.
          </p>
        </div>

        <div className="grid gap-3">
          <InitStep
            title="Organization safety defaults"
            description="Prevents new members from receiving implicit repo access and disables public repo creation by members."
            status={status.orgDefaults.status}
            message={status.orgDefaults.message}
          />
          <InitStep
            title="Private config repository"
            description="Creates or verifies the org-owned classroom50 repository."
            status={status.configRepo.status}
            message={status.configRepo.message}
          />
          <InitStep
            title="Skeleton workflows"
            description="Adds missing Classroom50 workflows without overwriting teacher edits."
            status={status.skeleton.status}
            message={status.skeleton.message}
          />
          <InitStep
            title="GitHub Pages"
            description="Publishes assignment manifests at the org Pages URL."
            status={status.pages.status}
            message={status.pages.message}
          />
          <InitStep
            title="Collect token"
            description="Stores the score collection PAT as a repository Actions secret."
            status={status.collectToken.status}
            message={status.collectToken.message}
          />
        </div>

        <div className="card-actions justify-end">
          <button className="btn btn-primary" onClick={runInit}>
            Run setup
          </button>
        </div>
      </div>
    </div>
  )
}

const NotAdminAlert = () => {
  return (
    <div className="alert alert-error">
      Classroom 50 setup requires org owner permissions. Ask an org owner to run
      setup.
    </div>
  )
}

const NotTeamOrEnterpriseWarning = () => {
  return (
    <div className="alert alert-warning">
      GitHub Pages from a private repository may require GitHub Team or
      Enterprise Cloud. You can continue setup, but published assignments may
      not be accessible until Pages is available for this org.
    </div>
  )
}

const OrgSetupPage = () => {
  const { org } = useParams({ strict: false })
  const runInit = () => console.log("init")
  const { data: orgMembership, isLoading } = useGetOrgMembership(org)
  const { data: orgPlanDetails, isLoading: isLoadingPlanDetails } =
    useGetOrgPlanDetails(org)

  const isOwner = orgMembership?.role === "admin"
  const isTeamOrEnterprise =
    orgPlanDetails?.plan.name === "team" ||
    orgPlanDetails?.plan.name === "enterprise"

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          {!isLoadingPlanDetails && !isTeamOrEnterprise && (
            <NotTeamOrEnterpriseWarning />
          )}
          {isLoading && <div className="w-full loading-spinner" />}
          {!isLoading && !isOwner && <NotAdminAlert />}
          {!isLoading && isOwner && <OrgSteps runInit={runInit} />}
        </DrawerContent>
        <DrawerSidebar page="classes" selected="assignments" />
      </Drawer>
    </div>
  )
}

export default OrgSetupPage
