import { Link, useParams } from "@tanstack/react-router"
import { useSafeSubmit } from "@/hooks/useSafeSubmit"

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
import { OrgSettingsPane } from "./OrgSettingsPage"

const InitStep = ({
  title,
  description,
  status,
  message,
}: {
  title: string
  description?: string
  status: "pending" | "running" | "complete" | "warning" | "error" | "skipped"
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
  "orgPrCreation",
  "configRepo",
  "skeleton",
  "branchProtection",
  "workflowPermissions",
  "reusableWorkflowAccess",
  "pages",
]
const OrgSteps = ({
  steps,
  mutation,
  nextStep = false,
  org = "",
  stage = 1,
  setStage = () => {},
}: {
  steps: Record<InitStepId, InitStepUpdate>
  mutation: { isPending: boolean; mutateAsync: () => Promise<unknown> }
  nextStep?: boolean
  org?: string
  stage?: number
  setStage?: (num: number) => void
}) => {
  const runSetup = useSafeSubmit()
  return (
    <div className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <ul className="steps steps-horizontal col-start-2 justify-self-center">
            <li
              className={`step ${stage === 1 ? "step-info" : "step-success"}`}
            ></li>
            <li
              className={`step ${stage === 2 ? "step-info" : stage === 3 ? "step-success" : "[--step-bg: #eee]"}`}
            ></li>
            <li
              className={`step ${stage === 3 ? "step-primary" : "[--step-bg: #eee]"}`}
            ></li>
          </ul>
          <div className="card-actions col-start-3 justify-self-end">
            {!nextStep ? (
              <button
                disabled={mutation.isPending}
                className="btn btn-primary ml-auto"
                onClick={() => void runSetup(() => mutation.mutateAsync())}
              >
                {mutation.isPending ? (
                  <span className="loading loading-spinner" />
                ) : (
                  "Run setup"
                )}
              </button>
            ) : (
              <></>
            )}
          </div>
        </div>

        {stage === 1 ? (
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
        ) : stage === 2 ? (
          <div className="px-20">
            <OrgSettingsPane onSubmit={() => setStage(3)} />
          </div>
        ) : (
          <div className="alert alert-success">
            <div>
              You have finished setting up your organization for Classroom 50.
              Please click{" "}
              <Link className="underline" to="/$org" params={{ org }}>
                here
              </Link>{" "}
              to view your organization and its classrooms.
            </div>
          </div>
        )}
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

  // 1 = init classroom50 repo etc
  // 2 = PAT
  // 3 = finished
  const [currentStage, setCurrentStage] = useState(1)

  const mutation = useMutation({
    mutationFn: async () => {
      if (!org) {
        return
      }
      return initClassroom50({
        client: githubClient,
        org,
        plan: orgPlanDetails?.plan.name,
        serviceToken: "",
        serviceAccountConfirmed: false,
        onStepUpdate: (update) => {
          setSteps((steps) => applyStepUpdate(steps, update))
        },
      })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["orgs"],
      })
      // Don't advance the wizard if a prerequisite step failed; initClassroom50
      // resolves with status "error" rather than throwing.
      if (data && data.status === "error") {
        return
      }
      setNextStep(true)
      setCurrentStage(2)
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
          <div className="mb-8">
            <h1 className="font-bold text-2xl">Setup Classroom 50</h1>
            <p className="text-sm text-base-content/70">
              This will set up your GitHub organization to use Classroom 50.
            </p>
          </div>
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
              setStage={setCurrentStage}
              stage={currentStage}
            />
          )}
        </DrawerContent>
        <DrawerSidebar page="classes" selected="assignments" />
      </Drawer>
    </div>
  )
}

export default OrgSetupPage
