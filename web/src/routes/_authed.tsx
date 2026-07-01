import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { ScopeWarningBanner } from "@/auth/ScopeWarningBanner"

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    const { auth } = context
    if (auth.status === "unauthenticated") {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      })
    }
  },

  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <>
      <ScopeWarningBanner />
      <Outlet />
    </>
  )
}
