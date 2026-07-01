import { Link, useParams } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react"
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
import { OrgSettingsPane } from "./OrgSettingsPage"
import { EnterDiv } from "@/lib/motionComponents"
import {
  SkeletonOverwriteModal,
  useSkeletonOverwriteConfirm,
} from "./orgSettings/skeletonOverwriteUi"
import {
  InitStepBoard,
  applyStepUpdate,
  initialInitSteps,
} from "./orgSettings/initStepBoard"

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
            {stage === 1 &&
              (!nextStep ? (
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
                <button
                  className="btn btn-primary ml-auto"
                  onClick={() => setStage(2)}
                >
                  Next: service token
                  <ArrowRight className="size-4" />
                </button>
              ))}
            {stage === 2 && (
              <button className="btn btn-ghost" onClick={() => setStage(1)}>
                <ArrowLeft className="size-4" />
                Back
              </button>
            )}
          </div>
        </div>

        {stage === 1 ? (
          <div className="grid gap-4">
            {nextStep && (
              <EnterDiv className="alert alert-success">
                <CheckCircle2 className="size-5 shrink-0" />
                <div>
                  Organization setup is complete. Review the steps below, then
                  continue to set the service token.
                </div>
              </EnterDiv>
            )}
            <InitStepBoard steps={steps} org={org} />
          </div>
        ) : stage === 2 ? (
          <div className="px-20">
            <OrgSettingsPane onSubmit={() => setStage(3)} />
          </div>
        ) : (
          <EnterDiv className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="size-9" />
            </div>
            <div>
              <h2 className="text-xl font-bold">You're all set!</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-base-content/60">
                Your organization is ready to use Classroom 50. Head to your
                organization to create your first classroom and assignments.
              </p>
            </div>
            <Link className="btn btn-primary" to="/$org" params={{ org }}>
              <span className="truncate">
                Go to {org || "your organization"}
              </span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          </EnterDiv>
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

const OrgSetupPage = () => {
  const queryClient = useQueryClient()
  const githubClient = useGitHubClient()

  const { org } = useParams({ strict: false })
  const [steps, setSteps] =
    useState<Record<InitStepId, InitStepUpdate>>(initialInitSteps)
  const { data: orgMembership, isLoading } = useGetOrgMembership(org)
  const { data: orgPlanDetails, isLoading: isLoadingPlanDetails } =
    useGetOrgPlanDetails(org)
  const [nextStep, setNextStep] = useState(false)

  // 1 = init classroom50 repo etc
  // 2 = PAT
  // 3 = finished
  const [currentStage, setCurrentStage] = useState(1)

  // Skeleton-overwrite confirmation, mirroring RerunOnboarding. The wizard
  // usually runs on a fresh repo (nothing pre-exists), but the /setup route has
  // no re-entry guard, so a re-run on an already-set-up org can hit drifted,
  // hand-edited skeleton files — prompt before overwriting those rather than
  // clobbering them silently.
  const { overwritePaths, resolveOverwrite, confirmSkeletonOverwrite } =
    useSkeletonOverwriteConfirm()

  const mutation = useMutation({
    mutationFn: async () => {
      if (!org) {
        return
      }
      return initClassroom50({
        client: githubClient,
        org,
        plan: orgPlanDetails?.plan?.name,
        onStepUpdate: (update) => {
          setSteps((steps) => applyStepUpdate(steps, update))
        },
        confirmSkeletonOverwrite,
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
      // Stay on step 1 after setup so the teacher can review per-step results;
      // they advance with the explicit "Next" button.
      setNextStep(true)
    },
  })

  const isOwner = orgMembership?.role === "admin"
  const isTeamOrEnterprise =
    orgPlanDetails?.plan?.name === "team" ||
    orgPlanDetails?.plan?.name === "enterprise"

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

          <SkeletonOverwriteModal
            paths={overwritePaths}
            onConfirm={() => resolveOverwrite(true)}
            onClose={() => resolveOverwrite(false)}
          />
        </DrawerContent>
        <DrawerSidebar page="classes" selected="assignments" />
      </Drawer>
    </div>
  )
}

export default OrgSetupPage
