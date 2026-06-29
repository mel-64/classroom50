import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import type { Classroom50OrgSummary } from "@/hooks/github/queries"
import useGetOrgs from "@/hooks/useGetOrgs"
import useGetOrgAudit from "@/hooks/useGetOrgAudit"
import useGetOrgPlanDetails from "@/hooks/useGetOrgPlanDetails"
import { useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  ExternalLink,
  Info,
  Lock,
  RefreshCw,
  XCircle,
} from "lucide-react"

// Lazily audits a ready org (admin only) and flags policy drift. A "ready" org
// can still have regressed branch protection / member policy / rulesets; this
// surfaces that on the card without changing the coarse ready status. Failure
// to audit is silent — the badge just doesn't render.
function DriftBadge({ org }: { org: string }) {
  const { data: planDetails } = useGetOrgPlanDetails(org)
  const { data: report } = useGetOrgAudit(org, planDetails?.plan.name)

  if (!report || report.verdict === "ok") return null

  const isFail = report.verdict === "fail"
  return (
    <span
      className={`badge gap-1 text-xs ${isFail ? "badge-error" : "badge-warning"}`}
    >
      {isFail ? (
        <XCircle className="size-3" />
      ) : (
        <AlertTriangle className="size-3" />
      )}
      {isFail ? "Policy incomplete" : "Policy drift"}
    </span>
  )
}

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
          <Info className="size-5" />
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
              <ExternalLink className="size-4" />
            </a>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw
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
  noRole = false,
}: {
  summary: Classroom50OrgSummary
  noRole: boolean
}) {
  const { org, membership, classroom50 } = summary

  const isReady = classroom50.status === "ready"
  const needsSetup = classroom50.status === "needs_setup"
  const noAccess = classroom50.status === "no_access"
  const hasServiceToken = classroom50.serviceToken?.status === "present"
  const isAdmin = membership.role === "admin"
  const isActiveMember = membership.state === "active"

  // A student is an active member who can't read the classroom50 config repo
  // (hence no_access). That's the normal student state, not a dead end: they
  // can still open the org to reach their own assignment repos. Only a teacher
  // (admin) needs the config repo + service token wired up before "Open".
  const canOpen = isAdmin ? isReady && hasServiceToken : isActiveMember

  return (
    <div className="card bg-base-100 rounded-xl col-span-6 border border-[#eee]">
      <div className="card-body justify-between">
        <div className="flex gap-4">
          <img
            src={org.avatar_url}
            alt=""
            className="size-12 rounded-xl border border-base-300"
          />

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{org.login}</h2>

            <p className="mt-1 line-clamp-2 text-sm text-base-content/70">
              {org.description || ""}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {!noRole && (
                <span className="badge badge-outline">
                  {membership.role === "admin" ? "Teacher" : "Student"}
                </span>
              )}

              {!needsSetup && !hasServiceToken && isAdmin && (
                <span className="badge badge-warning gap-1 text-xs">
                  <AlertTriangle className="size-3" />
                  Needs service token
                </span>
              )}

              {isReady && isAdmin && <DriftBadge org={org.login} />}

              {noAccess && isAdmin && (
                <span className="badge badge-neutral gap-1">
                  <Lock className="size-3" />
                  No <pre>classroom50</pre> access
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="card-actions mt-5 justify-end">
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

          {!needsSetup && !hasServiceToken && isAdmin && (
            <Link
              to="/$org/settings"
              params={{ org: org.login }}
              className="btn btn-warning btn-sm"
            >
              Complete Setup
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
  )
}

const OrgsPage = () => {
  const queryClient = useQueryClient()
  const { data: orgs = [], isLoading, isFetching } = useGetOrgs()

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

  const handleRefresh = () =>
    queryClient.invalidateQueries({ queryKey: ["orgs"] })

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          {isLoading ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
              <span className="loading loading-spinner loading-lg text-primary" />
              <div>
                <p className="text-base font-semibold">
                  Loading your organizations…
                </p>
                <p className="mt-1 text-sm text-base-content/60">
                  This may take a moment.
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-8">
              <div className="flex flex-col gap-6 p-6 sm:items-center sm:justify-between">
                <div className="space-y-4">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                      Classroom 50 Organizations
                    </h1>
                  </div>
                  <MissingOrgNotice
                    refreshing={isFetching}
                    onRefresh={handleRefresh}
                  />
                  <div className="grid grid-cols-12 gap-4 mt-6">
                    {cl50Orgs?.map((summary) => (
                      <OrgCard
                        key={summary.org.id}
                        summary={summary}
                        noRole={false}
                      />
                    ))}
                  </div>
                  {cl50Orgs?.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 p-8 text-center">
                      <h2 className="text-lg font-semibold">
                        No Classroom 50 organizations yet
                      </h2>
                      <p className="mx-auto mt-1 max-w-md text-sm text-base-content/60">
                        Organizations you belong to that use Classroom 50 will
                        appear here. If you expect one, ask your instructor to
                        confirm you've been added, then refresh.
                      </p>
                    </div>
                  )}
                </div>
                {nonCl50Orgs.length > 0 && <div className="divider" />}
                {nonCl50Orgs.length > 0 && (
                  <div className="space-y-4 w-full">
                    <div>
                      <h1 className="text-2xl font-bold tracking-tight">
                        Set Up New Classroom 50 Organization
                      </h1>
                    </div>
                    <div className="grid grid-cols-12 gap-4 mt-6">
                      {nonCl50Orgs?.map((summary) => (
                        <OrgCard
                          key={summary.org.id}
                          summary={summary}
                          noRole
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
