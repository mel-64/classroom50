import type { GitHubClient } from "@/hooks/github/client"
import type { Assignment } from "@/types/classroom"
import { getBranchRef, getCommit } from "../github/queries"
import { GitHubAPIError } from "@/hooks/github/errors"

import type { AssignmentTestDraft } from "@/util/assignmentTests"
import { draftToTest } from "@/util/assignmentTests"
import { buildDueFields } from "@/util/formatDate"
import {
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
  sleep,
  waitForBranchRefRepo,
} from "@/hooks/github/queries"
import { getAuthenticatedUser } from "../queries/users"
import { acceptPendingOrgInvite } from "./users"

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

  // find the assignment if it exists already
  const targetAssignment = currentAssignments.assignments.find(
    (a) => a.slug === slug,
  )

  if (!targetAssignment) {
    throw new Error(`Existing assignment matching ${slug} was not found.`)
  }

  // replace the body of the old assignment with new data
  const editedAssignment = { ...targetAssignment, ...input }

  // inject the new assignment in place of the old
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
export async function createAssignment(
  client: GitHubClient,
  input: CreateAssignmentInput,
): Promise<CreateAssignmentResult> {
  const tests = input.tests.map(draftToTest)

  if (tests.length > 0) {
    await ensureDeclarativeTestsWritable(
      client,
      input.org,
      input.classroom,
      input.slug,
    )
  }

  const ref = await getBranchRef(client, input.org)
  const commit = await getCommit(client, input.org, ref.object.sha)

  const assignmentsFilePath = `${input.classroom}/assignments.json`
  const currentAssignments = await getAssignmentsFile(client, {
    org: input.org,
    path: assignmentsFilePath,
    ref: ref.object.sha,
  })

  // The entry must match classroom50/assignments/v1 exactly — the CLI
  // parses the file with unknown fields rejected, so stray keys would
  // break `gh teacher` for the whole classroom. Optional fields are
  // omitted (not written empty), the same normalized form the CLI
  // writes. Schema: schemas/assignments-v1.schema.json in the
  // foundation50/classroom50 repo.
  const assignmentBody: Assignment = {
    slug: input.slug,
    name: input.name,
    template: {
      owner: input.org,
      repo: input.template_repo,
      branch: "main",
    },
    mode: input.mode,
    autograder: "default",
  }
  if (input.description.trim()) {
    assignmentBody.description = input.description.trim()
  }
  if (input.due_date.trim()) {
    const { due, due_meta } = buildDueFields(input.due_date.trim())
    assignmentBody.due = due
    if (due_meta) {
      assignmentBody.due_meta = due_meta
    }
  }
  if (input.mode === "group" && input.max_group_size > 0) {
    assignmentBody.max_group_size = input.max_group_size
  }
  if (tests.length > 0) {
    assignmentBody.tests = tests
  }

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

      if (err.status === 404) {
        throw err
      }

      console.warn(
        `Template ${templateOwner}/${cleanTemplateRepo} was not accessible; creating empty fallback repo.`,
      )
    }
  }

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
