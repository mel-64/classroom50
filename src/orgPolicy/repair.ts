// Per-concern repair dispatcher for the org policy audit. Maps each audit
// ConcernId to the callable mutation that restores its required setting, so the
// settings page can offer a per-concern "Fix it" button. This lives in its own
// module (not orgChecks.ts) to avoid an import cycle: mutations.ts already
// imports orgChecks.ts for repairOrgDefaults.

import type { GitHubClient } from "@/hooks/github/client"
import {
  ensureBranchProtection,
  ensureOrgActionsEnabled,
  ensureOrgCanCreatePullRequests,
  ensurePages,
  ensureReusableWorkflowAccess,
  ensureWorkflowPermissions,
} from "@/hooks/github/mutations"
import { repairOrgDefaults } from "@/hooks/github/orgChecks"
import { repairRulesets } from "@/hooks/github/rulesets"
import type { ConcernId } from "./audit"

// Whether a concern can be repaired by an API call. The four manual-only
// member-privilege settings have no API and are excluded by design; every
// audit concern here is API-repairable.
export const REPAIRABLE_CONCERNS: ReadonlySet<ConcernId> = new Set<ConcernId>([
  "orgDefaults",
  "orgActions",
  "orgPrCreation",
  "branchProtection",
  "workflowPermissions",
  "reusableWorkflowAccess",
  "pages",
  "rulesets",
])

// Result of a repair attempt. `unfixableFields` lists member-default fields
// that were written but did not stick on read-back — i.e. silently overridden
// by an enterprise-level policy (GitHub returns 200 but ignores the change).
// Only populated for the orgDefaults concern.
export type RepairResult = {
  unfixableFields: string[]
}

// Restore a single concern's required setting. Plan is needed for orgDefaults
// (the member-default lockdown is plan-filtered); ignored by the others.
export async function repairConcern(
  client: GitHubClient,
  org: string,
  id: ConcernId,
  plan: string | undefined,
): Promise<RepairResult> {
  switch (id) {
    case "orgDefaults": {
      const result = await repairOrgDefaults(client, org, plan)
      return { unfixableFields: result.unenforced.map((s) => s.field) }
    }
    case "orgActions":
      await ensureOrgActionsEnabled(client, org)
      return { unfixableFields: [] }
    case "orgPrCreation":
      await ensureOrgCanCreatePullRequests(client, org)
      return { unfixableFields: [] }
    case "branchProtection":
      await ensureBranchProtection(client, org, "classroom50", "main")
      return { unfixableFields: [] }
    case "workflowPermissions":
      await ensureWorkflowPermissions(client, org, "classroom50")
      return { unfixableFields: [] }
    case "reusableWorkflowAccess":
      await ensureReusableWorkflowAccess(client, org, "classroom50")
      return { unfixableFields: [] }
    case "pages":
      await ensurePages(client, org, "classroom50")
      return { unfixableFields: [] }
    case "rulesets":
      await repairRulesets(client, org)
      return { unfixableFields: [] }
  }
}
