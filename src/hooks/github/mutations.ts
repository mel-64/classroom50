import type { GitHubClient } from "./client"
import type {
  GitHubCreateTree,
  GitHubCreateCommit,
  GitHubMoveBranch,
} from "./types"
import { GitHubAPIError } from "./errors"
import { getBranchRef, getCommit } from "./queries"

const ASSIGNMENTS_TEMPLATE = {
  schema: "classroom50/assignments/v1",
  assignments: [],
}
const createClassroomMetadata = (
  org: string,
  classroom: string,
  name: string,
) => ({
  schema: "classroom50/classroom/v1",
  name,
  classroom,
  term: "",
  org,
})

const STUDENTS_CSV_HEADER =
  "username,first_name,last_name,email,section,github_id\n"
const createClassroomBody = (
  base_tree: string,
  org: string,
  classroom: string,
  name: string,
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
        content: JSON.stringify(ASSIGNMENTS_TEMPLATE),
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
        content: JSON.stringify({
          schema: "classroom50/scores/v1",
          submissions: "{}",
        }),
      },
      {
        path: `${classroom}/classroom.json`,
        mode,
        type,
        content: JSON.stringify(createClassroomMetadata(org, classroom, name)),
      },
    ],
  }
}

export function createTree(client: GitHubClient, input: CreateClassroomInput) {
  const { base_tree, org, classroom, name } = input
  return client.request<GitHubCreateTree>(
    `/repos/${org}/classroom50/git/trees`,
    {
      method: "POST",
      body: createClassroomBody(base_tree, org, classroom, name),
    },
  )
}

export function createCommit(
  client: GitHubClient,
  input: CreateClassroomInput,
) {
  const { classroom, current_commit, tree_sha, org } = input
  return client.request<GitHubCreateCommit>(
    `/repos/${org}/classroom50/git/commits`,
    {
      method: "POST",
      body: {
        message: `Create init files for new classroom: ${classroom}`,
        tree: tree_sha,
        parents: [current_commit],
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
  })
  const newCommit = await createCommit(client, {
    ...input,
    tree_sha: tree.tree.sha,
    parents: [ref.object.sha],
  })
  const updatedRef = await updateRef(client, input.org, newCommit.commit.sha)

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.tree.sha,
    newCommitSha: newCommit.commit.sha,
    updatedRef,
  }
}

export type CreateClassroomInput = {
  org: string
  name: string
  classroom: string
  base_tree: string
  current_commit: string
  tree_sha: string
  parents: string[]
}
export async function createClassroomFilesWithConflictRetry(
  client: GitHubClient,
  input: CreateClassroomInput,
): Promise<CreateClassroomResult> {
  try {
    return await createClassroomFiles(client, input)
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 409) {
      return createClassroomFiles(client, input)
    }

    throw err
  }
}
