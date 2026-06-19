import type { GitHubClient } from "@/hooks/github/client"
import { GitHubAPIError } from "@/hooks/github/errors"
import type { GitHubMoveBranch } from "@/hooks/github/types"
import { getBranchRef, getCommit } from "../github/queries"
import {
  createCommit,
  createTree,
  updateRef,
  type GitTreeEntry,
} from "@/hooks/github/mutations"
import { boolean, string } from "zod"

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
  name?: string
  classroom: string
  term: string
}
export async function createClassroomFilesWithConflictRetry(
  client: GitHubClient,
  input: CreateClassroomInput,
) {
  return withGitConflictRetry(() => createClassroomFiles(client, input))
}

export type DeleteClassroomInput = {
  org: string
  classroom: string
  branch?: string
}
export async function deleteClassroom(
  client: GitHubClient,
  input: DeleteClassroomInput,
) {
  const { org, classroom, branch = "main" } = input
  const prefix = `${classroom}/`

  const ref = await getBranchRef(client, org, branch)
  const commit = await getCommit(client, org, ref.object.sha)

  const currentTree = await client.request<{
    tree: Array<{
      path: string
      mode: string
      type: "blob" | "tree" | "commit"
      sha: string
    }>
    truncated: boolean
  }>(`/repos/${org}/classroom50/git/trees/${commit.tree.sha}?recursive=1`)

  if (currentTree.truncated) {
    throw new Error(
      "Tree is truncated; refusing to delete because not all classroom files were visible.",
    )
  }

  const entriesToDelete: GitTreeEntry[] = currentTree.tree
    .filter((entry) => entry.type === "blob")
    .filter(
      (entry) => entry.path === classroom || entry.path.startsWith(prefix),
    )
    .map((entry) => ({
      path: entry.path,
      mode: entry.mode,
      type: "blob",
      sha: null,
    }))

  if (entriesToDelete.length === 0) {
    return {
      deleted: false,
      reason: `No files found under ${prefix}`,
    }
  }

  const newTree = await client.request<{
    sha: string
  }>(`/repos/${org}/classroom50/git/trees`, {
    method: "POST",
    body: {
      base_tree: commit.tree.sha,
      tree: entriesToDelete,
    },
  })

  const newCommit = await client.request<{
    sha: string
  }>(`/repos/${org}/classroom50/git/commits`, {
    method: "POST",
    body: {
      message: `Delete classroom ${classroom}`,
      tree: newTree.sha,
      parents: [commit.sha],
    },
  })

  await client.request(`/repos/${org}/classroom50/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: {
      sha: newCommit.sha,
      force: false,
    },
  })

  return {
    deleted: true,
    classroom,
    deletedPaths: entriesToDelete.map((entry) => entry.path),
    previousCommitSha: commit.sha,
    newTreeSha: newTree.sha,
    newCommitSha: newCommit.sha,
  }
}
