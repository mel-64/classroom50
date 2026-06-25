import type { GitHubClient } from "./client"
import { createGitHubClient } from "./client"
import {
  type GitHubCreateTree,
  type GitHubCreateCommit,
  type GitHubMoveBranch,
  type GitHubTeam,
  type GitHubRepo,
  type GitHubOrgMembership,
} from "./types"
import { GitHubAPIError } from "./errors"
import sodium from "libsodium-wrappers"
import { getBranchRef, getClassroomJson, getCommit } from "@/api/github/queries"
import type { CreateClassroomInput } from "@/api/mutations/classrooms"
import { getRepo } from "./queries"

const ASSIGNMENTS_TEMPLATE = {
  schema: "classroom50/assignments/v1",
  assignments: [],
}
const createClassroomMetadata = (
  org: string,
  classroom: string,
  name: string,
  term: string,
  team?: ClassroomTeamRef,
) => ({
  schema: "classroom50/classroom/v1",
  name,
  short_name: classroom,
  term,
  org,
  // Written only when a team was provisioned, matching the CLI's `omitempty`
  // team field. Grants rostered students read on private org templates.
  ...(team ? { team } : {}),
})

const STUDENTS_CSV_HEADER =
  "username,first_name,last_name,email,section,github_id\n"
const createClassroomBody = (
  base_tree: string,
  org: string,
  classroom: string,
  name: string,
  term: string,
  team?: ClassroomTeamRef,
) => {
  const mode = "100644"
  const type = "blob"

  return {
    base_tree,
    tree: [
      {
        path: `${classroom}/assignments.json`,
        mode,
        type,
        content: JSON.stringify(ASSIGNMENTS_TEMPLATE, null, 2),
      },
      {
        path: `${classroom}/students.csv`,
        mode,
        type,
        content: STUDENTS_CSV_HEADER,
      },
      {
        path: `${classroom}/scores.json`,
        mode,
        type,
        content: JSON.stringify(
          {
            schema: "classroom50/scores/v1",
            assignments: {},
          },
          null,
          2,
        ),
      },
      {
        path: `${classroom}/classroom.json`,
        mode,
        type,
        content: JSON.stringify(
          createClassroomMetadata(org, classroom, name, term, team),
          null,
          2,
        ),
      },
    ],
  }
}

export function createTree(
  client: GitHubClient,
  input: CreateClassroomInput & {
    base_tree: string
    term: string
    team?: ClassroomTeamRef
  },
) {
  const { base_tree, org, classroom, name, term, team } = input
  return client.request<GitHubCreateTree>(
    `/repos/${org}/classroom50/git/trees`,
    {
      method: "POST",
      body: createClassroomBody(base_tree, org, classroom, name, term, team),
    },
  )
}

export function createTreeRepo(
  client: GitHubClient,
  input: {
    base_tree: string
    org: string
    repo: string
    tree: { path: string; mode: string; type: string; content: string }[]
  },
) {
  const { base_tree, org, repo, tree } = input

  return client.request<GitHubTree>(`/repos/${org}/${repo}/git/trees`, {
    method: "POST",
    body: {
      base_tree,
      tree,
    },
  })
}

type GitHubTree = {
  sha: string
}
export function createTreeForAssignment(params: {
  client: GitHubClient
  owner: string
  repo: string
  baseTreeSha: string
  metadataYaml: string
  autogradeYaml: string
}) {
  const { client, owner, repo, baseTreeSha, metadataYaml, autogradeYaml } =
    params

  return client.request<GitHubTree>(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: {
      base_tree: baseTreeSha,
      tree: [
        {
          path: ".classroom50.yaml",
          mode: "100644",
          type: "blob",
          content: metadataYaml,
        },
        {
          path: ".github/workflows/autograde.yaml",
          mode: "100644",
          type: "blob",
          content: autogradeYaml,
        },
      ],
    },
  })
}

export function createCommit(
  client: GitHubClient,
  input: CreateClassroomInput & {
    parents: [string]
    tree_sha: string
    message?: string
  },
) {
  const { classroom, tree_sha, org, parents, message } = input
  return client.request<GitHubCreateCommit>(
    `/repos/${org}/classroom50/git/commits`,
    {
      method: "POST",
      body: {
        message: message || `Create init files for new classroom: ${classroom}`,
        tree: tree_sha,
        parents,
      },
    },
  )
}

export function createCommitRepo(
  client: GitHubClient,
  input: {
    org: string
    repo: string
    parents: [string]
    tree: string
    message: string
  },
) {
  const { org, repo, parents, tree, message } = input

  return client.request<GitHubCreateCommit>(
    `/repos/${org}/${repo}/git/commits`,
    {
      method: "POST",
      body: {
        message,
        tree,
        parents,
      },
    },
  )
}

export function createCommitForAssignment(params: {
  client: GitHubClient
  owner: string
  repo: string
  message: string
  treeSha: string
  parentSha: string
}) {
  const { client, owner, repo, message, treeSha, parentSha } = params

  return client.request<GitHubCreateCommit>(
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: {
        message,
        tree: treeSha,
        parents: [parentSha],
      },
    },
  )
}

export function updateRef(client: GitHubClient, org: string, sha: string) {
  return client.request<GitHubMoveBranch>(
    `/repos/${org}/classroom50/git/refs/heads/main`,
    {
      method: "PATCH",
      body: {
        sha,
        force: false,
      },
    },
  )
}

type GitHubRef = {
  ref: string
  object: {
    sha: string
    type: string
    url: string
  }
}
export function updateRefForRepo(params: {
  client: GitHubClient
  owner: string
  repo: string
  branch: string
  commitSha: string
}) {
  const { client, owner, repo, branch, commitSha } = params

  return client.request<GitHubRef>(
    `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      method: "PATCH",
      body: {
        sha: commitSha,
        force: false,
      },
    },
  )
}

export {
  createClassroomFiles,
  createClassroomFilesWithConflictRetry,
} from "@/api/mutations/classrooms"

export type GitTreeEntry = {
  path: string
  mode: "100644"
  type: "blob"
  content: string
}
export type CreateGitTreeInput = {
  org: string
  base_tree: string
  tree: GitTreeEntry[]
}
export function createGitTree(client: GitHubClient, input: CreateGitTreeInput) {
  const { org, base_tree, tree } = input

  return client.request<GitHubCreateTree>(
    `/repos/${org}/classroom50/git/trees`,
    {
      method: "POST",
      body: {
        base_tree,
        tree,
      },
    },
  )
}

export type CreateGitCommitInput = {
  org: string
  message: string
  tree_sha: string
  parents: [string]
}
export function createGitCommit(
  client: GitHubClient,
  input: CreateGitCommitInput,
) {
  const { org, message, tree_sha, parents } = input

  return client.request<GitHubCreateCommit>(
    `/repos/${org}/classroom50/git/commits`,
    {
      method: "POST",
      body: {
        message,
        tree: tree_sha,
        parents,
      },
    },
  )
}

export {
  createAssignment,
  createAssignmentWithConflictRetry,
} from "@/api/mutations/assignments"

export type CreateTeamInput = {
  org: string
  name: string
  description?: string
  privacy?: "secret" | "closed"
  maintainers?: string[]
  repo_names?: string[]
}
export function createTeam(client: GitHubClient, input: CreateTeamInput) {
  const { org, ...body } = input

  return client.request<GitHubTeam>(`/orgs/${org}/teams`, {
    method: "POST",
    body: {
      privacy: "closed",
      notification_setting: "notifications_disabled",
      ...body,
    },
  })
}

// Minimal team identity persisted in classroom.json. The slug is
// authoritative for team ops (GitHub may slugify a name differently on
// collision); the id is the immutable handle. Mirrors the CLI's teamRef.
export type ClassroomTeamRef = {
  id: number
  slug: string
}

// A short-name with consecutive/trailing hyphens slugifies to something other
// than `classroom50-<short>`, breaking team ops that re-derive the slug. The
// GUI's slugify produces canonical slugs; guard defensively to match the CLI.
function isCanonicalTeamShortName(shortName: string): boolean {
  return !shortName.endsWith("-") && !shortName.includes("--")
}

// Create (or adopt) the per-classroom `secret` team and return its { id, slug }
// for classroom.json (later grants rostered students read on private org
// templates). Mirrors the CLI: idempotent, adopts a same-named team on 422 and
// reconciles its privacy.
export async function ensureClassroomTeam(
  client: GitHubClient,
  org: string,
  classroom: string,
): Promise<ClassroomTeamRef & { created: boolean }> {
  if (!isCanonicalTeamShortName(classroom)) {
    throw new Error(
      `Classroom slug "${classroom}" can't back a GitHub team — remove consecutive or trailing hyphens (GitHub would rewrite the team slug, breaking membership and template grants).`,
    )
  }

  const name = `classroom50-${classroom}`

  try {
    const created = await createTeam(client, { org, name, privacy: "secret" })
    return { id: created.id, slug: created.slug, created: true }
  } catch (err) {
    // 422 = a same-named team already exists. Adopt it (read id/slug, reconcile
    // privacy). `created: false` means it pre-existed and must NOT be deleted on
    // a create-failure rollback (that would destroy a team we never created).
    if (err instanceof GitHubAPIError && err.status === 422) {
      const adopted = await adoptClassroomTeam(client, org, classroom)
      return { ...adopted, created: false }
    }
    throw err
  }
}

async function adoptClassroomTeam(
  client: GitHubClient,
  org: string,
  classroom: string,
): Promise<ClassroomTeamRef> {
  const slug = `classroom50-${classroom}`
  const existing = await client.request<GitHubTeam>(
    `/orgs/${org}/teams/${slug}`,
  )

  // NOTE: a stale same-slug team left by a failed deleteClassroom can re-grant
  // the prior cohort read on this classroom's private templates. We do NOT
  // refuse a populated team here: GitHub auto-adds the team creator as a
  // maintainer, so a freshly-created team (e.g. the winner of a concurrent
  // same-name create race) already reports members, and refusing on member
  // count would break the benign adopt the CLI relies on. Distinguishing a
  // stale-leftover from this classroom's own live team requires the persisted
  // team id from classroom.json, which isn't available here — left for a
  // follow-up that reconciles against that id.
  if (existing.privacy !== "secret") {
    await client.request(`/orgs/${org}/teams/${existing.slug}`, {
      method: "PATCH",
      body: { privacy: "secret" },
    })
  }

  return { id: existing.id, slug: existing.slug }
}

// Delete the per-classroom team by its persisted slug (mirrors the CLI). As
// defense against a reused slug, the live team's id is confirmed against the
// persisted id before deletion (skipped when no id was recorded). 404 =
// already gone (success); an empty ref is a no-op.
export async function deleteClassroomTeam(
  client: GitHubClient,
  org: string,
  team: ClassroomTeamRef | undefined | null,
): Promise<void> {
  if (!team?.slug) return

  if (team.id) {
    try {
      const live = await client.request<{ id: number }>(
        `/orgs/${org}/teams/${team.slug}`,
      )
      if (live.id !== team.id) {
        throw new Error(
          `Team "${team.slug}" in ${org} now has id ${live.id}, not the recorded ${team.id} — refusing to delete a team that isn't the one this classroom created; remove it by hand if intended.`,
        )
      }
    } catch (err) {
      if (err instanceof GitHubAPIError && err.status === 404) {
        return
      }
      throw err
    }
  }

  try {
    await client.request(`/orgs/${org}/teams/${team.slug}`, {
      method: "DELETE",
    })
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 404) {
      return
    }
    throw err
  }
}

export function addRepositoryToTeam(
  client: GitHubClient,
  input: {
    org: string
    teamSlug: string
    owner: string
    repo: string
    permission: "pull" | "triage" | "push" | "maintain" | "admin"
  },
) {
  const { org, teamSlug, owner, repo, permission } = input

  return client.request(
    `/orgs/${org}/teams/${teamSlug}/repos/${owner}/${repo}`,
    {
      method: "PUT",
      body: { permission },
    },
  )
}

export function addUserToTeam(
  client: GitHubClient,
  input: {
    org: string
    teamSlug: string
    username: string
    role?: "member" | "maintainer"
  },
) {
  const { org, teamSlug, username, role } = input

  return client.request(
    `/orgs/${org}/teams/${teamSlug}/memberships/${username}`,
    {
      method: "PUT",
      body: { role },
    },
  )
}

// Remove a user from a team (mirrors the CLI). 404 = not a member / team gone
// (success), so removal is idempotent. Org membership is untouched — only the
// team grant (and the template read it confers) is dropped.
export async function removeUserFromTeam(
  client: GitHubClient,
  input: {
    org: string
    teamSlug: string
    username: string
  },
): Promise<void> {
  const { org, teamSlug, username } = input

  try {
    await client.request(
      `/orgs/${org}/teams/${teamSlug}/memberships/${username}`,
      { method: "DELETE" },
    )
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 404) {
      return
    }
    throw err
  }
}

// POST /orgs/{org}/invitations. Mirrors the CLI: body is invitee_id + role only
// (no team_ids/email). invitee_id must be a number (a string 422s). Owner-only.
function createOrgInvitation(
  client: GitHubClient,
  input: {
    org: string
    invitee_id: number
    role?: "direct_member" | "admin"
  },
) {
  const { org, invitee_id, role = "direct_member" } = input

  return client.request(`/orgs/${org}/invitations`, {
    method: "POST",
    body: { invitee_id, role },
  })
}

// Owner-only. A 404 (already gone) is treated as success so resend can proceed.
export async function cancelOrgInvitation(
  client: GitHubClient,
  input: { org: string; invitationId: number },
): Promise<void> {
  const { org, invitationId } = input

  try {
    await client.request(`/orgs/${org}/invitations/${invitationId}`, {
      method: "DELETE",
    })
  } catch (err) {
    if (err instanceof GitHubAPIError && err.isNotFound) {
      return
    }
    throw err
  }
}

// DELETE /orgs/{org}/memberships/{username}: removes an active member or
// cancels a pending invite. Owner-only. 404 (not affiliated) treated as success.
export async function removeOrgMembership(
  client: GitHubClient,
  input: { org: string; username: string },
): Promise<void> {
  const { org, username } = input

  try {
    await client.request(`/orgs/${org}/memberships/${username}`, {
      method: "DELETE",
    })
  } catch (err) {
    if (err instanceof GitHubAPIError && err.isNotFound) {
      return
    }
    throw err
  }
}

export type OrgMembershipState = "active" | "pending"

// GET /orgs/{org}/memberships/{username} -> state, or null on 404/error.
export async function getOrgMembershipState(
  client: GitHubClient,
  org: string,
  username: string,
): Promise<OrgMembershipState | null> {
  try {
    const membership = await client.request<{ state: OrgMembershipState }>(
      `/orgs/${org}/memberships/${username}`,
    )
    return membership.state ?? null
  } catch {
    return null
  }
}

type EnsureOrgMembershipResult = {
  // "active"/"pending" = no new invite sent; "invited" = a fresh one created.
  state: OrgMembershipState | "invited"
}

// Precheck membership, only invite when neither active nor pending, and treat a
// 422 (already member/invited) as success via a follow-up read. Mirrors the
// CLI's inviteIfNotMember. Any other 422/error propagates.
export async function ensureOrgMembership(
  client: GitHubClient,
  input: { org: string; username: string; inviteeId: number },
): Promise<EnsureOrgMembershipResult> {
  const { org, username, inviteeId } = input

  const existing = await getOrgMembershipState(client, org, username)
  if (existing === "active" || existing === "pending") {
    return { state: existing }
  }

  try {
    await createOrgInvitation(client, { org, invitee_id: inviteeId })
    return { state: "invited" }
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 422) {
      const state = await getOrgMembershipState(client, org, username)
      if (state === "active" || state === "pending") {
        return { state }
      }
    }
    throw err
  }
}

// Resend: cancel the existing invitation (when invitationId is given, e.g. an
// expired invite) then re-create. Omit invitationId for a never-invited student.
export async function resendOrgInvitation(
  client: GitHubClient,
  input: {
    org: string
    username: string
    inviteeId: number
    invitationId?: number
  },
): Promise<EnsureOrgMembershipResult> {
  const { org, username, inviteeId, invitationId } = input

  if (invitationId !== undefined) {
    await cancelOrgInvitation(client, { org, invitationId })
  }

  return ensureOrgMembership(client, { org, username, inviteeId })
}

export {
  addStudentToClassroom,
  addStudentToClassroomWithConflictRetry,
  enrollStudentInClassroom,
  addStudentsToClassroom,
  bulkEnrollStudentsInClassroom,
  addStudentsToClassroomWithConflictRetry,
} from "@/api/mutations/students"

export async function getPendingOrgInvite(client: GitHubClient, org: string) {
  return client.request<GitHubOrgMembership>(`/user/memberships/orgs/${org}`)
}

async function tryStep<T>({
  id,
  fn,
  onStepUpdate,
  options,
}: {
  id: InitStepId
  fn: () => Promise<T>
  onStepUpdate?: (update: InitStepUpdate) => void
  options?: { warningCodes: number[] }
}): Promise<T | null> {
  const { warningCodes } = options || {}

  onStepUpdate?.({
    id,
    status: "running",
  })

  try {
    const result = await fn()

    const maybeStatus =
      typeof result === "object" &&
      result !== null &&
      "status" in result &&
      typeof result.status === "string"
        ? result.status
        : "complete"

    onStepUpdate?.({
      id,
      status:
        maybeStatus === "warning"
          ? "warning"
          : maybeStatus === "complete"
            ? "complete"
            : "complete",
      data: result,
      message:
        typeof result === "object" &&
        result !== null &&
        "message" in result &&
        typeof result.message === "string"
          ? result.message
          : undefined,
    })

    return result
  } catch (err) {
    if (
      err instanceof GitHubAPIError &&
      warningCodes?.some((code) => err.status === code)
    ) {
      onStepUpdate?.({
        id,
        status: "warning",
        error: err?.message,
      })
      return {
        status: "warning" as const,
        message: err.message,
      }
    }

    onStepUpdate?.({
      id,
      status: "error",
      error: err?.message,
    })
    return {
      status: "error" as const,
      message: err?.message ?? "Unknown error",
    }
  }
}

type InitStepStatus =
  | "pending"
  | "running"
  | "complete"
  | "warning"
  | "error"
  | "skipped"

async function updateOrgClassroomSafetyDefaults(
  client: GitHubClient,
  org: string,
) {
  return client.request(`/orgs/${org}`, {
    method: "PATCH",
    body: {
      default_repository_permission: "none",
      members_can_create_public_repositories: false,
    },
  })
}

export async function createOrgRepo(client: GitHubClient, org: string) {
  return client.request(`/orgs/${org}/repos`, {
    method: "POST",
    body: {
      name: "classroom50",
      private: true,
      auto_init: true,
      description:
        "Classroom 50 configuration, manifests, workflows, and scores",
    },
  })
}

export async function ensureClassroom50Repo(client: GitHubClient, org: string) {
  const existing = await getRepo(client, org, "classroom50")

  if (existing) {
    return { status: "complete" as const, created: false, repo: existing }
  }

  const repo = await createOrgRepo(client, org)

  return { status: "complete" as const, created: true, repo }
}

export type SkeletonFile = {
  path: string
  mode: "100644"
  type: "blob"
  content: string
}

export type GitHubTreeResponse = {
  tree: Array<{
    path: string
    type: "blob" | "tree" | "commit"
    sha: string
  }>
  truncated: boolean
}

const SKELETON_PATHS = [
  "workflows/publish-pages.yaml",
  "workflows/collect-scores.yaml",
  "workflows/autograde-runner.yaml",
  "scripts/collect_scores.py",
  "scripts/runner.py",
  // Translates assignments.json `tests` blocks into per-assignment
  // tests.json bundles during publish-pages — without it, declarative
  // autograding tests silently never grade.
  "scripts/materialize_tests.py",
  // Drives the opt-in Feedback PR (issue #86); autograde-runner.yaml fetches
  // it from Pages. Without it, feedback_pr assignments can't open their PR.
  "scripts/ensure_feedback_pr.py",
]

// gh teacher init substitutes this placeholder (publish-pages.yaml's
// push trigger) with the config repo's default branch at commit time;
// committing it raw would leave the Pages workflow never firing.
const DEFAULT_BRANCH_PLACEHOLDER = "{{DEFAULT_BRANCH}}"
const FOUNDATION_BASE = "cli/gh-teacher/skeleton/dotgithub"
const ORG_BASE = ".github"
const CONFIG_REPO = "classroom50"
const SKELETON_SOURCE_OWNER = "foundation50"
const SKELETON_SOURCE_REPO = "classroom50"
const SKELETON_SOURCE_REF = "main"

export async function listTargetRepoPaths(
  client: GitHubClient,
  org: string,
  branch = "main",
): Promise<Set<string>> {
  const ref = await client.request<{
    object: { sha: string }
  }>(`/repos/${org}/${CONFIG_REPO}/git/ref/heads/${branch}`)

  const commit = await client.request<{
    tree: { sha: string }
  }>(`/repos/${org}/${CONFIG_REPO}/git/commits/${ref.object.sha}`)

  const tree = await client.request<GitHubTreeResponse>(
    `/repos/${org}/${CONFIG_REPO}/git/trees/${commit.tree.sha}?recursive=1`,
  )

  if (tree.truncated) {
    throw new Error(
      `The ${org}/${CONFIG_REPO} tree is too large to safely inspect for missing skeleton files.`,
    )
  }

  return new Set(
    tree.tree.filter((item) => item.type === "blob").map((item) => item.path),
  )
}

function encodeGitHubContentPath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as GitHubAPIError).status === 404
  )
}

export async function fetchSkeletonSourceFile(
  client: GitHubClient,
  path: string,
): Promise<string> {
  const encodedPath = encodeGitHubContentPath(path)

  try {
    return await client.requestRaw(
      `/repos/${SKELETON_SOURCE_OWNER}/${SKELETON_SOURCE_REPO}/contents/${encodedPath}?ref=${encodeURIComponent(
        SKELETON_SOURCE_REF,
      )}`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github.raw+json",
        },
      },
    )
  } catch (err) {
    if (isNotFound(err)) {
      throw new Error(
        `Skeleton source file not found: ${SKELETON_SOURCE_OWNER}/${SKELETON_SOURCE_REPO}:${path}`,
      )
    }

    throw err
  }
}

export async function findMissingSkeletonFiles(
  client: GitHubClient,
  org: string,
) {
  const existingPaths = await listTargetRepoPaths(client, org)
  const adjustedTargets = SKELETON_PATHS.map((path) => `${ORG_BASE}/${path}`)
  const missingPaths = adjustedTargets.filter(
    (path) => !existingPaths.has(path),
  )

  if (missingPaths.length === 0) {
    return []
  }

  // The skeleton is committed against the config repo's actual default
  // branch (org policy can rename `main`), matching gh teacher init.
  const repo = await client.request<GitHubRepo>(`/repos/${org}/${CONFIG_REPO}`)
  const defaultBranch = repo.default_branch || "main"

  return Promise.all(
    missingPaths.map(async (path): Promise<SkeletonFile> => {
      const content = await fetchSkeletonSourceFile(
        client,
        path.replace(ORG_BASE, FOUNDATION_BASE),
      )

      return {
        path,
        mode: "100644",
        type: "blob",
        content: content.replaceAll(DEFAULT_BRANCH_PLACEHOLDER, defaultBranch),
      }
    }),
  )
}

export async function ensureSkeletonFiles(client: GitHubClient, org: string) {
  const missing = await findMissingSkeletonFiles(client, org)

  if (missing.length === 0) {
    return { status: "complete", created: [] }
  }

  const branch = await getBranchRef(client, org)
  const commit = await getCommit(client, org, branch.object.sha)

  const tree = await createTreeRepo(client, {
    org,
    repo: "classroom50",
    base_tree: commit.tree.sha,
    tree: missing.map((file) => ({
      path: file.path,
      mode: "100644",
      type: "blob",
      content: file.content,
    })),
  })

  const newCommit = await createCommitRepo(client, {
    org,
    repo: "classroom50",
    message: "Bootstrap Classroom 50 skeleton",
    tree: tree.sha,
    parents: [commit.sha],
  })

  await updateRefForRepo({
    client,
    owner: org,
    repo: "classroom50",
    branch: "main",
    commitSha: newCommit.sha,
  })

  return {
    status: "complete",
    created: missing.map((f) => f.path),
  }
}

export type EnsurePagesResult = {
  status: "warning" | "complete"
  pagesEnabled: boolean
  pagesAlreadyEnabled: boolean
  visibilityPublic: boolean
  settingsUrl: string
  warnings: string[]
  pagesUrl: string
}

function expectedPagesUrl(org: string): string {
  return `https://${org}.github.io/classroom50/`
}

function pagesSettingsUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/settings/pages`
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return "Unknown GitHub API error"
}

async function enableWorkflowPages(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<{
  enabled: boolean
  alreadyEnabled: boolean
}> {
  try {
    await client.request(`/repos/${owner}/${repo}/pages`, {
      method: "POST",
      body: {
        build_type: "workflow",
      },
    })

    return {
      enabled: true,
      alreadyEnabled: false,
    }
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 409) {
      return {
        enabled: true,
        alreadyEnabled: true,
      }
    }

    throw new Error(
      `Could not enable GitHub Pages for ${owner}/${repo}: ${getErrorMessage(
        err,
      )}`,
    )
  }
}

async function setPagesPublic(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<{
  visibilityPublic: boolean
  warning?: string
}> {
  try {
    await client.request(`/repos/${owner}/${repo}/pages`, {
      method: "PUT",
      body: {
        public: true,
      },
    })

    return {
      visibilityPublic: true,
    }
  } catch (err) {
    return {
      visibilityPublic: false,
      warning: `Couldn't set Pages visibility to public for ${owner}/${repo}: ${getErrorMessage(
        err,
      )}. Toggle it manually at ${pagesSettingsUrl(
        owner,
        repo,
      )} → Visibility if students see 404s on the Pages URL.`,
    }
  }
}

export async function ensurePages(
  client: GitHubClient,
  org: string,
  repo = "classroom50",
): Promise<EnsurePagesResult> {
  const warnings: string[] = []

  const enableResult = await enableWorkflowPages(client, org, repo)
  const visibilityResult = await setPagesPublic(client, org, repo)

  if (visibilityResult.warning) {
    warnings.push(visibilityResult.warning)
  }

  return {
    status: warnings.length > 0 ? "warning" : "complete",
    pagesEnabled: enableResult.enabled,
    pagesAlreadyEnabled: enableResult.alreadyEnabled,
    visibilityPublic: visibilityResult.visibilityPublic,
    pagesUrl: expectedPagesUrl(org),
    settingsUrl: pagesSettingsUrl(org, repo),
    warnings,
  }
}

export type EnsureWorkflowPermissionsResult =
  | {
      status: "complete"
      repo: string
      defaultWorkflowPermissions: "write"
      managedByOrgPolicy: false
      message: string
    }
  | {
      status: "warning"
      repo: string
      defaultWorkflowPermissions: "read" | "write" | "unknown"
      managedByOrgPolicy: true
      message: string
    }

type WorkflowPermissionsResponse = {
  default_workflow_permissions: "read" | "write"
  can_approve_pull_request_reviews?: boolean
}

export async function setRepoWorkflowPermissions(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<void> {
  await client.request(`/repos/${owner}/${repo}/actions/permissions/workflow`, {
    method: "PUT",
    body: {
      default_workflow_permissions: "write",
      can_approve_pull_request_reviews: false,
    },
  })
}

export async function getRepoWorkflowPermissions(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<WorkflowPermissionsResponse> {
  return client.request<WorkflowPermissionsResponse>(
    `/repos/${owner}/${repo}/actions/permissions/workflow`,
  )
}

export async function ensureWorkflowPermissions(
  client: GitHubClient,
  owner: string,
  repo = "classroom50",
): Promise<EnsureWorkflowPermissionsResult> {
  try {
    await setRepoWorkflowPermissions(client, owner, repo)

    return {
      status: "complete",
      repo: `${owner}/${repo}`,
      defaultWorkflowPermissions: "write",
      managedByOrgPolicy: false,
      message: `${owner}/${repo}: workflow permissions set to write.`,
    }
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 409) {
      throw new Error(
        `Could not set workflow permissions for ${owner}/${repo}: ${getErrorMessage(
          err,
        )}`,
      )
    }

    return reportOrgWorkflowPermissions(client, owner, repo)
  }
}

async function reportOrgWorkflowPermissions(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<EnsureWorkflowPermissionsResult> {
  try {
    const permissions = await getRepoWorkflowPermissions(client, owner, repo)

    if (permissions.default_workflow_permissions === "write") {
      return {
        status: "warning",
        repo: `${owner}/${repo}`,
        defaultWorkflowPermissions: "write",
        managedByOrgPolicy: true,
        message: `${owner}/${repo}: workflow permissions are already write, managed by organization policy.`,
      }
    }

    return {
      status: "warning",
      repo: `${owner}/${repo}`,
      defaultWorkflowPermissions: permissions.default_workflow_permissions,
      managedByOrgPolicy: true,
      message: `${owner}/${repo}: organization default workflow permissions are ${permissions.default_workflow_permissions}. This is okay because the Classroom 50 skeleton workflows declare workflow-level write permissions where needed.`,
    }
  } catch {
    return {
      status: "warning",
      repo: `${owner}/${repo}`,
      defaultWorkflowPermissions: "unknown",
      managedByOrgPolicy: true,
      message: `${owner}/${repo}: workflow permissions are managed by an organization policy. The effective setting could not be read, but setup can continue because the Classroom 50 skeleton workflows declare their own permissions.`,
    }
  }
}

function actionsSettingsUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/settings/actions`
}

export type EnsureReusableWorkflowAccessResult =
  | {
      status: "complete"
      repo: string
      accessLevel: "organization"
      message: string
      settingsUrl: string
    }
  | {
      status: "warning"
      repo: string
      accessLevel: "unknown"
      reason:
        | "permission_denied"
        | "policy_conflict"
        | "unexpected_status"
        | "unknown"
      message: string
      settingsUrl: string
    }

export async function ensureReusableWorkflowAccess(
  client: GitHubClient,
  owner: string,
  repo = "classroom50",
): Promise<EnsureReusableWorkflowAccessResult> {
  const settingsUrl = actionsSettingsUrl(owner, repo)

  try {
    await client.request(`/repos/${owner}/${repo}/actions/permissions/access`, {
      method: "PUT",
      body: {
        access_level: "organization",
      },
    })

    return {
      status: "complete",
      repo: `${owner}/${repo}`,
      accessLevel: "organization",
      settingsUrl,
      message: `${owner}/${repo}: reusable-workflow access enabled for the organization.`,
    }
  } catch (err) {
    const message = getErrorMessage(err)
    if (err instanceof GitHubAPIError) {
      if (err.status === 403) {
        return {
          status: "warning",
          repo: `${owner}/${repo}`,
          accessLevel: "unknown",
          reason: "permission_denied",
          settingsUrl,
          message: `${owner}/${repo}: couldn't enable reusable-workflow access for the organization. Student autograde workflows may fail with a 403 when resolving the reusable workflow. Retry with an org-admin token or toggle it manually at ${settingsUrl} → Access.`,
        }
      }

      if (err.status === 409) {
        return {
          status: "warning",
          repo: `${owner}/${repo}`,
          accessLevel: "unknown",
          reason: "policy_conflict",
          settingsUrl,
          message: `${owner}/${repo}: reusable-workflow access appears to be controlled by an organization or enterprise policy. Student autograde workflows may fail resolving the reusable workflow unless org-level access allows it. Review ${settingsUrl} → Access.`,
        }
      }
    }
    return {
      status: "warning",
      repo: `${owner}/${repo}`,
      accessLevel: "unknown",
      reason: "unknown",
      settingsUrl,
      message: `${owner}/${repo}: couldn't enable reusable-workflow access: ${message}. Student autograde workflows may fail resolving the reusable workflow. Review ${settingsUrl} → Access.`,
    }
  }
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value)
}

async function getDefaultBranch(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<string> {
  const repoData = await client.request<GitHubRepo>(`/repos/${owner}/${repo}`)

  return repoData.default_branch
}

export async function putMinimalBranchProtection(
  client: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  await client.request(
    `/repos/${owner}/${repo}/branches/${encodePathPart(branch)}/protection`,
    {
      method: "PUT",
      body: {
        required_status_checks: null,
        enforce_admins: false,
        required_pull_request_reviews: null,
        restrictions: null,
        allow_force_pushes: false,
        allow_deletions: false,
      },
    },
  )
}

function branchSettingsUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/settings/branches`
}

export type EnsureBranchProtectionResult =
  | {
      status: "complete"
      repo: string
      branch: string
      message: string
      settingsUrl: string
    }
  | {
      status: "warning"
      repo: string
      branch: string | null
      reason:
        | "permission_denied"
        | "branch_not_found"
        | "unsupported"
        | "unexpected"
      message: string
      settingsUrl: string
    }

export async function ensureBranchProtection(
  client: GitHubClient,
  owner: string,
  repo = "classroom50",
  branch?: string,
): Promise<EnsureBranchProtectionResult> {
  const settingsUrl = branchSettingsUrl(owner, repo)

  let targetBranch: string | null = branch ?? null

  try {
    targetBranch ??= await getDefaultBranch(client, owner, repo)

    await putMinimalBranchProtection(client, owner, repo, targetBranch)

    return {
      status: "complete",
      repo: `${owner}/${repo}`,
      branch: targetBranch,
      settingsUrl,
      message: `${owner}/${repo}: branch protection applied to ${targetBranch}; force-pushes and deletions are disabled.`,
    }
  } catch (err) {
    const message = getErrorMessage(err)

    if (err instanceof GitHubAPIError) {
      if (err.status === 403) {
        return {
          status: "warning",
          repo: `${owner}/${repo}`,
          branch: targetBranch,
          reason: "permission_denied",
          settingsUrl,
          message: `${owner}/${repo}: branch protection could not be applied because the authenticated user lacks permission. Review branch protection manually at ${settingsUrl}.`,
        }
      }

      if (err.status === 404) {
        return {
          status: "warning",
          repo: `${owner}/${repo}`,
          branch: targetBranch,
          reason: "branch_not_found",
          settingsUrl,
          message: `${owner}/${repo}: branch protection could not be applied because the target branch was not found. The repository may still be initializing. Retry setup or review ${settingsUrl}.`,
        }
      }

      if (err.status === 422) {
        return {
          status: "warning",
          repo: `${owner}/${repo}`,
          branch: targetBranch,
          reason: "unsupported",
          settingsUrl,
          message: `${owner}/${repo}: GitHub rejected the branch protection request. This may be due to repository plan, ruleset, or policy constraints. Review ${settingsUrl}.`,
        }
      }
    }

    return {
      status: "warning",
      repo: `${owner}/${repo}`,
      branch: targetBranch,
      reason: "unexpected",
      settingsUrl,
      message: `${owner}/${repo}: branch protection could not be applied: ${message}. Review ${settingsUrl}.`,
    }
  }
}

export async function encryptSecret(publicKey: string, secret: string) {
  await sodium.ready

  const binkey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL)
  const binsec = sodium.from_string(secret)

  const encBytes = sodium.crypto_box_seal(binsec, binkey)

  return sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL)
}

/**
 * Validates a fine-grained PAT before storing it as the service token, mirroring
 * the CLI's `servicetoken.ValidateToken`: reads the classroom50 repo's contents
 * *as the supplied token*, exercising `Contents: read`, and maps failures to
 * actionable messages so a bad token is caught here, not later as a failed run.
 *
 * Caveat: this proves the token can read `classroom50`, not the student repos
 * the collect workflow walks (fine-grained PATs don't expose their repo
 * selection via the API). Hence the UI requires "All repositories" and the
 * success copy is scoped to what this check actually proves.
 */
export async function validateServiceToken(
  token: string,
  org: string | undefined,
) {
  if (!org) throw new Error("org must be specified to validate a service token")

  const trimmed = token.trim()
  if (!trimmed) throw new Error("Enter a token before saving.")

  const tokenClient = createGitHubClient({ token: trimmed })

  try {
    // Probes api.github.com directly with the pasted token, relying on GitHub's
    // permissive CORS on authenticated REST calls; route through any future
    // CORS-stripping proxy too.
    await tokenClient.request(`/repos/${org}/classroom50/contents/`)
  } catch (err) {
    if (err instanceof GitHubAPIError) {
      if (err.status === 401) {
        throw new Error(
          "This token is invalid, expired, or revoked (401). Create a fresh fine-grained PAT and try again.",
          { cause: err },
        )
      }
      if (err.status === 403) {
        throw new Error(
          `This token can't read ${org}/classroom50 contents (403). Create a fine-grained PAT with Resource owner = ${org}, Repository access = All repositories, and Contents: Read. If your org requires PAT approval and you are not an org owner, an owner must approve it first (owners' tokens are auto-approved).`,
          { cause: err },
        )
      }
      if (err.status === 404) {
        throw new Error(
          `Couldn't find a classroom50 repository in ${org} (404). Check that the organization is correct and that setup has been run for it — this isn't necessarily a problem with the token itself.`,
          { cause: err },
        )
      }
    }
    // A fetch that never reached GitHub (network/CORS) throws a TypeError, not a
    // GitHubAPIError — don't blame the token for that.
    if (err instanceof TypeError) {
      throw new Error(
        `Couldn't reach GitHub to verify the token (network or CORS issue). Check your connection and try again. (${err.message})`,
        { cause: err },
      )
    }
    throw new Error(
      `Couldn't verify the token against ${org}/classroom50: ${getErrorMessage(
        err,
      )}`,
      { cause: err },
    )
  }
}

export const COLLECT_SCORES_WORKFLOW = "collect-scores.yaml"

/**
 * Dispatches the classroom50 repo's `collect-scores.yaml` workflow — the same
 * nightly job that refreshes `scores.json` — so a teacher can pull fresh
 * submissions on demand. Reads the repo's default branch for the required ref.
 *
 * Returns `sinceRunId`: the newest collect-scores dispatch run before this POST
 * (null if none). Since the dispatch API returns no run id, the caller finds the
 * triggered run as the oldest dispatch run with a larger id — monotonic, so no
 * clock comparison and unambiguous when dispatches race.
 *
 * @param classroom optional dispatch input to scope collection to one classroom;
 *   callers currently omit it to collect org-wide.
 */
export async function triggerScoreCollection(
  client: GitHubClient,
  org: string | undefined,
  classroom?: string,
): Promise<{ sinceRunId: number | null }> {
  if (!org) throw new Error("org must be specified to collect scores")

  const repo = await getRepo(client, org, "classroom50")
  if (!repo) {
    throw new Error(
      `${org}/classroom50 not found; run setup for this org first`,
    )
  }
  const ref = repo.default_branch || "main"

  // Snapshot the newest dispatch run id before the POST. Run ids are monotonic,
  // so the run this POST creates is the oldest dispatch run whose id exceeds it.
  const baseline = await client.request<{ workflow_runs: { id: number }[] }>(
    `/repos/${org}/classroom50/actions/workflows/${COLLECT_SCORES_WORKFLOW}/runs?event=workflow_dispatch&per_page=1`,
  )
  const sinceRunId = baseline.workflow_runs?.[0]?.id ?? null

  await client.request(
    `/repos/${org}/classroom50/actions/workflows/${COLLECT_SCORES_WORKFLOW}/dispatches`,
    {
      method: "POST",
      body: {
        ref,
        inputs: classroom ? { classroom } : {},
      },
    },
  )

  return { sinceRunId }
}

export async function putRepoSecret(
  client: GitHubClient,
  owner: string | undefined,
  repo: string,
  name: string,
  plaintext: string,
) {
  if (!owner) throw new Error(`org must be specified to create a PAT`)
  const key = await client.request<{
    key_id: string
    key: string
  }>(`/repos/${owner}/${repo}/actions/secrets/public-key`)

  const encryptedValue = await encryptSecret(key.key, plaintext)

  await client.request(`/repos/${owner}/${repo}/actions/secrets/${name}`, {
    method: "PUT",
    body: {
      encrypted_value: encryptedValue,
      key_id: key.key_id,
    },
  })
}

type OrgActionsPermissions = {
  enabled_repositories: "all" | "none" | "selected"
  allowed_actions?: "all" | "local_only" | "selected"
  selected_actions_url?: string
}

export type EnsureOrgActionsEnabledResult =
  | {
      status: "complete"
      org: string
      enabledRepositories: "all"
      allowedActions: "all"
      message: string
      settingsUrl: string
    }
  | {
      status: "warning"
      org: string
      enabledRepositories: "all" | "none" | "selected" | "unknown"
      allowedActions: "all" | "local_only" | "selected" | "unknown"
      reason:
        | "permission_denied"
        | "enterprise_policy"
        | "validation_failed"
        | "readback_failed"
        | "unknown"
      message: string
      settingsUrl: string
    }

function orgActionsSettingsUrl(org: string): string {
  return `https://github.com/organizations/${org}/settings/actions`
}

async function getOrgActionsPermissions(
  client: GitHubClient,
  org: string,
): Promise<OrgActionsPermissions> {
  return client.request<OrgActionsPermissions>(
    `/orgs/${org}/actions/permissions`,
  )
}

async function setOrgActionsPermissions(
  client: GitHubClient,
  org: string,
): Promise<void> {
  await client.request(`/orgs/${org}/actions/permissions`, {
    method: "PUT",
    body: {
      enabled_repositories: "all",
      allowed_actions: "all",
    },
  })
}

export async function ensureOrgActionsEnabled(
  client: GitHubClient,
  org: string,
): Promise<EnsureOrgActionsEnabledResult> {
  const settingsUrl = orgActionsSettingsUrl(org)

  try {
    await setOrgActionsPermissions(client, org)

    return {
      status: "complete",
      org,
      enabledRepositories: "all",
      allowedActions: "all",
      settingsUrl,
      message: `${org}: GitHub Actions enabled for all repositories.`,
    }
  } catch (err) {
    const message = getErrorMessage(err)

    let current: OrgActionsPermissions | null = null

    try {
      current = await getOrgActionsPermissions(client, org)
    } catch {
      // nothing for now, still want good warning info
    }

    const enabledRepositories = current?.enabled_repositories ?? "unknown"
    const allowedActions = current?.allowed_actions ?? "unknown"

    if (err instanceof GitHubAPIError) {
      if (err.status === 403) {
        return {
          status: "warning",
          org,
          enabledRepositories,
          allowedActions,
          reason: "permission_denied",
          settingsUrl,
          message:
            `${org}: couldn't enable GitHub Actions at the organization level. ` +
            `The authenticated user may lack org-owner/admin permissions, or an enterprise policy may block this change. ` +
            `Open ${settingsUrl} and set Actions permissions to allow repositories in this organization to run workflows.`,
        }
      }

      if (err.status === 409) {
        return {
          status: "warning",
          org,
          enabledRepositories,
          allowedActions,
          reason: "enterprise_policy",
          settingsUrl,
          message:
            `${org}: GitHub Actions permissions appear to be controlled by an organization or enterprise policy. ` +
            `Current setting: enabled_repositories="${enabledRepositories}", allowed_actions="${allowedActions}". ` +
            `Classroom50 workflows may not run until Actions are enabled. Review ${settingsUrl}.`,
        }
      }

      if (err.status === 422) {
        return {
          status: "warning",
          org,
          enabledRepositories,
          allowedActions,
          reason: "validation_failed",
          settingsUrl,
          message:
            `${org}: GitHub rejected the Actions permissions update. ` +
            `Current setting: enabled_repositories="${enabledRepositories}", allowed_actions="${allowedActions}". ` +
            `Review ${settingsUrl}. Original error: ${message}`,
        }
      }
    }

    return {
      status: "warning",
      org,
      enabledRepositories,
      allowedActions,
      reason: current ? "unknown" : "readback_failed",
      settingsUrl,
      message:
        `${org}: couldn't enable GitHub Actions. ` +
        `Current setting: enabled_repositories="${enabledRepositories}", allowed_actions="${allowedActions}". ` +
        `Review ${settingsUrl}. Original error: ${message}`,
    }
  }
}

export type EnsureOrgCanCreatePullRequestsResult =
  | {
      status: "complete"
      org: string
      message: string
      settingsUrl: string
    }
  | {
      status: "warning"
      org: string
      reason: "permission_denied" | "policy_conflict" | "readback_failed"
      message: string
      settingsUrl: string
    }

type OrgWorkflowPermissions = {
  default_workflow_permissions: "read" | "write"
  can_approve_pull_request_reviews: boolean
}

// The opt-in Feedback PR (issue #86), opened by each student repo's autograde
// workflow, is rejected by GitHub unless the org-level "Allow GitHub Actions to
// create and approve pull requests" toggle is on (it defaults off). Set only at
// the org level, so without it a GUI-initialized org hits the
// `pull-requests: none` failure (discussion #33). Mirrors the CLI; preserves
// default_workflow_permissions.
export async function ensureOrgCanCreatePullRequests(
  client: GitHubClient,
  org: string,
): Promise<EnsureOrgCanCreatePullRequestsResult> {
  const settingsUrl = orgActionsSettingsUrl(org)
  const path = `/orgs/${org}/actions/permissions/workflow`

  let current: OrgWorkflowPermissions
  try {
    current = await client.request<OrgWorkflowPermissions>(path)
  } catch (err) {
    return {
      status: "warning",
      org,
      reason: "readback_failed",
      settingsUrl,
      message: `${org}: couldn't read organization workflow permissions (${getErrorMessage(
        err,
      )}); GitHub Actions may be blocked from opening Feedback PRs. Enable "Allow GitHub Actions to create and approve pull requests" at ${settingsUrl}.`,
    }
  }

  if (current.can_approve_pull_request_reviews) {
    return {
      status: "complete",
      org,
      settingsUrl,
      message: `${org}: GitHub Actions is already allowed to create pull requests (Feedback PRs can open).`,
    }
  }

  try {
    await client.request(path, {
      method: "PUT",
      body: {
        default_workflow_permissions: current.default_workflow_permissions,
        can_approve_pull_request_reviews: true,
      },
    })

    return {
      status: "complete",
      org,
      settingsUrl,
      message: `${org}: enabled GitHub Actions to create pull requests (required for opt-in Feedback PRs).`,
    }
  } catch (err) {
    if (
      err instanceof GitHubAPIError &&
      (err.status === 403 || err.status === 409)
    ) {
      return {
        status: "warning",
        org,
        reason: err.status === 403 ? "permission_denied" : "policy_conflict",
        settingsUrl,
        message: `${org}: couldn't enable Actions-created pull requests (${getErrorMessage(
          err,
        )}); the opt-in Feedback PR won't open until an org admin turns on "Allow GitHub Actions to create and approve pull requests" at ${settingsUrl}.`,
      }
    }

    throw err
  }
}

export type InitStepId =
  | "orgDefaults"
  | "orgActions"
  | "orgPrCreation"
  | "configRepo"
  | "skeleton"
  | "branchProtection"
  | "workflowPermissions"
  | "reusableWorkflowAccess"
  | "pages"

export type InitStepUpdate = {
  id: InitStepId
  status: InitStepStatus
  title?: string
  message?: string
  error?: string
  data?: unknown
}

function stepFailed(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "status" in result &&
    (result as { status: unknown }).status === "error"
  )
}

export async function initClassroom50({
  client,
  org,
  onStepUpdate,
}: {
  client: GitHubClient
  org: string
  serviceToken?: string
  serviceAccountConfirmed: boolean
  onStepUpdate: (update: InitStepUpdate) => void
}) {
  const results: Partial<Record<InitStepId, unknown>> = {}

  const buildResult = (status: "error" | "complete") => ({
    org,
    repo: "classroom50",
    ...results,
    status,
    pagesUrl: `https://${org}.github.io/classroom50/`,
  })

  results.orgDefaults = await tryStep({
    id: "orgDefaults",
    onStepUpdate,
    fn: () => updateOrgClassroomSafetyDefaults(client, org),
    options: { warningCodes: [403, 422] },
  })

  results.orgActions = await tryStep({
    id: "orgActions",
    onStepUpdate,
    fn: () => ensureOrgActionsEnabled(client, org),
  })

  results.orgPrCreation = await tryStep({
    id: "orgPrCreation",
    onStepUpdate,
    fn: () => ensureOrgCanCreatePullRequests(client, org),
  })

  results.configRepo = await tryStep({
    id: "configRepo",
    onStepUpdate,
    fn: () => ensureClassroom50Repo(client, org),
  })

  // configRepo is a hard prerequisite for every step below. If it errored,
  // continuing only cascades 404s and (since the mutation still resolves) would
  // report success on a half-initialized org. Stop here.
  if (stepFailed(results.configRepo)) {
    return buildResult("error")
  }

  results.skeleton = await tryStep({
    id: "skeleton",
    onStepUpdate,
    fn: () => ensureSkeletonFiles(client, org),
  })

  // skeleton (workflows + scripts) — same hard-prerequisite gate.
  if (stepFailed(results.skeleton)) {
    return buildResult("error")
  }

  results.pages = await tryStep({
    id: "pages",
    onStepUpdate,
    fn: () => ensurePages(client, org, "classroom50"),
  })

  results.workflowPermissions = await tryStep({
    id: "workflowPermissions",
    onStepUpdate,
    fn: () => ensureWorkflowPermissions(client, org, "classroom50"),
  })

  results.reusableWorkflowAccess = await tryStep({
    id: "reusableWorkflowAccess",
    onStepUpdate,
    fn: () => ensureReusableWorkflowAccess(client, org, "classroom50"),
  })

  results.branchProtection = await tryStep({
    id: "branchProtection",
    onStepUpdate,
    fn: () => ensureBranchProtection(client, org, "classroom50", "main"),
  })

  return buildResult("complete")
}

export async function addRepoCollaborator(params: {
  client: GitHubClient
  org: string
  repo: string
  username: string
  permission?: "pull" | "triage" | "push" | "maintain" | "admin"
}) {
  const { client, org, repo, username, permission = "push" } = params

  // Only a definitive 404 (not an org member) blocks the add; transient errors
  // (rate limit, 5xx, private-membership 403) fall through to the authoritative
  // PUT rather than falsely rejecting a valid member.
  try {
    const userReq = await client.requestRaw(
      `/orgs/${encodeURIComponent(org)}/members/${encodeURIComponent(username)}`,
    )
    console.log("user req for " + username, userReq)
  } catch (err) {
    if (err instanceof GitHubAPIError && err.isNotFound) throw err
  }

  const res = await client.requestRaw(
    `/repos/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`,
    {
      method: "PUT",
      body: {
        permission,
      },
    },
  )

  console.log("request raw for add repo member", res)
  return res
}

export async function removeRepoCollaborator(params: {
  client: GitHubClient
  org: string
  repo: string
  username: string
}) {
  const { client, org, repo, username } = params

  return client.request(
    `/repos/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`,
    {
      method: "DELETE",
    },
  )
}

export async function createBlob(
  client: GitHubClient,
  input: {
    org: string
    content: string
  },
) {
  return client.request<GitHubBlob>(
    `/repos/${input.org}/classroom50/git/blobs`,
    {
      method: "POST",
      body: {
        content: input.content,
        encoding: "utf-8",
      },
    },
  )
}

export async function createTreeFromEntries(
  client: GitHubClient,
  input: {
    org: string
    base_tree: string
    tree: Array<{
      path: string
      mode: "100644"
      type: "blob"
      sha: string
    }>
  },
) {
  return client.request<GitHubTree>(
    `/repos/${input.org}/classroom50/git/trees`,
    {
      method: "POST",
      body: {
        base_tree: input.base_tree,
        tree: input.tree,
      },
    },
  )
}

export type UpdateClassroomMetadataInput = {
  org: string
  slug: string
  name: string
  term: string
}

export type Classroom = {
  name: string
  short_name: string
  slug: string
  schema: string
  term: string
}
export type UpdateClassroomMetadataResult = {
  previousCommitSha: string
  baseTreeSha: string
  newTreeSha: string
  newCommitSha: string
  updatedRef: unknown
  classroom: Classroom
}
export async function editClassroom(
  client: GitHubClient,
  input: {
    org: string
    slug: string
    term: string
    name: string
  },
) {
  console.log("editing classroom...")
  const { org, slug, term, name } = input

  console.log("fetching ref...")
  const ref = await getBranchRef(client, org)

  console.log("fetching commit...")
  const commit = await getCommit(client, org, ref.object.sha)

  console.log("fetching classroom json...")
  const current = await getClassroomJson(client, {
    org,
    classroom: slug,
    ref: ref.object.sha,
  })

  if (current.short_name !== slug) {
    throw new Error(
      `classroom.json slug mismatch: expected ${current.short_name}, got ${slug}`,
    )
  }

  const next = {
    ...current,
    name,
    term,
  }

  console.log("creating blob...")
  const blob = await createBlob(client, {
    org,
    content: JSON.stringify(next, null, 2) + "\n",
  })

  console.log("creating tree...")
  const tree = await createTreeFromEntries(client, {
    org,
    base_tree: commit.tree.sha,
    tree: [
      {
        path: `${slug}/classroom.json`,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      },
    ],
  })

  console.log("creating new commit...")
  const newCommit = await createCommit(client, {
    org,
    message: `Update classroom ${slug}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
    classroom: slug,
    term,
  })

  console.log("updating ref...")
  const updatedRef = await updateRef(client, org, newCommit.sha)

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.sha,
    newCommitSha: newCommit.sha,
    updatedRef,
    classroom: next,
  }
}
