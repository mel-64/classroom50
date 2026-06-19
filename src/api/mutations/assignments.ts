import type { GitHubClient } from "@/hooks/github/client"
import type { Assignment } from "@/types/classroom"
import { getBranchRef, getCommit } from "../github/queries"
import { GitHubAPIError } from "@/hooks/github/errors"

import type { AssignmentTestDraft } from "@/util/assignmentTests"
import { draftToTest } from "@/util/assignmentTests"
import { buildDueFields } from "@/util/formatDate"
import {
  createGitCommit,
  createGitTree,
  updateRef,
} from "@/hooks/github/mutations"
import {
  getAssignmentsFile,
  type AssignmentsFile,
} from "../queries/assignments"
import { withGitConflictRetry, type CreateClassroomResult } from "./classrooms"

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
