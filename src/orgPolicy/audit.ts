// Read-only org audit — the web mirror of the CLI's buildAuditReport +
// OK/WARN/FAIL switch (classroom50-cli internal/audit/audit.go). Assembles the
// member-default classification (via checkOrgDefaults) plus the per-concern
// check verdicts into a single report. Verdict semantics match the CLI:
// read failure or critical drift => fail; complete but non-critical drift =>
// warn; everything enforced => ok. Unreadable manual items never fail.

import type { GitHubClient } from "@/hooks/github/client"
import {
  checkBranchProtection,
  checkOrgActions,
  checkOrgDefaults,
  checkOrgPrCreation,
  checkPages,
  checkReusableWorkflowAccess,
  type CheckVerdict,
} from "@/hooks/github/orgChecks"
import { checkRulesets } from "@/hooks/github/rulesets"
import {
  manualHardeningSteps,
  type ManualStep,
  type MemberDefaultSetting,
} from "./desiredState"

export type AuditVerdict = "ok" | "warn" | "fail"

export type ConcernId =
  | "orgDefaults"
  | "orgActions"
  | "orgPrCreation"
  | "branchProtection"
  | "workflowPermissions"
  | "reusableWorkflowAccess"
  | "pages"
  | "rulesets"

export type ConcernCheck = {
  id: ConcernId
  title: string
  verdict: CheckVerdict
}

export type OrgAuditReport = {
  org: string
  plan: string | undefined
  verdict: AuditVerdict
  // readOk is false when GET /orgs/{org} itself failed — the member-default
  // audit is inconclusive (distinct from "read fine, all enforced").
  readOk: boolean
  // lockdownComplete mirrors the CLI: no critical member-default is unenforced.
  lockdownComplete: boolean
  // Per-field member-default drift, each carrying its manualFix.
  unenforcedDefaults: MemberDefaultSetting[]
  // Per-concern check verdicts (Actions, Pages, rulesets, …).
  concerns: ConcernCheck[]
  // The four API-less settings the teacher confirms by hand; never fail.
  manualUnreadable: ManualStep[]
  settingsUrl: string
}

const CONCERN_TITLES: Record<ConcernId, string> = {
  orgDefaults: "Member-privilege lockdown",
  orgActions: "Actions permissions",
  orgPrCreation: "Actions pull request creation",
  branchProtection: "Branch protection",
  workflowPermissions: "Workflow permissions",
  reusableWorkflowAccess: "Reusable workflow access",
  pages: "GitHub Pages",
  rulesets: "Branch protection rulesets",
}

function deriveVerdict(
  readOk: boolean,
  lockdownComplete: boolean,
  concerns: ConcernCheck[],
): AuditVerdict {
  if (!readOk) return "fail"
  if (!lockdownComplete) return "fail"
  const anyDrift = concerns.some((c) => c.verdict.state === "unenforced")
  return anyDrift ? "warn" : "ok"
}

export async function buildOrgAuditReport(
  client: GitHubClient,
  org: string,
  plan: string | undefined,
): Promise<OrgAuditReport> {
  const defaults = await checkOrgDefaults(client, org, plan)
  const readOk = defaults.verdict.state !== "unreadable"
  const lockdownComplete =
    readOk && !(defaults.classification?.criticalMissed ?? true)
  const unenforcedDefaults =
    defaults.classification?.verdicts
      .filter((v) => !v.enforced)
      .map((v) => v.setting) ?? []

  // Per-concern checks run in parallel — they're independent reads.
  const [
    actions,
    prCreation,
    branchProtection,
    reusableAccess,
    pages,
    rulesets,
  ] = await Promise.all([
    checkOrgActions(client, org),
    checkOrgPrCreation(client, org),
    checkBranchProtection(client, org),
    checkReusableWorkflowAccess(client, org),
    checkPages(client, org),
    checkRulesets(client, org),
  ])

  const concerns: ConcernCheck[] = [
    {
      id: "orgDefaults",
      title: CONCERN_TITLES.orgDefaults,
      verdict: defaults.verdict,
    },
    { id: "orgActions", title: CONCERN_TITLES.orgActions, verdict: actions },
    {
      id: "orgPrCreation",
      title: CONCERN_TITLES.orgPrCreation,
      verdict: prCreation,
    },
    {
      id: "branchProtection",
      title: CONCERN_TITLES.branchProtection,
      verdict: branchProtection,
    },
    {
      id: "reusableWorkflowAccess",
      title: CONCERN_TITLES.reusableWorkflowAccess,
      verdict: reusableAccess,
    },
    { id: "pages", title: CONCERN_TITLES.pages, verdict: pages },
    { id: "rulesets", title: CONCERN_TITLES.rulesets, verdict: rulesets },
  ]

  return {
    org,
    plan,
    verdict: deriveVerdict(readOk, lockdownComplete, concerns),
    readOk,
    lockdownComplete,
    unenforcedDefaults,
    concerns,
    manualUnreadable: manualHardeningSteps(org),
    settingsUrl: `https://github.com/organizations/${org}/settings/member_privileges`,
  }
}
