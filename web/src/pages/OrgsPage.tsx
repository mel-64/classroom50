import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import type { Classroom50OrgSummary } from "@/hooks/github/queries"
import useGetOrgs from "@/hooks/useGetOrgs"
import useNeedsSetupPlans from "@/hooks/useNeedsSetupPlans"
import { useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ExternalLink, Info, Lock, RefreshCw } from "lucide-react"
import { motion } from "motion/react"
import { useMemo, useState } from "react"
import { GitHubLink } from "@/components/GitHubLink"
import PlanBadge from "@/components/PlanBadge"
import { enterExit, staggerTransition } from "@/lib/motion"
import { classifyPlan, planSortWeight } from "@/lib/orgPlan"

function MissingOrgNotice({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <div className="rounded-2xl border border-info/20 bg-info/5 p-5 shadow-sm">
      <div className="flex gap-4">
        <div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-info/10 text-info">
          <Info aria-hidden="true" className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-base-content">
                Not seeing your organization?
              </h2>

              <p className="mt-1 text-sm leading-6 text-base-content/70">
                Classroom 50 can only show GitHub organizations that you have
                explicitly granted access to during sign-in. If an organization
                is missing, you may need to update your OAuth permissions.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <a
              href="https://github.com/settings/connections/applications"
              target="_blank"
              rel="noreferrer"
              className="btn btn-info btn-sm"
            >
              Manage GitHub OAuth access
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw
                aria-hidden="true"
                className={["size-4", refreshing ? "animate-spin" : ""].join(
                  " ",
                )}
              />
              {refreshing ? "Refreshing…" : "Refresh list"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function OrgCard({
  summary,
  index = 0,
  planName,
}: {
  summary: Classroom50OrgSummary
  index?: number
  planName?: string
}) {
  const { org, membership, classroom50 } = summary

  const isReady = classroom50.status === "ready"
  const needsSetup = classroom50.status === "needs_setup"
  const noAccess = classroom50.status === "no_access"
  const isAdmin = membership.role === "admin"
  const isActiveMember = membership.state === "active"

  // Show a plan badge whenever GitHub actually returned a plan name (owners of
  // Team/Enterprise/Free orgs). Unknown (non-owner, no plan visible) stays
  // badge-less — there's nothing accurate to show.
  const showPlanBadge = classifyPlan(planName) !== "unknown"

  // No-access-as-admin is the only role-derived badge we keep: it's a concrete
  // "you can't read classroom50 here" state, not an inferred Teacher/Student
  // label (which is just GitHub org-admin status and misleads students).
  const showNoAccessBadge = noAccess && isAdmin

  // A student is an active member who can't read the classroom50 config repo
  // (hence no_access). That's the normal student state, not a dead end: they
  // can still open the org to reach their own assignment repos. A teacher
  // (admin) opens any ready org; the service-token / policy preflight runs
  // inside the org (ClassesPage), not here — checking every org in the list
  // would fan out far too many GitHub API calls.
  const canOpen = isAdmin ? isReady : isActiveMember

  return (
    <motion.div
      className="card bg-base-100 rounded-xl col-span-12 border border-base-300 md:col-span-6"
      variants={enterExit}
      initial="initial"
      animate="animate"
      transition={staggerTransition(index)}
    >
      <div className="card-body justify-between">
        <div className="flex gap-4">
          <img
            src={org.avatar_url}
            alt=""
            className="size-12 rounded-xl border border-base-300"
          />

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{org.login}</h2>

            {org.description && (
              <p className="mt-1 line-clamp-2 text-sm text-base-content/70">
                {org.description}
              </p>
            )}

            {showNoAccessBadge && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="badge badge-neutral gap-1">
                  <Lock aria-hidden="true" className="size-3" />
                  No <code>classroom50</code> access
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="card-actions mt-5 items-center justify-between">
          <div className="flex items-center gap-3">
            {showPlanBadge && (
              <PlanBadge
                name={planName}
                title={
                  classifyPlan(planName) === "free"
                    ? "Free plan — Classroom 50 needs a Team or Enterprise organization"
                    : "GitHub plan — Classroom 50 can be set up on Team and Enterprise plans"
                }
              />
            )}

            <GitHubLink
              href={`https://github.com/${org.login}`}
              label="View on GitHub"
              title={`Open ${org.login} on GitHub`}
              className="shrink-0"
              showLogo={false}
            />
          </div>

          <div className="flex items-center gap-2">
            {canOpen && (
              <Link
                to="/$org"
                params={{ org: org.login }}
                className="btn btn-primary btn-sm"
              >
                Open
              </Link>
            )}

            {needsSetup && (
              <Link
                to="/$org/setup"
                params={{ org: org.login }}
                className="btn btn-warning btn-sm"
              >
                Set Up
              </Link>
            )}

            {noAccess && !isActiveMember && (
              <button className="btn btn-disabled btn-sm">
                Ask a teacher for access
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

const OrgsPage = () => {
  useDocumentTitle("Organizations")
  const queryClient = useQueryClient()
  const { data: orgs = [], isLoading, isFetching } = useGetOrgs()
  const [showUnsupported, setShowUnsupported] = useState(false)

  // Orgs that are confirmed Classroom 50 orgs the user can use: a teacher's
  // ready org, or a student's enrolled org (no_access but the public Pages
  // index confirmed it).
  const cl50Orgs = orgs?.filter(
    (summary) =>
      summary.classroom50.status === "ready" ||
      summary.classroom50.status === "no_access",
  )
  // Orgs where the signed-in user is an admin who hasn't set up Classroom 50
  // yet — offered in the "Set Up" section. Unrelated orgs (not_classroom50)
  // and indeterminate ones (unknown) are filtered out entirely.
  const nonCl50Orgs = orgs?.filter(
    (summary) => summary.classroom50.status === "needs_setup",
  )

  // Plan is fetched only for the needs-setup subset (all admin-owned, so plan
  // is visible) to drive the badge, the eligible-first sort, and the free-org
  // filter — without paying the per-org fan-out on the whole list.
  const needsSetupLogins = useMemo(
    () => nonCl50Orgs.map((summary) => summary.org.login),
    [nonCl50Orgs],
  )
  const plans = useNeedsSetupPlans(needsSetupLogins)

  // Bubble Team/Enterprise (supported) orgs to the top, then unknown, then
  // free. Stable sort keeps GitHub's original order within each bucket.
  const sortedNonCl50Orgs = useMemo(
    () =>
      [...nonCl50Orgs].sort((a, b) => {
        const wa = planSortWeight(classifyPlan(plans[a.org.login]))
        const wb = planSortWeight(classifyPlan(plans[b.org.login]))
        return wa - wb
      }),
    [nonCl50Orgs, plans],
  )

  // Free-plan orgs can't be set up, so hide them by default. Unknown plan
  // (never happens for admins here, but guarded anyway) is always shown so a
  // usable org is never hidden.
  const visibleNonCl50Orgs = showUnsupported
    ? sortedNonCl50Orgs
    : sortedNonCl50Orgs.filter(
        (summary) => classifyPlan(plans[summary.org.login]) !== "free",
      )
  const hiddenFreeCount = sortedNonCl50Orgs.length - visibleNonCl50Orgs.length

  const handleRefresh = () =>
    queryClient.invalidateQueries({ queryKey: ["orgs"] })

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-base-200 2xl:px-50">
          {isLoading ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
              <span
                className="loading loading-spinner loading-lg text-primary"
                aria-hidden="true"
              />
              <div>
                <p className="text-base font-semibold">
                  Loading your organizations…
                </p>
                <p className="mt-1 text-sm text-base-content/70">
                  This may take a moment.
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-8">
              <div className="flex flex-col gap-6 p-6">
                <div className="w-full space-y-4">
                  <h1 className="text-2xl font-bold tracking-tight">
                    Classroom 50 Organizations
                  </h1>
                  <MissingOrgNotice
                    refreshing={isFetching}
                    onRefresh={handleRefresh}
                  />
                  <div className="grid grid-cols-12 gap-4">
                    {cl50Orgs?.map((summary, i) => (
                      <OrgCard
                        key={summary.org.id}
                        summary={summary}
                        index={i}
                      />
                    ))}
                  </div>
                  {cl50Orgs?.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 p-8 text-center">
                      <h2 className="text-lg font-semibold">
                        No Classroom 50 organizations yet
                      </h2>
                      <p className="mx-auto mt-1 max-w-md text-sm text-base-content/70">
                        Organizations you belong to that use Classroom 50 will
                        appear here. If you expect one, ask your instructor to
                        confirm you've been added, then refresh.
                      </p>
                    </div>
                  )}
                </div>
                {nonCl50Orgs.length > 0 && <div className="divider" />}
                {nonCl50Orgs.length > 0 && (
                  <div className="w-full space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h1 className="text-2xl font-bold tracking-tight">
                        Set Up New Classroom 50 Organization
                      </h1>
                      {(hiddenFreeCount > 0 || showUnsupported) && (
                        <label className="label cursor-pointer gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="toggle toggle-sm"
                            checked={showUnsupported}
                            onChange={(e) =>
                              setShowUnsupported(e.target.checked)
                            }
                            aria-label="Show unsupported organizations"
                          />
                          <span className="label-text">
                            Show unsupported organizations
                            {hiddenFreeCount > 0 && !showUnsupported && (
                              <span aria-hidden="true">
                                {" "}
                                ({hiddenFreeCount})
                              </span>
                            )}
                          </span>
                        </label>
                      )}
                    </div>
                    <div className="grid grid-cols-12 gap-4">
                      {visibleNonCl50Orgs.map((summary, i) => (
                        <OrgCard
                          key={summary.org.id}
                          summary={summary}
                          index={i}
                          planName={plans[summary.org.login]}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DrawerContent>
        <DrawerSidebar page="orgs" />
      </Drawer>
    </div>
  )
}

export default OrgsPage
