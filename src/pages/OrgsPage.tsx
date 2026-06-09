import Drawer, {
  DrawerContent,
  DrawerSidebar,
  DrawerToggle,
} from "@/components/drawer"
import type { Classroom50OrgSummary } from "@/hooks/github/queries"
import useGetOrgs from "@/hooks/useGetOrgs"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, Lock, ShieldCheck } from "lucide-react"

function OrgCard({ summary }: { summary: Classroom50OrgSummary }) {
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
              {org.description || "Description unavailable."}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="badge badge-outline">
                {membership.role === "admin" ? "Org owner" : "Org member"}
              </span>

              {isReady && (
                <span className="badge badge-success gap-1">
                  <ShieldCheck className="size-3" />
                  Ready
                </span>
              )}

              {needsSetup && (
                <span className="badge badge-warning gap-1">
                  <AlertTriangle className="size-3" />
                  Needs setup
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
          {isReady && (
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
              Initialize
            </Link>
          )}

          {!needsSetup && !hasCollectToken && (
            <Link
              to="/$org/settings"
              params={{ org: org.login }}
              className="btn btn-warning btn-sm"
            >
              Setup
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
  const { data: orgs } = useGetOrgs()

  return (
    <div className="min-h-screen">
      <Drawer>
        <DrawerToggle />
        <DrawerContent className="p-10 bg-[#fafafa] 2xl:px-50">
          <div className="mb-8">
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">My Orgs</h1>
                  <p className="mt-2 max-w-2xl text-sm text-base-content/60">
                    Set up Classroom 50 in an accessible org.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 mb-6">
            {orgs?.map((summary) => (
              <OrgCard key={summary.org.id} summary={summary} />
            ))}
          </div>
        </DrawerContent>
        <DrawerSidebar page="orgs" />
      </Drawer>
    </div>
  )
}

export default OrgsPage
