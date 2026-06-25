import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import type { RouterContext } from "@/types/router"
import { TriangleAlert } from "lucide-react"

const RootComponent = () => {
  return (
    <>
      <Outlet />
    </>
  )
}

// App-wide safety net: any uncaught render error in a route subtree (e.g. a
// malformed external payload reaching a component) degrades to this screen
// instead of a blank white page.
const RootErrorComponent = ({ error }: { error: Error }) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-error/10 text-error">
        <TriangleAlert className="size-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-1 max-w-md text-base-content/60">
          {error?.message || "An unexpected error occurred."}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </div>
  )
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  errorComponent: RootErrorComponent,
})
