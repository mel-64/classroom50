import { describe, expect, it } from "vitest"

import { buildOrgAuditReport } from "./audit"
import { memberDefaultSettings } from "./desiredState"
import { GitHubAPIError } from "@/hooks/github/errors"
import {
  RULESET_NAME_FEEDBACK_BASE,
  RULESET_NAME_SUBMISSION_HISTORY,
} from "@/hooks/github/rulesets"
import type { GitHubClient } from "@/hooks/github/client"

// The audit assembles checkOrgDefaults + the per-concern checks into an
// OK/WARN/FAIL verdict mirroring the CLI: read failure or critical drift fails;
// non-critical drift warns; all enforced is ok; the 4 manual items never fail.

function httpError(status: number): GitHubAPIError {
  return new GitHubAPIError({
    status,
    url: "x",
    message: `status ${status}`,
    body: null,
    rateLimit: {
      limit: null,
      remaining: null,
      used: null,
      reset: null,
      resource: null,
      retryAfter: null,
    },
  })
}

type Routes = {
  orgDefaults?: Record<string, unknown> | GitHubAPIError
}

// A fully-enforced fake org: every check returns its desired value, both
// rulesets present. Overrides let a test drift one concern.
function makeClient(overrides: Routes = {}): GitHubClient {
  const enforcedDefaults: Record<string, unknown> = {}
  for (const s of memberDefaultSettings("team")) {
    enforcedDefaults[s.field] = s.value
  }

  return {
    request: <T>(path: string) => {
      const reject = (e: GitHubAPIError) => Promise.reject(e) as Promise<T>
      const ok = (v: unknown) => Promise.resolve(v as T)

      if (path === "/orgs/acme") {
        if (overrides.orgDefaults instanceof GitHubAPIError)
          return reject(overrides.orgDefaults)
        return ok(overrides.orgDefaults ?? enforcedDefaults)
      }
      if (path.endsWith("/actions/permissions"))
        return ok({ enabled_repositories: "all", allowed_actions: "all" })
      if (path.endsWith("/actions/permissions/workflow"))
        return ok({
          default_workflow_permissions: "write",
          can_approve_pull_request_reviews: true,
        })
      if (path.includes("/protection"))
        return ok({
          allow_force_pushes: { enabled: false },
          allow_deletions: { enabled: false },
        })
      if (path.includes("/permissions/access"))
        return ok({ access_level: "organization" })
      if (path.includes("/pages")) return ok({ build_type: "workflow", public: true })
      if (path.includes("/rulesets"))
        return ok([
          { id: 1, name: RULESET_NAME_SUBMISSION_HISTORY },
          { id: 2, name: RULESET_NAME_FEEDBACK_BASE },
        ])
      return Promise.reject(new Error(`unexpected: ${path}`)) as Promise<T>
    },
    requestRaw: () => Promise.reject(new Error("unexpected requestRaw")),
  }
}

function driftedDefaults(
  mutate: (live: Record<string, unknown>) => void,
): Record<string, unknown> {
  const live: Record<string, unknown> = {}
  for (const s of memberDefaultSettings("team")) live[s.field] = s.value
  mutate(live)
  return live
}

describe("buildOrgAuditReport", () => {
  it("verdict ok when everything is enforced", async () => {
    const report = await buildOrgAuditReport(makeClient(), "acme", "team")
    expect(report.verdict).toBe("ok")
    expect(report.readOk).toBe(true)
    expect(report.lockdownComplete).toBe(true)
    expect(report.unenforcedDefaults).toHaveLength(0)
    expect(report.manualUnreadable).toHaveLength(4)
  })

  it("verdict fail when a critical member-default drifts", async () => {
    const report = await buildOrgAuditReport(
      makeClient({
        orgDefaults: driftedDefaults((live) => {
          live.members_can_delete_repositories = true
        }),
      }),
      "acme",
      "team",
    )
    expect(report.verdict).toBe("fail")
    expect(report.lockdownComplete).toBe(false)
    expect(report.unenforcedDefaults.map((s) => s.field)).toContain(
      "members_can_delete_repositories",
    )
  })

  it("verdict warn when only a non-critical default drifts", async () => {
    const report = await buildOrgAuditReport(
      makeClient({
        orgDefaults: driftedDefaults((live) => {
          live.members_can_create_pages = false
        }),
      }),
      "acme",
      "team",
    )
    expect(report.verdict).toBe("warn")
    expect(report.lockdownComplete).toBe(true)
  })

  it("verdict fail and readOk false when the org cannot be read", async () => {
    const report = await buildOrgAuditReport(
      makeClient({ orgDefaults: httpError(500) }),
      "acme",
      "team",
    )
    expect(report.verdict).toBe("fail")
    expect(report.readOk).toBe(false)
    expect(report.unenforcedDefaults).toHaveLength(0)
  })

  it("always lists the four manual steps regardless of verdict", async () => {
    const report = await buildOrgAuditReport(
      makeClient({ orgDefaults: httpError(500) }),
      "acme",
      "team",
    )
    expect(report.manualUnreadable).toHaveLength(4)
  })
})
