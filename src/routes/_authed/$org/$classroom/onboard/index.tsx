import { createFileRoute } from "@tanstack/react-router"
import OnboardingPage from "@/pages/OnboardingPage"
import { isValidInviteToken } from "@/util/onboarding"

// `email` is the invited address, carried in the onboarding link the teacher
// shares. It is an UNTRUSTED prefill: it seeds the deterministic onboarding
// repo name and the claimed-email field, but the authenticated session is what
// authorizes everything. A non-string value degrades to no prefill.
//
// `t` is the optional secure-link invite token (the secure-link flow). It must
// be declared here so the validated search type matches what OnboardingPage
// reads — otherwise the page relies on TanStack's loose passthrough and a
// future strict-search change would silently drop the token and degrade the
// secure-link flow to the guessable email-hash name. A garbage value degrades
// to the classroom-wide flow.
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
