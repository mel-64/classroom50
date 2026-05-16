import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import App from '@/App'

const queryClient = new QueryClient()

const RootComponent = () => {
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    </>
  )
}

export const Route = createRootRoute({
  component: RootComponent
})

