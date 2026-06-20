import type { GitHubClient } from "@/hooks/github/client"
import type { Assignment } from "@/types/classroom"
import { getBranchRef, getClassroomJson, getCommit } from "../github/queries"
import { GitHubAPIError } from "@/hooks/github/errors"

import type { AssignmentTestDraft } from "@/util/assignmentTests"
import { draftToTest } from "@/util/assignmentTests"
import { buildDueFields } from "@/util/formatDate"
import {
  addRepositoryToTeam,
  createCommitForAssignment,
  createGitCommit,
  createGitTree,
  createTreeForAssignment,
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
  getCommitByRepo,
  getRepo,
  sleep,
  waitForBranchRefRepo,
} from "@/hooks/github/queries"
import { getAuthenticatedUser } from "../queries/users"
import { acceptPendingOrgInvite } from "./users"

// Parse a `--template`-style ref: `<owner>/<repo>` or
// `<owner>/<repo>@<branch>`, or a bare `<repo>` (owner defaults to the
// classroom's org). Mirrors the CLI's parseTemplateRef so the GUI accepts
// the same inputs and writes the same template block.
type ParsedTemplate = { owner: string; repo: string; branch?: string }
function parseTemplateRef(raw: string, defaultOwner: string): ParsedTemplate {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error("Template repository is required.")
  }

  const [ownerRepo, branch, ...extraAt] = trimmed.split("@")
  if (extraAt.length > 0) {
    throw new Error(
      `Invalid template "${raw}": branch contains '@' (expected owner/repo[@branch]).`,
    )
  }
  if (trimmed.includes("@") && !branch) {
    throw new Error(`Invalid template "${raw}": branch is empty after '@'.`)
  }

  const parts = ownerRepo.split("/")
  if (parts.length === 1 && parts[0]) {
    // Bare repo name → owner defaults to the org (the form's hint).
    return { owner: defaultOwner, repo: parts[0], branch: branch || undefined }
  }
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid template "${raw}": expected owner/repo[@branch].`)
  }
  return { owner: parts[0], repo: parts[1], branch: branch || undefined }
}

// Validate and resolve a template ref against GitHub, mirroring the CLI's
// validateTemplateRepo + resolveTemplateBranch: the repo must exist and be
// a template, its default branch fills an omitted @branch, and an
// out-of-org private template is rejected (students could never be granted
// access). Returns the resolved template block plus whether it's an in-org
// private template that needs a classroom-team read grant.
async function resolveTemplate(
  client: GitHubClient,
  org: string,
  parsed: ParsedTemplate,
): Promise<{ template: Assignment["template"]; needsTeamGrant: boolean }> {
  // getRepo returns null on 404 (tolerant), so a missing/invisible template
  // surfaces as null rather than a throw.
  const repo = (await getRepo(client, parsed.owner, parsed.repo)) as
    | (GitHubRepo & { is_template?: boolean; private?: boolean })
    | null
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

// contentsPathExists: 404 -> false, 200 -> true, anything else throws.
async function contentsPathExists(
  client: GitHubClient,
  org: string,
  path: string,
): Promise<boolean> {
  try {
    await client.request(
      `/repos/${org}/classroom50/contents/${path
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
) {
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

  // Build a fully normalized entry from the form input — same path as
  // create — so editing never leaves stray non-schema keys (org, classroom,
  // tests drafts, …) in assignments.json that the CLI would reject.
  const { entry: editedAssignment, needsTeamGrant } =
    await buildAssignmentEntry(client, input)

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

  // If the (possibly changed) template is an in-org private repo, ensure the
  // classroom team can still read it — same grant create applies.
  if (needsTeamGrant) {
    await grantTeamTemplateRead(
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

export type CreateAssignmentResult = CreateClassroomResult

// Assemble the normalized classroom50/assignments/v1 entry from form input,
// resolving + validating the template the way the CLI does. Shared by create
// and edit so both write the exact same schema-valid shape (no stray keys),
// and both apply the in-org-private-template team grant. Returns the entry
// plus whether the resolved template needs a classroom-team read grant.
async function buildAssignmentEntry(
  client: GitHubClient,
  input: CreateAssignmentInput,
): Promise<{ entry: Assignment; needsTeamGrant: boolean }> {
  const userTests = input.tests.map(draftToTest)

  // A setup command (e.g. compile-once) is written as a leading 0-point
  // `run`-type test named "setup" — the CLI-blessed idiom for a
  // pre-grading step (there is no runtime.setup field; the runner runs
  // tests in order and a non-zero exit fails the step). Kept out of the
  // graded point total by using points: 0.
  const setupCommand = input.setup_command?.trim()
  const tests = setupCommand
    ? [
        { name: "setup", type: "run" as const, run: setupCommand, points: 0 },
        ...userTests,
      ]
    : userTests

  if (tests.length > 0) {
    await ensureDeclarativeTestsWritable(
      client,
      input.org,
      input.classroom,
      input.slug,
    )
  }

  // Resolve the template the way the CLI does: parse owner/repo[@branch],
  // confirm it's a template, fill an omitted branch from the repo's default,
  // and reject an out-of-org private template up front.
  const parsedTemplate = parseTemplateRef(input.template_repo, input.org)
  const { template, needsTeamGrant } = await resolveTemplate(
    client,
    input.org,
    parsedTemplate,
  )

  // The entry must match classroom50/assignments/v1 exactly — the CLI
  // parses the file with unknown fields rejected, so stray keys would
  // break `gh teacher` for the whole classroom. Optional fields are
  // omitted (not written empty), the same normalized form the CLI writes.
  const entry: Assignment = {
    slug: input.slug,
    name: input.name,
    template,
    mode: input.mode,
    autograder: "default",
    // Mirrors the CLI's `--feedback-pr` default of true.
    feedback_pr: input.feedback_pr ?? true,
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

  // Runtime overrides (Advanced Settings). Omit the whole block when
  // nothing was set so the runner uses its defaults.
  const runsOn = input.runs_on?.trim()
  const containerImage = input.container_image?.trim()
  const containerUser = input.container_user?.trim()
  const runtime: NonNullable<Assignment["runtime"]> = {}
  if (runsOn) {
    runtime["runs-on"] = runsOn
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
// students can generate from it (mirrors the CLI's assignment add). The
// team slug is read from classroom.json (authoritative); a classroom with
// no team gets an actionable error rather than a 404 against a guess.
async function grantTeamTemplateRead(
  client: GitHubClient,
  org: string,
  classroom: string,
  slug: string,
  template: Assignment["template"],
) {
  let teamSlug: string | undefined
  try {
    const classroomJson = await getClassroomJson(client, { org, classroom })
    teamSlug = classroomJson.team?.slug
  } catch {
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

  if (needsTeamGrant) {
    await grantTeamTemplateRead(
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
  metadataYaml: string
  autogradeYaml: string
}) {
  const {
    client,
    templateOwner,
    templateRepo,
    owner,
    name,
    fallbackBranch,
    metadataYaml,
    autogradeYaml,
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

      // A template WAS specified but generation failed. Do NOT silently
      // fall back to an empty repo — that produced broken repos (missing
      // the template content AND the metadata/shim) that look "accepted"
      // but can never be re-generated. The most common cause for a private
      // in-org template is the classroom team lacking read access (the
      // grant `gh teacher assignment add` / the GUI applies). Surface an
      // actionable error so the teacher fixes access instead of leaving a
      // dead repo behind. 403 = access denied; 404 = template not visible
      // to the actor (a private template the team can't read reads as 404).
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

      // Any other unexpected status is a real failure too — surface it
      // rather than masking it with an empty repo.
      throw err
    }
  }

  // No template was specified — an empty starter repo is the intended
  // outcome here (e.g. a from-scratch assignment), so seed it with the
  // metadata + shim.
  return await createEmptyAssignmentRepo({
    client,
    owner,
    name,
    branch: fallbackBranch,
    metadataYaml,
    autogradeYaml,
  })
}

async function initializeEmptyRepoWithMetadata(params: {
  client: GitHubClient
  owner: string
  repo: string
  branch: string
  metadataYaml: string
}) {
  const { client, owner, repo, branch, metadataYaml } = params

  for (let i = 0; i < 10; i++) {
    try {
      return await client.request(
        `/repos/${owner}/${repo}/contents/.classroom50.yaml`,
        {
          method: "PUT",
          body: {
            message: "Initialize classroom50 assignment",
            content: btoa(unescape(encodeURIComponent(metadataYaml))),
            branch,
          },
        },
      )
    } catch (err) {
      if (
        err instanceof GitHubAPIError &&
        (err.status === 404 || err.status === 409)
      ) {
        await sleep(500)
        continue
      }

      throw err
    }
  }

  throw new Error(`Could not initialize empty repo ${owner}/${repo}.`)
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
  metadataYaml: string
  autogradeYaml: string
}): Promise<AcceptRepoCreationResult> {
  const { client, owner, name, branch, metadataYaml } = params
  let repo: GitHubRepo

  try {
    repo = await client.request<GitHubRepo>(`/orgs/${owner}/repos`, {
      method: "POST",
      body: {
        name,
        private: true,
        auto_init: false,
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

  await initializeEmptyRepoWithMetadata({
    client,
    owner,
    repo: name,
    branch,
    metadataYaml,
  })

  return {
    kind: "fallback-empty",
    repo: {
      ...repo,
      default_branch: branch,
    },
    branch,
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

function createClassroom50Yaml(params: {
  classroom: string
  assignment: string
  sourceOwner: string
  sourceRepo: string
  sourceBranch: string
}) {
  const { classroom, assignment, sourceOwner, sourceRepo, sourceBranch } =
    params

  return [
    `classroom: ${JSON.stringify(classroom)}`,
    `assignment: ${JSON.stringify(assignment)}`,
    `source:`,
    `  owner: ${JSON.stringify(sourceOwner)}`,
    `  repo: ${JSON.stringify(sourceRepo)}`,
    `  branch: ${JSON.stringify(sourceBranch)}`,
    ``,
  ].join("\n")
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

async function addMaintainCollaborator(params: {
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

type AcceptAssignmentResult = {
  status: "created" | "already-accepted"
  repo: GitHubRepo
  cloneCommand: string
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

  const studentRepoName =
    `${classroom}-${assignment.slug}-${username}`.toLowerCase()

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
    name: studentRepoName,
    fallbackBranch: sourceBranch || "main",
    metadataYaml,
    autogradeYaml,
  })

  if (created.kind === "already-accepted") {
    return {
      status: "already-accepted",
      repo: created.repo,
      cloneCommand: `git clone ${created.repo.ssh_url}`,
    }
  }

  const repo = created.repo

  console.log("patching repo surface...")
  await patchRepoSurface(client, org, repo.name)

  console.log("adding maintain collaborator...")
  await addMaintainCollaborator({
    client,
    owner: org,
    repo: repo.name,
    username,
  })

  const targetBranch =
    created.kind === "fallback-empty"
      ? created.branch
      : repo.default_branch || sourceBranch

  console.log("getting branch ref...")
  const ref = await waitForBranchRefRepo(client, org, repo.name, targetBranch)

  console.log("get commit by repo...")
  const currentCommit = await getCommitByRepo(
    client,
    org,
    repo.name,
    ref.object.sha,
  )

  console.log("creating assignment tree...", {
    owner: org,
    repo: repo.name,
    repoFullName: repo.full_name,
    repoDefaultBranch: repo.default_branch,
    targetBranch,
    refSha: ref.object.sha,
    currentCommit,
    baseTreeSha: currentCommit.tree?.sha,
    metadataYaml,
    autogradeYamlPreview: autogradeYaml.slice(0, 200),
  })

  const tree = await createTreeForAssignment({
    client,
    owner: org,
    repo: repo.name,
    baseTreeSha: currentCommit.tree.sha,
    metadataYaml,
    autogradeYaml,
  })

  console.log("creating commit for assignment...")
  const commit = await createCommitForAssignment({
    client,
    owner: org,
    repo: repo.name,
    message: `Accept ${classroom}/${assignment.slug}`,
    treeSha: tree.sha,
    parentSha: ref.object.sha,
  })

  console.log("updating ref for repo...")
  await updateRefForRepo({
    client,
    owner: org,
    repo: repo.name,
    branch: targetBranch,
    commitSha: commit.sha,
  })

  return {
    status: "created",
    repo,
    cloneCommand: `git clone ${repo.ssh_url}`,
  }
}
