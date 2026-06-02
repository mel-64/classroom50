import type { GitHubClient } from "./client"
import {
  type GitHubCreateTree,
  type GitHubCreateCommit,
  type GitHubMoveBranch,
  GitHubTeam,
} from "./types"
import { GitHubAPIError } from "./errors"
import {
  getAssignmentsFile,
  getBranchRef,
  getCommit,
  type AssignmentsFile,
} from "./queries"
import type { AssignmentTest } from "@/types/classroom"

const ASSIGNMENTS_TEMPLATE = {
  schema: "classroom50/assignments/v1",
  assignments: [],
}
const createClassroomMetadata = (
  org: string,
  classroom: string,
  name: string,
  term: string,
) => ({
  schema: "classroom50/classroom/v1",
  name,
  short_name: classroom,
  term,
  org,
})

const STUDENTS_CSV_HEADER =
  "username,first_name,last_name,email,section,github_id\n"
const createClassroomBody = (
  base_tree: string,
  org: string,
  classroom: string,
  name: string,
  term: string,
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
            submissions: "{}",
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
          createClassroomMetadata(org, classroom, name, term),
          null,
          2,
        ),
      },
    ],
  }
}

export function createTree(
  client: GitHubClient,
  input: CreateClassroomInput & { base_tree: string; term: string },
) {
  const { base_tree, org, classroom, name, term } = input
  return client.request<GitHubCreateTree>(
    `/repos/${org}/classroom50/git/trees`,
    {
      method: "POST",
      body: createClassroomBody(base_tree, org, classroom, name, term),
    },
  )
}

export function createCommit(
  client: GitHubClient,
  input: CreateClassroomInput & { parents: [string]; tree_sha: string },
) {
  const { classroom, tree_sha, org, parents } = input
  return client.request<GitHubCreateCommit>(
    `/repos/${org}/classroom50/git/commits`,
    {
      method: "POST",
      body: {
        message: `Create init files for new classroom: ${classroom}`,
        tree: tree_sha,
        parents,
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

export type CreateClassroomResult = {
  previousCommitSha: string
  baseTreeSha: string
  newTreeSha: string
  newCommitSha: string
  updatedRef: GitHubMoveBranch
}
export async function createClassroomFiles(
  client: GitHubClient,
  input: CreateClassroomInput,
): Promise<CreateClassroomResult> {
  const ref = await getBranchRef(client, input.org)
  const commit = await getCommit(client, input.org, ref.object.sha)
  const tree = await createTree(client, {
    ...input,
    base_tree: commit.tree.sha,
    term: input.term,
  })
  const newCommit = await createCommit(client, {
    ...input,
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

export async function withGitConflictRetry<T>(
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 409) {
      return fn()
    }

    throw err
  }
}

export type CreateClassroomInput = {
  org: string
  name: string
  classroom: string
  term: string
}
export async function createClassroomFilesWithConflictRetry(
  client: GitHubClient,
  input: CreateClassroomInput,
) {
  return withGitConflictRetry(() => createClassroomFiles(client, input))
}

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

export type CreateAssignmentResult = CreateClassroomResult
export async function createAssignment(
  client: GitHubClient,
  input: CreateAssignmentInput,
): Promise<CreateAssignmentResult> {
  const ref = await getBranchRef(client, input.org)
  const commit = await getCommit(client, input.org, ref.object.sha)

  const assignmentsFilePath = `${input.classroom}/assignments.json`
  const currentAssignments = await getAssignmentsFile(client, {
    org: input.org,
    path: assignmentsFilePath,
    ref: "main",
  })

  const assignmentBody = {
    slug: input.slug,
    name: input.name,
    description: input.description,
    template: {
      owner: input.org,
      repo: input.template_repo,
      branch: "main",
    },
    mode: input.mode,
    tests: input.tests,
    max_group_size: input.max_group_size,
    autograder: "",
    runtime: {
      container: {
        image: "",
        user: "",
      },
    },
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
  tests: AssignmentTest[]
}
export async function createAssignmentWithConflictRetry(
  client: GitHubClient,
  input: CreateAssignmentInput,
) {
  return withGitConflictRetry(() => createAssignment(client, input))
}

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

export function inviteUserToOrgTeam(
  client: GitHubClient,
  input: {
    org: string
    invitee_id?: number
    email?: string
    team_ids: number[]
  },
) {
  const { org, ...body } = input

  return client.request(`/orgs/${org}/invitations`, {
    method: "POST",
    body: {
      role: "direct_member",
      ...body,
    },
  })
}
