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
  type DefaultVerdict,
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
  // The GitHub settings page where a teacher can inspect/fix this concern.
  settingsUrl: string
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
  // The full member-default lockdown we configure, each with whether the live
  // org value currently matches — so teachers can see every permission we set,
  // not just the drifted ones. Empty when the org couldn't be read.
  defaultVerdicts: DefaultVerdict[]
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

// The GitHub settings page each concern maps to, so a teacher can jump
// straight to where they'd inspect or fix it. Org-level concerns point at the
// org settings; repo-level concerns point at the classroom50 config repo.
function concernSettingsUrl(id: ConcernId, org: string): string {
  const orgBase = `https://github.com/organizations/${org}/settings`
  const repoBase = `https://github.com/${org}/classroom50/settings`
  switch (id) {
    case "orgDefaults":
      return `${orgBase}/member_privileges`
    case "orgActions":
    case "orgPrCreation":
      return `${orgBase}/actions`
    case "rulesets":
      return `${orgBase}/rules`
    case "branchProtection":
      return `${repoBase}/branches`
    case "reusableWorkflowAccess":
    case "workflowPermissions":
      return `${repoBase}/actions`
    case "pages":
      return `${repoBase}/pages`
  }
}

// In the GUI, any drift demands attention: a drifted concern or an unenforced
// member-default (critical or not) fails the audit. This is intentionally
// stricter than the CLI's three-state model (which warns on non-critical
// drift) — the web treats every regression as actionable.
function deriveVerdict(
  readOk: boolean,
  lockdownComplete: boolean,
  concerns: ConcernCheck[],
): AuditVerdict {
  if (!readOk) return "fail"
  if (!lockdownComplete) return "fail"
  const anyDrift = concerns.some((c) => c.verdict.state === "unenforced")
  return anyDrift ? "fail" : "ok"
}

export async function buildOrgAuditReport(
  client: GitHubClient,
  org: string,
  plan: string | undefined,
): Promise<OrgAuditReport> {
  const defaults = await checkOrgDefaults(client, org, plan)
  const readOk = defaults.verdict.state !== "unreadable"
  const unenforcedDefaults =
    defaults.classification?.verdicts
      .filter((v) => !v.enforced)
      .map((v) => v.setting) ?? []
  const defaultVerdicts = defaults.classification?.verdicts ?? []
  // Any unenforced member-default (not just critical) counts as incomplete —
  // the GUI treats all drift as actionable.
  const lockdownComplete = readOk && unenforcedDefaults.length === 0

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

  const concerns: ConcernCheck[] = (
    [
      { id: "orgDefaults", verdict: defaults.verdict },
      { id: "orgActions", verdict: actions },
      { id: "orgPrCreation", verdict: prCreation },
      { id: "branchProtection", verdict: branchProtection },
      { id: "reusableWorkflowAccess", verdict: reusableAccess },
      { id: "pages", verdict: pages },
      { id: "rulesets", verdict: rulesets },
    ] as const
  ).map(({ id, verdict }) => ({
    id,
    title: CONCERN_TITLES[id],
    verdict,
    settingsUrl: concernSettingsUrl(id, org),
  }))
  // Sort the audit list alphabetically by title for predictable scanning.
  concerns.sort((a, b) => a.title.localeCompare(b.title))

  return {
    org,
    plan,
    verdict: deriveVerdict(readOk, lockdownComplete, concerns),
    readOk,
    lockdownComplete,
    unenforcedDefaults,
    defaultVerdicts,
    concerns,
    manualUnreadable: manualHardeningSteps(org),
    settingsUrl: `https://github.com/organizations/${org}/settings/member_privileges`,
  }
}
