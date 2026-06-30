import { createFileRoute } from "@tanstack/react-router"
import OnboardingPage from "@/pages/OnboardingPage"
import { isValidInviteToken } from "@/util/onboarding"

// `email`: untrusted prefill; seeds the claimed-email field only, session
// authorizes. Non-string degrades to no prefill.
//
// `t`: optional secure-link invite token (reconcile's strongest match key).
// Declared here so the validated search type matches what OnboardingPage reads;
// otherwise a future strict-search change could silently drop the token. A
// garbage value degrades to the classroom-wide flow (github_id, else email).
export const Route = createFileRoute("/_authed/$org/$classroom/onboard/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { email?: string; t?: string } => ({
    email: typeof search.email === "string" ? search.email : undefined,
    t:
      typeof search.t === "string" && isValidInviteToken(search.t)
        ? search.t
        : undefined,
  }),
  component: OnboardingPage,
})
