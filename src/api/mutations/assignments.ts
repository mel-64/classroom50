import type { GitHubClient } from "@/hooks/github/client"
import type { Assignment } from "@/types/classroom"
import { getBranchRef, getClassroomJson, getCommit } from "../github/queries"
import { GitHubAPIError } from "@/hooks/github/errors"

import type { AssignmentTestDraft } from "@/util/assignmentTests"
import { draftToTest, makeSetupTest } from "@/util/assignmentTests"
import { buildDueFields } from "@/util/formatDate"
import { studentRepoName } from "@/util/studentRepo"
import { parseRunnerLabels } from "@/util/runners"
import {
  addRepositoryToTeam,
  createCommitForAssignment,
  createGitCommit,
  createGitTree,
  createTreeForAssignment,
  getErrorMessage,
  updateRef,
  updateRefForRepo,
} from "@/hooks/github/mutations"
import {
  fetchAssignmentFromPages,
  fetchTextWithFriendlyErrors,
  getAssignmentsFile,
  type AssignmentsFile,
} from "../queries/assignments"
import { withGitConflictRetry, type CreateClassroomResult } from "./classrooms"
import type { GitHubRepo } from "@/hooks/github/types"
import {
  getBranchRefRepo,
  getCommitByRepo,
  getRepo,
  withFreshRepoRetry,
} from "@/hooks/github/queries"
import { getAuthenticatedUser } from "../queries/users"
import { acceptPendingOrgInvite } from "./users"

// Exact subject the runner (runner.py: ACCEPT_COMMIT_SUBJECT) scans for to
// find the trusted Feedback-PR baseline — any other message makes it skip the
// PR. Mirrors the CLI's `gh student accept` commit; keep in lockstep.
const ACCEPT_COMMIT_SUBJECT =
  "Initialize .classroom50.yaml and autograde workflow (gh student accept)"

// Parse a `--template` ref — `<owner>/<repo>[@<branch>]` or a bare `<repo>`
// (owner defaults to the org). Mirrors the CLI's parseTemplateRef so the GUI
// accepts the same inputs and writes the same template block.
type ParsedTemplate = { owner: string; repo: string; branch?: string }
function parseTemplateRef(raw: string, defaultOwner: string): ParsedTemplate {
  const trimmed = raw.trim()
  if (!trimmed) {
    // Callers gate on a non-empty ref (the template is optional), so this is
    // an internal invariant, not user input.
    throw new Error("Template ref is empty.")
  }

  const [ownerRepo, branch, ...extraAt] = trimmed.split("@")
  if (extraAt.length > 0) {
    throw new Error(
      `Invalid template "${raw}": branch contains '@' (expected owner/repo[@branch]).`,
    )
  }
  // A branch given as `@<whitespace>` is empty after trimming.
  const trimmedBranch = branch?.trim()
  if (trimmed.includes("@") && !trimmedBranch) {
    throw new Error(`Invalid template "${raw}": branch is empty after '@'.`)
  }

  const parts = ownerRepo.split("/").map((part) => part.trim())
  if (parts.length === 1 && parts[0]) {
    // Bare repo name → owner defaults to the org (the form's hint).
    return {
      owner: defaultOwner,
      repo: parts[0],
      branch: trimmedBranch || undefined,
    }
  }
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid template "${raw}": expected owner/repo[@branch].`)
  }
  return {
    owner: parts[0],
    repo: parts[1],
    branch: trimmedBranch || undefined,
  }
}

// Resolve a template ref against GitHub, mirroring the CLI: must be a template
// repo, an omitted @branch falls back to its default, and an out-of-org private
// template is rejected (students could never be granted access). Returns the
// resolved block plus whether it's an in-org private template needing a team
// read grant.
async function resolveTemplate(
  client: GitHubClient,
  org: string,
  parsed: ParsedTemplate,
): Promise<{ template: Assignment["template"]; needsTeamGrant: boolean }> {
  // getRepo is 404-tolerant (returns null), so a missing/invisible template
  // surfaces as null.
  const repo = await getRepo(client, parsed.owner, parsed.repo)
  if (!repo) {
    throw new Error(
      `Template "${parsed.owner}/${parsed.repo}" is not visible to your account — make it public, or copy it into ${org} and reference the copy.`,
    )
  }

  if (!repo.is_template) {
    throw new Error(
      `"${parsed.owner}/${parsed.repo}" is not a template repository — toggle Settings → "Template repository" on the repo, then retry.`,
    )
  }

  const branch = parsed.branch || repo.default_branch
  if (!branch) {
    throw new Error(
      `Template "${parsed.owner}/${parsed.repo}" has no default branch — specify one as ${parsed.owner}/${parsed.repo}@<branch>.`,
    )
  }

  const inOrg = parsed.owner.toLowerCase() === org.toLowerCase()
  if (repo.private && !inOrg) {
    throw new Error(
      `Template "${parsed.owner}/${parsed.repo}" is private and outside ${org} — students can't be granted access, so accept would fail. Copy it into ${org} and reference the copy, or make the template public.`,
    )
  }

  return {
    template: { owner: parsed.owner, repo: parsed.repo, branch },
    needsTeamGrant: Boolean(repo.private && inOrg),
  }
}

// True when a parsed ref still points at the assignment's stored template, so
// an edit can reuse the stored block instead of re-resolving live. Owner/repo
// are case-insensitive (per GitHub); an omitted @branch means "keep the
// stored branch". Edit only.
function templateRefUnchanged(
  parsed: ParsedTemplate,
  existing: Assignment["template"] | undefined,
): boolean {
  if (!existing) return false
  const sameOwner = parsed.owner.toLowerCase() === existing.owner.toLowerCase()
  const sameRepo = parsed.repo.toLowerCase() === existing.repo.toLowerCase()
  const sameBranch = !parsed.branch || parsed.branch === existing.branch
  return sameOwner && sameRepo && sameBranch
}

// 404 -> false, 200 -> true, else throws. Wraps repoContentsPathExists for
// the config repo (classroom50).
async function contentsPathExists(
  client: GitHubClient,
  org: string,
  path: string,
): Promise<boolean> {
  return repoContentsPathExists(client, org, "classroom50", path)
}

// Check whether a path exists in an arbitrary repo. 404 -> false, 200 -> true.
async function repoContentsPathExists(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
): Promise<boolean> {
  try {
    await client.request(
      `/repos/${owner}/${repo}/contents/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    )
    return true
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 404) {
      return false
    }
    throw err
  }
}

export async function editAssignment(
  client: GitHubClient,
  input: CreateAssignmentInput,
): Promise<CreateAssignmentResult> {
  const { org, classroom, slug } = input

  const ref = await getBranchRef(client, org)
  const commit = await getCommit(client, org, ref.object.sha)

  const assignmentsFilePath = `${classroom}/assignments.json`
  const currentAssignments = await getAssignmentsFile(client, {
    org,
    path: assignmentsFilePath,
    ref: ref.object.sha,
  })

  const targetAssignment = currentAssignments.assignments.find(
    (a) => a.slug === slug,
  )
  if (!targetAssignment) {
    throw new Error(`Existing assignment matching ${slug} was not found.`)
  }

  // Normalize the edit the same way as create so it never leaves stray
  // non-schema keys the CLI rejects. Pass the stored template so an unchanged
  // ref is reused without a live lookup (non-template edits save even if the
  // template moved).
  const { entry: editedAssignment, needsTeamGrant } =
    await buildAssignmentEntry(client, input, targetAssignment.template)

  const nextAssignments = {
    ...currentAssignments,
    assignments: [
      ...currentAssignments.assignments.filter((a) => a.slug !== slug),
      editedAssignment,
    ],
  }

  const tree = await createGitTree(client, {
    org: input.org,
    base_tree: commit.tree.sha,
    tree: [
      {
        path: assignmentsFilePath,
        mode: "100644",
        type: "blob",
        content: JSON.stringify(nextAssignments, null, 2) + "\n",
      },
    ],
  })

  const newCommit = await createGitCommit(client, {
    org: input.org,
    message: `Edit assignment: ${input.classroom}/${slug}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
  })
  const updatedRef = await updateRef(client, input.org, newCommit.sha)

  // Grant the (possibly changed) in-org private template a team read — a
  // non-fatal warning, never thrown (the edit already committed). needsTeamGrant
  // implies a resolved template, so the guard just narrows the type.
  let templateGrantWarning: string | undefined
  if (needsTeamGrant && editedAssignment.template) {
    templateGrantWarning = await tryGrantTeamTemplateRead(
      client,
      input.org,
      input.classroom,
      input.slug,
      editedAssignment.template,
    )
  }

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.sha,
    newCommitSha: newCommit.sha,
    updatedRef,
    templateGrantWarning,
  }
}

// Same pre-write probes gh-teacher runs before writing declarative
// tests (see the "For other clients" section of the Autograders wiki).
async function ensureDeclarativeTestsWritable(
  client: GitHubClient,
  org: string,
  classroom: string,
  slug: string,
) {
  const materializeScript = ".github/scripts/materialize_tests.py"
  if (!(await contentsPathExists(client, org, materializeScript))) {
    throw new Error(
      `${org}/classroom50 is missing ${materializeScript}, so autograding tests would never run. ` +
        "Re-initialize the organization (or run `gh teacher init`) to update the config repo, then retry.",
    )
  }

  const autograderPath = `${classroom}/autograders/${slug}/autograder.py`
  if (await contentsPathExists(client, org, autograderPath)) {
    throw new Error(
      `Assignment "${slug}" already has a custom autograder at ${autograderPath}. ` +
        "Autograding tests and a hand-written autograder.py are mutually exclusive — remove one before adding the other.",
    )
  }
}

export type CreateAssignmentResult = CreateClassroomResult & {
  // Set when the assignment saved but the follow-up team read grant on a
  // private in-org template failed — a non-fatal warning the UI surfaces
  // (students can't accept until fixed). Mirrors teamDeleteWarning.
  templateGrantWarning?: string
}

// Assemble the normalized classroom50/assignments/v1 entry from form input,
// resolving the template the way the CLI does. Shared by create and edit so
// both write the same schema-valid shape and apply the team grant.
//
// `existingTemplate` (edit only): an unchanged ref (same owner/repo, branch
// unchanged or omitted) reuses the stored block WITHOUT a live lookup, so an
// unrelated-field edit still saves when the template was deleted/un-templated/
// made private-out-of-org. A changed ref is always re-resolved.
async function buildAssignmentEntry(
  client: GitHubClient,
  input: CreateAssignmentInput,
  existingTemplate?: Assignment["template"],
): Promise<{ entry: Assignment; needsTeamGrant: boolean }> {
  const userTests = input.tests.map(draftToTest)

  // A setup command is written as a leading 0-point `run` test named "setup"
  // — the CLI-blessed pre-grading idiom (no runtime.setup field exists; the
  // runner runs tests in order, non-zero exit fails the step). See
  // makeSetupTest/isSetupTest.
  const setupCommand = input.setup_command?.trim()
  const tests = setupCommand
    ? [makeSetupTest(setupCommand), ...userTests]
    : userTests

  if (tests.length > 0) {
    await ensureDeclarativeTestsWritable(
      client,
      input.org,
      input.classroom,
      input.slug,
    )
  }

  // Resolve the template like the CLI (parse, confirm template, default branch,
  // reject out-of-org private), reusing an unchanged stored ref on edit. The
  // template is OPTIONAL (mirrors `--template`): a blank field means a
  // template-less assignment, so skip parse/resolve/grant entirely.
  let template: Assignment["template"] | undefined
  let needsTeamGrant = false
  if (input.template_repo.trim()) {
    const parsedTemplate = parseTemplateRef(input.template_repo, input.org)
    const resolved = templateRefUnchanged(parsedTemplate, existingTemplate)
      ? { template: existingTemplate!, needsTeamGrant: false }
      : await resolveTemplate(client, input.org, parsedTemplate)
    template = resolved.template
    needsTeamGrant = resolved.needsTeamGrant
  }

  // Must match classroom50/assignments/v1 exactly — the CLI rejects unknown
  // fields, so a stray key breaks `gh teacher` for the whole classroom.
  // Optional fields are omitted (not written empty), as the CLI writes them.
  const entry: Assignment = {
    slug: input.slug,
    name: input.name,
    mode: input.mode,
    autograder: "default",
    // Mirrors the CLI's `--feedback-pr` default of true.
    feedback_pr: input.feedback_pr ?? true,
  }
  // Omit the template block entirely for a template-less assignment, matching
  // how the CLI writes a nil TemplateRef.
  if (template) {
    entry.template = template
  }
  if (input.description.trim()) {
    entry.description = input.description.trim()
  }
  if (input.due_date.trim()) {
    const { due, due_meta } = buildDueFields(input.due_date.trim())
    entry.due = due
    if (due_meta) {
      entry.due_meta = due_meta
    }
  }
  if (input.mode === "group" && input.max_group_size > 0) {
    entry.max_group_size = input.max_group_size
  }

  // Runtime overrides (Advanced Settings); omit the block when unset.
  // runs-on: write a string for one label, an array for many (both valid).
  const runnerLabels = parseRunnerLabels(input.runs_on ?? "")
  const containerImage = input.container_image?.trim()
  const containerUser = input.container_user?.trim()
  const runtime: NonNullable<Assignment["runtime"]> = {}
  if (runnerLabels.length === 1) {
    runtime["runs-on"] = runnerLabels[0]
  } else if (runnerLabels.length > 1) {
    runtime["runs-on"] = runnerLabels
  }
  if (containerImage) {
    runtime.container = { image: containerImage }
    if (containerUser) {
      runtime.container.user = containerUser
    }
  }
  if (Object.keys(runtime).length > 0) {
    entry.runtime = runtime
  }

  if (tests.length > 0) {
    entry.tests = tests
  }

  return { entry, needsTeamGrant }
}

// Grant the classroom team read on an in-org private template so rostered
// students can generate from it (mirrors the CLI's assignment add). The slug
// comes from classroom.json (authoritative). A genuinely teamless classroom
// (404, or a read with no team block) gets "recreate the classroom" advice; a
// transient read failure must NOT — that could push a teacher to destroy a
// healthy classroom — so it gets a retry message instead.
async function grantTeamTemplateRead(
  client: GitHubClient,
  org: string,
  classroom: string,
  slug: string,
  template: NonNullable<Assignment["template"]>,
) {
  let teamSlug: string | undefined
  try {
    const classroomJson = await getClassroomJson(client, { org, classroom })
    teamSlug = classroomJson.team?.slug
  } catch (err) {
    // 404 = no classroom.json (pre-feature) is a genuine "no team"; fall
    // through. Anything else is transient and must not be misread as "no team".
    if (!(err instanceof GitHubAPIError && err.isNotFound)) {
      throw new Error(
        `Assignment "${slug}" was saved, but checking classroom "${classroom}" for its team failed (${getErrorMessage(err)}). The classroom team read on the private template ${template.owner}/${template.repo} could not be granted — retry the save; if it keeps failing, grant the team read on ${template.owner}/${template.repo} directly in GitHub (Settings -> Collaborators and teams).`,
        { cause: err },
      )
    }
    teamSlug = undefined
  }

  if (!teamSlug) {
    throw new Error(
      `Assignment "${slug}" was saved, but classroom "${classroom}" has no team to grant read on the private template ${template.owner}/${template.repo}. Recreate the classroom so the team exists, then students can accept.`,
    )
  }

  await addRepositoryToTeam(client, {
    org,
    teamSlug,
    owner: template.owner,
    repo: template.repo,
    permission: "pull",
  })
}

// Grant the template read but never throw: the commit has already landed, so
// a grant failure can't be reported as a failed save. Returns an actionable
// warning on failure (the assignment works except for student accept against
// the private template), or undefined on success. Mirrors teamDeleteWarning.
async function tryGrantTeamTemplateRead(
  client: GitHubClient,
  org: string,
  classroom: string,
  slug: string,
  template: NonNullable<Assignment["template"]>,
): Promise<string | undefined> {
  try {
    await grantTeamTemplateRead(client, org, classroom, slug, template)
    return undefined
  } catch (err) {
    // Log the raw error so a dev-time bug isn't fully hidden behind the
    // user-facing warning string.
    console.error("grantTeamTemplateRead failed (assignment saved):", err)
    const detail = getErrorMessage(err)
    return (
      `Assignment "${slug}" was saved, but granting the classroom team read on ` +
      `the private template ${template.owner}/${template.repo} failed (${detail}). ` +
      `Students can't accept it until the classroom50-${classroom} team is granted ` +
      `read on that repo — grant the team read on ${template.owner}/${template.repo} ` +
      `directly in GitHub (Settings -> Collaborators and teams), then students can accept.`
    )
  }
}

export async function createAssignment(
  client: GitHubClient,
  input: CreateAssignmentInput,
): Promise<CreateAssignmentResult> {
  const { entry: assignmentBody, needsTeamGrant } = await buildAssignmentEntry(
    client,
    input,
  )

  const ref = await getBranchRef(client, input.org)
  const commit = await getCommit(client, input.org, ref.object.sha)

  const assignmentsFilePath = `${input.classroom}/assignments.json`
  const currentAssignments = await getAssignmentsFile(client, {
    org: input.org,
    path: assignmentsFilePath,
    ref: ref.object.sha,
  })

  if (
    currentAssignments.assignments.some(
      (assignment) => assignment.slug === assignmentBody.slug,
    )
  ) {
    throw new Error(`Assignment already exists: ${assignmentBody.slug}`)
  }

  const nextAssignments: AssignmentsFile = {
    ...currentAssignments,
    assignments: [...currentAssignments.assignments, assignmentBody],
  }

  const tree = await createGitTree(client, {
    ...input,
    base_tree: commit.tree.sha,
    tree: [
      {
        path: assignmentsFilePath,
        mode: "100644",
        type: "blob",
        content: JSON.stringify(nextAssignments, null, 2) + "\n",
      },
    ],
  })
  const newCommit = await createGitCommit(client, {
    org: input.org,
    message: `Create assignment: ${input.classroom}/${assignmentBody.slug}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
  })
  const updatedRef = await updateRef(client, input.org, newCommit.sha)

  let templateGrantWarning: string | undefined
  if (needsTeamGrant && assignmentBody.template) {
    templateGrantWarning = await tryGrantTeamTemplateRead(
      client,
      input.org,
      input.classroom,
      input.slug,
      assignmentBody.template,
    )
  }

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.sha,
    newCommitSha: newCommit.sha,
    updatedRef,
    templateGrantWarning,
  }
}

const extractTemplate = (template: string) => {
  if (!/\//.test(template)) return template
  return template.split("/")?.[1] ?? template
}
export async function createAssignmentRepo(params: {
  client: GitHubClient
  templateOwner?: string
  templateRepo?: string
  owner: string
  name: string
  fallbackBranch: string
}): Promise<AcceptRepoCreationResult> {
  const {
    client,
    templateOwner,
    templateRepo,
    owner,
    name,
    fallbackBranch,
  } = params

  const cleanTemplateRepo = templateRepo
    ? extractTemplate(templateRepo)
    : undefined

  if (templateOwner && cleanTemplateRepo) {
    try {
      const repo = await client.request<GitHubRepo>(
        `/repos/${templateOwner}/${cleanTemplateRepo}/generate`,
        {
          method: "POST",
          body: {
            owner,
            name,
            private: true,
            include_all_branches: false,
          },
        },
      )

      return {
        kind: "generated",
        repo,
      }
    } catch (err) {
      if (!(err instanceof GitHubAPIError)) {
        throw err
      }

      if (err.status === 422) {
        const existing = await client.request<GitHubRepo>(
          `/repos/${owner}/${name}`,
        )

        return {
          kind: "already-accepted",
          repo: existing,
        }
      }

      // Template generation failed. Do NOT fall back to an empty repo — that
      // produced broken repos (no template content/shim) that look "accepted"
      // but can't be regenerated. Usual cause: the team lacks read on a private
      // in-org template. 403 = denied; 404 = template not visible.
      if (err.status === 403 || err.status === 404) {
        throw new Error(
          `Couldn't generate your repository from the template ` +
            `${templateOwner}/${cleanTemplateRepo} (HTTP ${err.status}). ` +
            `If it's a private template, the classroom team may not have read ` +
            `access to it yet — ask your instructor to re-run the assignment ` +
            `setup (which grants the team read on the template), then accept again.`,
          { cause: err },
        )
      }

      // Any other status is a real failure too — don't mask it with an empty
      // repo.
      throw err
    }
  }

  // No template specified — create an empty starter repo. auto_init seeds the
  // README/initial commit; the metadata + shim land in the downstream tree
  // commit (see provisionAcceptedRepo), together in one commit.
  return await createEmptyAssignmentRepo({
    client,
    owner,
    name,
    branch: fallbackBranch,
  })
}

type AcceptRepoCreationResult =
  | {
      kind: "generated"
      repo: GitHubRepo
    }
  | {
      kind: "already-accepted"
      repo: GitHubRepo
    }
  | {
      kind: "fallback-empty"
      repo: GitHubRepo
      branch: string
    }
async function createEmptyAssignmentRepo(params: {
  client: GitHubClient
  owner: string
  name: string
  branch: string
}): Promise<AcceptRepoCreationResult> {
  const { client, owner, name, branch } = params
  let repo: GitHubRepo

  try {
    // metadata + workflow must land in ONE commit so the accept marker and the
    // autograde workflow share the runner's Feedback-PR baseline. auto_init
    // gives us the initial commit to build that single tree commit on; we used
    // to commit .classroom50.yaml alone first, splitting them and skewing the
    // baseline.
    repo = await client.request<GitHubRepo>(`/orgs/${owner}/repos`, {
      method: "POST",
      body: {
        name,
        private: true,
        auto_init: true,
      },
    })
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 422) {
      const existing = await client.request<GitHubRepo>(
        `/repos/${owner}/${name}`,
      )

      return {
        kind: "already-accepted",
        repo: existing,
      }
    }

    throw err
  }

  // Commit onto the repo's real default branch (GitHub picks it for an
  // auto_init repo); fall back to the requested branch, then "main".
  const targetBranch = repo.default_branch || branch || "main"

  return {
    kind: "fallback-empty",
    repo: {
      ...repo,
      default_branch: targetBranch,
    },
    branch: targetBranch,
  }
}

export type CreateAssignmentInput = {
  name: string
  description: string
  template_repo: string
  due_date: string
  mode: string
  slug: string
  classroom: string
  org: string
  max_group_size: number
  feedback_pr?: boolean
  runs_on?: string
  container_image?: string
  container_user?: string
  setup_command?: string
  tests: AssignmentTestDraft[]
}
export async function createAssignmentWithConflictRetry(
  client: GitHubClient,
  input: CreateAssignmentInput,
) {
  return withGitConflictRetry(() => createAssignment(client, input))
}

// editAssignment writes to the same classroom50 main branch as createAssignment
// and the roster commits, so a concurrent write 409s non-fast-forward. It
// re-reads the ref + assignments.json each call, so it's safe to retry — mirror
// the create path.
export async function editAssignmentWithConflictRetry(
  client: GitHubClient,
  input: CreateAssignmentInput,
) {
  return withGitConflictRetry(() => editAssignment(client, input))
}

function createClassroom50Yaml(params: {
  classroom: string
  assignment: string
  // The source block lets `gh student submit` re-fetch instructor
  // .gitignore/.github on each push. Omitted for a template-less assignment,
  // matching the CLI (which writes no `source:` block).
  sourceOwner?: string
  sourceRepo?: string
  sourceBranch?: string
}) {
  const { classroom, assignment, sourceOwner, sourceRepo, sourceBranch } =
    params

  const lines = [
    `classroom: ${JSON.stringify(classroom)}`,
    `assignment: ${JSON.stringify(assignment)}`,
  ]
  if (sourceOwner && sourceRepo) {
    lines.push(
      `source:`,
      `  owner: ${JSON.stringify(sourceOwner)}`,
      `  repo: ${JSON.stringify(sourceRepo)}`,
      `  branch: ${JSON.stringify(sourceBranch ?? "main")}`,
    )
  }
  lines.push(``)
  return lines.join("\n")
}

export type DeleteAssignmentInput = {
  org: string
  classroom: string
  assignment: string
}
export async function deleteAssignment(
  client: GitHubClient,
  input: DeleteAssignmentInput,
) {
  const { org, classroom, assignment: slug } = input

  const ref = await getBranchRef(client, org)
  const commit = await getCommit(client, org, ref.object.sha)

  const assignmentsFilePath = `${classroom}/assignments.json`
  const currentAssignments = await getAssignmentsFile(client, {
    org,
    path: assignmentsFilePath,
    ref: ref.object.sha,
  })

  // find the assignment if it exists already
  const targetAssignment = currentAssignments.assignments.find(
    (a) => a.slug === slug,
  )

  if (!targetAssignment) {
    throw new Error(`Existing assignment matching ${slug} was not found.`)
  }

  // expand all but the targeted assignment to filter it out
  const nextAssignments = {
    ...currentAssignments,
    assignments: [
      ...currentAssignments.assignments.filter((a) => a.slug !== slug),
    ],
  }

  const tree = await createGitTree(client, {
    org: input.org,
    base_tree: commit.tree.sha,
    tree: [
      {
        path: assignmentsFilePath,
        mode: "100644",
        type: "blob",
        content: JSON.stringify(nextAssignments, null, 2) + "\n",
      },
    ],
  })

  const newCommit = await createGitCommit(client, {
    org: input.org,
    message: `Edit assignment: ${input.classroom}/${slug}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
  })
  const updatedRef = await updateRef(client, input.org, newCommit.sha)

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.sha,
    newCommitSha: newCommit.sha,
    updatedRef,
  }
}

// Grant the student `admin` (not `maintain`) on their own repo. Intentional and
// CLI-aligned (issue #112): only an admin can manage collaborators for the
// founder-driven group-invite flow (`gh student invite`).
async function addAdminCollaborator(params: {
  client: GitHubClient
  owner: string
  repo: string
  username: string
}) {
  const { client, owner, repo, username } = params

  await client.request(`/repos/${owner}/${repo}/collaborators/${username}`, {
    method: "PUT",
    body: {
      permission: "admin",
    },
  })
}

async function patchRepoSurface(
  client: GitHubClient,
  owner: string,
  repo: string,
) {
  await client.request<GitHubRepo>(`/repos/${owner}/${repo}`, {
    method: "PATCH",
    body: {
      has_issues: false,
      has_projects: false,
      has_wiki: false,
    },
  })
}

function pagesAutograderUrl(org: string, classroom: string, name: string) {
  return `https://${org}.github.io/classroom50/${classroom}/autograders/${name}.yaml`
}

function defaultAutograderWorkflow(org: string) {
  return `name: Autograde

on:
  push:
    branches: [main]
    tags: ["submit/*"]

jobs:
  grade:
    uses: "${org}/classroom50/.github/workflows/autograde-runner.yaml@main"
    permissions:
      contents: write
      statuses: write
      # Lets the runner open the opt-in Feedback PR (issue #86). A reusable
      # workflow's token is the intersection with the caller's grants, so
      # this must mirror autograde-runner.yaml's permissions.
      pull-requests: write
`
}

export async function resolveAutograderWorkflow(
  org: string,
  classroom: string,
  autograder?: string,
): Promise<string> {
  if (!autograder || autograder === "default") {
    return defaultAutograderWorkflow(org)
  }

  const workflow = await fetchTextWithFriendlyErrors(
    pagesAutograderUrl(org, classroom, autograder),
    `autograder ${autograder}`,
  )

  if (!workflow.includes("jobs:")) {
    throw new Error(
      `Autograder ${autograder} may be malformed YAML. Ask your instructor to check the file in the config repo.`,
    )
  }

  return workflow
}

// Synthetic "repo still seeding" error for a 200 read with a blank SHA, so
// withFreshRepoRetry retries instead of letting the blank SHA flow into a Tree
// write that would 404 on an empty base_tree.
function freshRepoNotReadyError(owner: string, repo: string) {
  return new GitHubAPIError({
    status: 409,
    url: `/repos/${owner}/${repo}/git/commits`,
    message: "Git Repository is empty.",
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

// Land .classroom50.yaml + the autograde workflow as one Tree commit, riding out
// GitHub's git-data lag after POST .../generate (reads 404, the first write 409s
// "Git Repository is empty"). The whole read→build→commit→update sequence runs
// inside withFreshRepoRetry, re-reading the ref + parent commit each attempt and
// requiring non-empty SHAs before writing. Safe because the student's
// just-accepted repo has no concurrent writers.
async function commitAcceptFilesWithFreshRepoRetry(params: {
  client: GitHubClient
  owner: string
  repo: string
  branch: string
  metadataYaml: string
  autogradeYaml: string
}) {
  const { client, owner, repo, branch, metadataYaml, autogradeYaml } = params

  await withFreshRepoRetry(async () => {
    const ref = await getBranchRefRepo(client, owner, repo, branch)
    const parentSha = ref.object.sha
    const currentCommit = await getCommitByRepo(client, owner, repo, parentSha)
    const baseTreeSha = currentCommit.tree?.sha

    if (!parentSha || !baseTreeSha) {
      throw freshRepoNotReadyError(owner, repo)
    }

    const tree = await createTreeForAssignment({
      client,
      owner,
      repo,
      baseTreeSha,
      metadataYaml,
      autogradeYaml,
    })

    const commit = await createCommitForAssignment({
      client,
      owner,
      repo,
      // Use ACCEPT_COMMIT_SUBJECT verbatim — the runner matches it to find the
      // Feedback-PR baseline (see the constant).
      message: ACCEPT_COMMIT_SUBJECT,
      treeSha: tree.sha,
      parentSha,
    })

    await updateRefForRepo({
      client,
      owner,
      repo,
      branch,
      commitSha: commit.sha,
    })
  })
}

type AcceptAssignmentResult = {
  status: "created" | "already-accepted"
  repo: GitHubRepo
  cloneCommand: string
}

// Provision a just-created (or partially-provisioned) student repo: patch its
// surface, grant the student admin, and land the .classroom50.yaml + autograde
// shim through GitHub's post-generate lag. Every step is idempotent, so it's
// safe to re-run when healing a repo whose earlier accept failed mid-flow.
async function provisionAcceptedRepo(params: {
  client: GitHubClient
  org: string
  repo: GitHubRepo
  username: string
  branch: string
  metadataYaml: string
  autogradeYaml: string
}) {
  const { client, org, repo, username, branch, metadataYaml, autogradeYaml } =
    params

  await patchRepoSurface(client, org, repo.name)

  await addAdminCollaborator({
    client,
    owner: org,
    repo: repo.name,
    username,
  })

  // Land the metadata + autograde shim, retrying through GitHub's post-generate
  // git-data lag (see commitAcceptFilesWithFreshRepoRetry).
  await commitAcceptFilesWithFreshRepoRetry({
    client,
    owner: org,
    repo: repo.name,
    branch,
    metadataYaml,
    autogradeYaml,
  })
}
export async function acceptAssignment(params: {
  client: GitHubClient
  org: string
  classroom: string
  assignmentSlug: string
}): Promise<AcceptAssignmentResult> {
  const { client, org, classroom, assignmentSlug } = params

  const user = await getAuthenticatedUser(client)
  const username = user.login

  console.log("accepting pending org invite...")
  await acceptPendingOrgInvite(client, org)

  console.log("fetching assignment from pages...")
  const assignment = await fetchAssignmentFromPages(
    org,
    classroom,
    assignmentSlug,
  )

  const sourceOwner = assignment.template?.owner
  const sourceRepo = assignment.template?.repo
  const sourceBranch = assignment.template?.branch ?? "main"

  console.log("resolving autograder workflow...")
  const autogradeYaml = await resolveAutograderWorkflow(
    org,
    classroom,
    assignment.autograder,
  )

  const studentRepoNameValue = studentRepoName(
    classroom,
    assignment.slug,
    username,
  )

  console.log("creating classroom50 yaml...")
  const metadataYaml = createClassroom50Yaml({
    classroom,
    assignment: assignment.slug,
    sourceOwner,
    sourceRepo,
    sourceBranch,
  })

  console.log("creating repo from template...")
  const created = await createAssignmentRepo({
    client,
    templateOwner: sourceOwner,
    templateRepo: sourceRepo,
    owner: org,
    name: studentRepoNameValue,
    fallbackBranch: sourceBranch || "main",
  })

  if (created.kind === "already-accepted") {
    // The repo exists, but a prior accept may have failed AFTER creating it but
    // BEFORE committing the metadata/workflow (seeding lag, transient 5xx),
    // leaving a repo that looks accepted but never autogrades. Heal it: if
    // .classroom50.yaml is missing, re-run the idempotent provisioning;
    // otherwise it's genuinely already accepted — leave it untouched.
    const provisioned = await repoContentsPathExists(
      client,
      org,
      created.repo.name,
      ".classroom50.yaml",
    )

    if (provisioned) {
      return {
        status: "already-accepted",
        repo: created.repo,
        cloneCommand: `git clone ${created.repo.ssh_url}`,
      }
    }

    await provisionAcceptedRepo({
      client,
      org,
      repo: created.repo,
      username,
      branch: created.repo.default_branch || sourceBranch,
      metadataYaml,
      autogradeYaml,
    })

    return {
      status: "already-accepted",
      repo: created.repo,
      cloneCommand: `git clone ${created.repo.ssh_url}`,
    }
  }

  const repo = created.repo

  const targetBranch =
    created.kind === "fallback-empty"
      ? created.branch
      : repo.default_branch || sourceBranch

  await provisionAcceptedRepo({
    client,
    org,
    repo,
    username,
    branch: targetBranch,
    metadataYaml,
    autogradeYaml,
  })

  return {
    status: "created",
    repo,
    cloneCommand: `git clone ${repo.ssh_url}`,
  }
}
