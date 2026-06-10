import { Link, useParams } from "@tanstack/react-router"

import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import useGetOrgMembership from "@/hooks/useGetOrgMembership"
import useGetOrgPlanDetails from "@/hooks/useGetOrgPlanDetails"
import { useState } from "react"
import {
  initClassroom50,
  type InitStepId,
  type InitStepUpdate,
} from "@/hooks/github/mutations"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useGitHubClient } from "@/context/github/GitHubProvider"
import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react"

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
          : "badge-neutral badge-ghost"

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-base-300 bg-base-100 p-4">
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm text-base-content/70">
          {message || description}
        </p>
      </div>
      <span className={`badge ${badgeClass}`}>
        {status === "complete" ? <CheckCircle className="size-4" /> : <></>}
        {status === "pending" ? "" : <></>}
        {status === "warning" ? <AlertCircle className="size-4" /> : <></>}
        {status === "running" ? (
          <span className="loading loading-spinner size-4" />
        ) : (
          <></>
        )}
        {status === "error" ? <AlertTriangle className="size-4" /> : <></>}
      </span>
    </div>
  )
}

const INIT_STEP_ORDER: InitStepId[] = [
  "orgDefaults",
  "orgActions",
  "configRepo",
  "skeleton",
  "branchProtection",
  "workflowPermissions",
  "reusableWorkflowAccess",
  "pages",
]
const OrgSteps = ({ steps, mutation, nextStep = false, org = "" }) => {
  return (
    <div className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-5">
        <div className="flex justify-between">
          <div>
            <h2 className="card-title">Setup Classroom 50</h2>
            <p className="text-sm text-base-content/70">
              This will set up your GitHub organization to use Classroom 50.
            </p>
          </div>
          <div className="card-actions justify-end">
            {!nextStep ? (
              <button
                disabled={mutation.isPending}
                className="btn btn-primary"
                onClick={mutation.mutateAsync}
              >
                {mutation.isPending ? (
                  <span className="loading loading-spinner" />
                ) : (
                  "Run setup"
                )}
              </button>
            ) : (
              <Link className="btn btn-primary" to={`/${org}/settings`}>
                Next
              </Link>
            )}
          </div>
        </div>

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
    <div className="alert alert-warning mb-4">
      GitHub Pages from a private repository may require GitHub Team or
      Enterprise Cloud. You can continue setup, but published assignments may
      not be accessible until Pages is available for this org.
    </div>
  )
}

const initialSteps: Record<InitStepId, InitStepUpdate> = {
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
  configRepo: {
    id: "configRepo",
    status: "pending",
    title: "Config repository",
  },
  skeleton: {
    id: "skeleton",
    status: "pending",
    title: "Skeleton files",
  },
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
  pages: {
    id: "pages",
    status: "pending",
    title: "GitHub Pages",
  },
}

function applyStepUpdate(
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

const OrgSetupPage = () => {
  const queryClient = useQueryClient()
  const githubClient = useGitHubClient()

  const { org } = useParams({ strict: false })
  const [steps, setSteps] =
    useState<Record<InitStepId, InitStepUpdate>>(initialSteps)
  const { data: orgMembership, isLoading } = useGetOrgMembership(org)
  const { data: orgPlanDetails, isLoading: isLoadingPlanDetails } =
    useGetOrgPlanDetails(org)
  const [nextStep, setNextStep] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      console.log("triggering mutation")
      if (!org) {
        console.log("org missing", org)
        return
      }
      return initClassroom50({
        client: githubClient,
        org,
        collectToken: "",
        serviceAccountConfirmed: false,
        onStepUpdate: (update) => {
          setSteps((steps) => applyStepUpdate(steps, update))
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["orgs"],
      })
      setNextStep(true)
    },
  })

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
          {!isLoading && isOwner && (
            <OrgSteps
              steps={steps}
              mutation={mutation}
              nextStep={nextStep}
              org={org}
            />
          )}
        </DrawerContent>
        <DrawerSidebar page="classes" selected="assignments" />
      </Drawer>
    </div>
  )
}

export default OrgSetupPage
