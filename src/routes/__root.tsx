import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import type { RouterContext } from "@/types/router"

const RootComponent = () => {
  return (
    <>
      <Outlet />
    </>
  )
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})
