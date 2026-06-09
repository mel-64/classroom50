import { useParams } from "@tanstack/react-router"

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

const INIT_STEP_ORDER: InitStepId[] = [
  "orgDefaults",
  "orgActions",
  "configRepo",
  "skeleton",
  "branchProtection",
  "workflowPermissions",
  "reusableWorkflowAccess",
  "pages",
  "collectToken",
]
const OrgSteps = ({ steps, mutation }) => {
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

        <div className="card-actions justify-end">
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
  collectToken: {
    id: "collectToken",
    status: "pending",
    title: "Collect token",
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
            <OrgSteps steps={steps} mutation={mutation} />
          )}
        </DrawerContent>
        <DrawerSidebar page="classes" selected="assignments" />
      </Drawer>
    </div>
  )
}

export default OrgSetupPage
