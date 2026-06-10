import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import type { Classroom50OrgSummary } from "@/hooks/github/queries"
import useGetOrgs from "@/hooks/useGetOrgs"
import { useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  ExternalLink,
  Info,
  Lock,
  RefreshCw,
} from "lucide-react"

function MissingOrgNotice() {
  const queryClient = useQueryClient()

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
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["orgs"] })
              }
            >
              <RefreshCw className="size-4" />
              Refresh list
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
  const hasCollectToken = classroom50.collectToken?.status === "present"

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

              {!needsSetup && !hasCollectToken && (
                <span className="badge badge-warning gap-1">
                  <AlertTriangle className="size-3" />
                  Needs personal access token
                </span>
              )}

              {noAccess && (
                <span className="badge badge-neutral gap-1">
                  <Lock className="size-3" />
                  No Classroom50 access
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="card-actions mt-5 justify-end">
          {isReady && hasCollectToken && (
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

          {!needsSetup && !hasCollectToken && (
            <Link
              to="/$org/settings"
              params={{ org: org.login }}
              className="btn btn-warning btn-sm"
            >
              Complete Setup
            </Link>
          )}

          {noAccess && (
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
  const { data: orgs = [] } = useGetOrgs()

  const cl50Orgs = orgs?.filter(
    (summary) =>
      summary.classroom50.status !== "unknown" &&
      summary.classroom50.status !== "no_access" &&
      summary.classroom50.status !== "needs_setup" &&
      summary.membership.role === "admin",
  )
  const nonCl50Orgs = orgs?.filter(
    (summary) =>
      summary.classroom50.status === "unknown" ||
      summary.classroom50.status === "no_access" ||
      summary.classroom50.status === "needs_setup" ||
      summary.membership.role !== "admin",
  )

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <div className="mb-8">
            <div className="flex flex-col gap-6 p-6 sm:items-center sm:justify-between">
              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    Classroom 50 Organizations
                  </h1>
                </div>
                <MissingOrgNotice />
                <div className="grid grid-cols-12 gap-4 mt-6">
                  {cl50Orgs?.map((summary) => (
                    <OrgCard
                      key={summary.org.id}
                      summary={summary}
                      noRole={false}
                    />
                  ))}
                </div>
              </div>
              {nonCl50Orgs.length ? <div className="divider" /> : <></>}
              {nonCl50Orgs.length ? (
                <div className="space-y-4 w-full">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                      Set Up New Classroom 50 Organization
                    </h1>
                  </div>
                  <div className="grid grid-cols-12 gap-4 mt-6">
                    {nonCl50Orgs?.map((summary) => (
                      <OrgCard key={summary.org.id} summary={summary} noRole />
                    ))}
                  </div>
                </div>
              ) : (
                <></>
              )}
            </div>
          </div>
        </DrawerContent>
        <DrawerSidebar page="orgs" />
      </Drawer>
    </div>
  )
}

export default OrgsPage
