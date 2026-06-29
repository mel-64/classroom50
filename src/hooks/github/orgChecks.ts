// Read-only org/repo policy checks — the non-mutating half of the
// check*/repair* split (plan U2). The audit (useGetOrgAudit) and the
// centralized Org Settings page consume these to render drift verdicts
// without writing. Each check tolerates 404/403 with a verdict rather than
// throwing, so a single unreadable concern never breaks the whole audit.

import type { GitHubClient } from "./client"
import { GitHubAPIError } from "./errors"
import {
  classifyDefaults,
  memberDefaultSettings,
  type ClassifyResult,
  type MemberDefaultSetting,
} from "@/orgPolicy/desiredState"

export const CONFIG_REPO = "classroom50"

// A concern's read-only state: enforced means the live value already matches
// the desired policy; unenforced means it drifted; unreadable means the read
// itself failed (permission/transient) so the verdict is inconclusive.
export type CheckState = "enforced" | "unenforced" | "unreadable"

export type CheckVerdict = {
  state: CheckState
  detail?: string
}

function unreadableFrom(err: unknown): CheckVerdict {
  if (err instanceof GitHubAPIError) {
    if (err.status === 404) {
      return { state: "unenforced", detail: "not configured" }
    }
    return { state: "unreadable", detail: `read failed (${err.status})` }
  }
  return { state: "unreadable", detail: "read failed" }
}

// orgDefaults: GET /orgs/{org}, classify against the plan-filtered desired
// member-default lockdown. Returns the full per-field classification so the
// settings page can list each unenforced field with its manualFix.
export async function checkOrgDefaults(
  client: GitHubClient,
  org: string,
  plan: string | undefined,
): Promise<{ verdict: CheckVerdict; classification?: ClassifyResult }> {
  try {
    const live = await client.request<Record<string, unknown>>(`/orgs/${org}`)
    const classification = classifyDefaults(live, plan)
    const state: CheckState = classification.criticalMissed
      ? "unenforced"
      : classification.verdicts.every((v) => v.enforced)
        ? "enforced"
        : "unenforced"
    return { verdict: { state }, classification }
  } catch (err) {
    return { verdict: unreadableFrom(err) }
  }
}

type OrgActionsPermissions = {
  enabled_repositories: "all" | "none" | "selected"
  allowed_actions?: "all" | "local_only" | "selected"
}

// orgActions: GET /orgs/{org}/actions/permissions — enforced when Actions are
// enabled for all repos with all actions allowed.
export async function checkOrgActions(
  client: GitHubClient,
  org: string,
): Promise<CheckVerdict> {
  try {
    const perms = await client.request<OrgActionsPermissions>(
      `/orgs/${org}/actions/permissions`,
    )
    const enforced =
      perms.enabled_repositories === "all" && perms.allowed_actions === "all"
    return {
      state: enforced ? "enforced" : "unenforced",
      detail: enforced
        ? undefined
        : `enabled_repositories="${perms.enabled_repositories}", allowed_actions="${perms.allowed_actions ?? "unset"}"`,
    }
  } catch (err) {
    return unreadableFrom(err)
  }
}

type OrgWorkflowPermissions = {
  default_workflow_permissions: "read" | "write"
  can_approve_pull_request_reviews: boolean
}

// orgPrCreation: GET /orgs/{org}/actions/permissions/workflow — enforced when
// Actions may create/approve pull requests (Feedback PRs can open).
export async function checkOrgPrCreation(
  client: GitHubClient,
  org: string,
): Promise<CheckVerdict> {
  try {
    const perms = await client.request<OrgWorkflowPermissions>(
      `/orgs/${org}/actions/permissions/workflow`,
    )
    return {
      state: perms.can_approve_pull_request_reviews ? "enforced" : "unenforced",
    }
  } catch (err) {
    return unreadableFrom(err)
  }
}

type BranchProtection = {
  allow_force_pushes?: { enabled: boolean }
  allow_deletions?: { enabled: boolean }
}

// branchProtection: GET /repos/{org}/{repo}/branches/{branch}/protection —
// enforced when force-pushes and deletions are both disabled.
export async function checkBranchProtection(
  client: GitHubClient,
  org: string,
  repo: string = CONFIG_REPO,
  branch: string = "main",
): Promise<CheckVerdict> {
  try {
    const protection = await client.request<BranchProtection>(
      `/repos/${org}/${repo}/branches/${encodeURIComponent(branch)}/protection`,
    )
    const enforced =
      protection.allow_force_pushes?.enabled === false &&
      protection.allow_deletions?.enabled === false
    return { state: enforced ? "enforced" : "unenforced" }
  } catch (err) {
    return unreadableFrom(err)
  }
}

type ReusableWorkflowAccess = {
  access_level: "none" | "organization" | "enterprise"
}

// reusableWorkflowAccess: GET /repos/{org}/{repo}/actions/permissions/access —
// enforced when the config repo's reusable workflows are org-accessible.
export async function checkReusableWorkflowAccess(
  client: GitHubClient,
  org: string,
  repo: string = CONFIG_REPO,
): Promise<CheckVerdict> {
  try {
    const access = await client.request<ReusableWorkflowAccess>(
      `/repos/${org}/${repo}/actions/permissions/access`,
    )
    return {
      state:
        access.access_level === "organization" ||
        access.access_level === "enterprise"
          ? "enforced"
          : "unenforced",
    }
  } catch (err) {
    return unreadableFrom(err)
  }
}

type PagesInfo = {
  build_type?: string
  public?: boolean
}

// pages: GET /repos/{org}/{repo}/pages — enforced when Pages builds from the
// workflow and the site is public (the unauthenticated config-repo site).
export async function checkPages(
  client: GitHubClient,
  org: string,
  repo: string = CONFIG_REPO,
): Promise<CheckVerdict> {
  try {
    const pages = await client.request<PagesInfo>(`/repos/${org}/${repo}/pages`)
    const enforced = pages.build_type === "workflow" && pages.public === true
    return { state: enforced ? "enforced" : "unenforced" }
  } catch (err) {
    return unreadableFrom(err)
  }
}

export type OrgDefaultsRepairResult = {
  // ok mirrors the CLI's "lockdown complete" = no critical field unenforced.
  ok: boolean
  // transient is set when a secondary-rate-limit aborted the apply; the caller
  // should surface a retry message rather than a drift checklist.
  transient: boolean
  // The unenforced settings after the authoritative read-back, each carrying
  // its manualFix for the settings page / wizard checklist.
  unenforced: MemberDefaultSetting[]
  message: string
}

function orgDefaultsBody(
  settings: MemberDefaultSetting[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const s of settings) body[s.field] = s.value
  return body
}

// Read the org back and classify — the single source of truth for residual
// state. A 200 on the PATCH is not proof the values stuck (enterprise-pinned
// fields silently no-op), so the read-back is authoritative. A read failure
// does not manufacture a false checklist (mirrors the CLI: warn, treat as ok).
async function verifyOrgDefaults(
  client: GitHubClient,
  org: string,
  plan: string | undefined,
): Promise<{ ok: boolean; unenforced: MemberDefaultSetting[] }> {
  try {
    const live = await client.request<Record<string, unknown>>(`/orgs/${org}`)
    const { verdicts, criticalMissed } = classifyDefaults(live, plan)
    return {
      ok: !criticalMissed,
      unenforced: verdicts.filter((v) => !v.enforced).map((v) => v.setting),
    }
  } catch {
    return { ok: true, unenforced: [] }
  }
}

// repairOrgDefaults applies the full plan-filtered member-default lockdown,
// mirroring the CLI's applyOrgMemberDefaults: one combined PATCH /orgs/{org};
// on a 403/422 (not a rate limit) drop to a per-field fallback; on a
// secondary-rate-limit abort as transient (do not amplify the throttle); then
// always read the org back and classify.
export async function repairOrgDefaults(
  client: GitHubClient,
  org: string,
  plan: string | undefined,
): Promise<OrgDefaultsRepairResult> {
  const settings = memberDefaultSettings(plan)

  try {
    await client.request(`/orgs/${org}`, {
      method: "PATCH",
      body: orgDefaultsBody(settings),
    })
  } catch (err) {
    if (err instanceof GitHubAPIError && err.isRateLimited) {
      return {
        ok: false,
        transient: true,
        unenforced: [],
        message: `${org}: hit a rate limit applying org member defaults; retry shortly.`,
      }
    }
    if (
      err instanceof GitHubAPIError &&
      (err.status === 403 || err.status === 422)
    ) {
      const fallback = await repairOrgDefaultsPerField(client, org, settings)
      if (fallback.transient) return fallback
    } else {
      throw err
    }
  }

  const { ok, unenforced } = await verifyOrgDefaults(client, org, plan)
  return {
    ok,
    transient: false,
    unenforced,
    message: ok
      ? `${org}: org member-privilege lockdown applied.`
      : `${org}: org member-privilege lockdown incomplete — ${unenforced.length} setting(s) need manual attention.`,
  }
}

// Per-field fallback: PATCH each field alone. A 403/422 on an individual field
// is a plan-gated rejection — skip it silently; the read-back reports the true
// residual state as one checklist. A secondary-rate-limit aborts.
async function repairOrgDefaultsPerField(
  client: GitHubClient,
  org: string,
  settings: MemberDefaultSetting[],
): Promise<OrgDefaultsRepairResult> {
  for (const s of settings) {
    try {
      await client.request(`/orgs/${org}`, {
        method: "PATCH",
        body: { [s.field]: s.value },
      })
    } catch (err) {
      if (err instanceof GitHubAPIError && err.isRateLimited) {
        return {
          ok: false,
          transient: true,
          unenforced: [],
          message: `${org}: hit a rate limit applying org member defaults; retry shortly.`,
        }
      }
      if (
        err instanceof GitHubAPIError &&
        (err.status === 403 || err.status === 422)
      ) {
        continue
      }
      throw err
    }
  }
  return { ok: true, transient: false, unenforced: [], message: "" }
}
