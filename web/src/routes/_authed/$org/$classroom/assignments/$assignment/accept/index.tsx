import { createFileRoute } from "@tanstack/react-router"
import AcceptAssignmentPage from "@/pages/AcceptAssignmentPage"
import { isValidSecret } from "@/util/secret"

// `k` is the optional capability-URL access key for a classroom with
// protected resources. It travels in the accept link the teacher shares
// (the URL is the credential) rather than being read from the private
// config repo, which students can't access. Validated against the secret
// pattern here so a garbled key degrades to a plain (unprotected) accept
// instead of being persisted into .classroom50.yaml and a fetch URL.
export const Route = createFileRoute(
  "/_authed/$org/$classroom/assignments/$assignment/accept/",
)({
  validateSearch: (search: Record<string, unknown>): { k?: string } => ({
    k:
      typeof search.k === "string" && isValidSecret(search.k)
        ? search.k
        : undefined,
  }),
  component: AcceptAssignmentPage,
})
