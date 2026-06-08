import type { GitHubClient } from "./client"
import {
  type GitHubCreateTree,
  type GitHubCreateCommit,
  type GitHubMoveBranch,
  type GitHubTeam,
  type GitHubRepo,
  type GitHubUser,
} from "./types"
import { GitHubAPIError } from "./errors"
import {
  getAssignmentsFile,
  getRawFile,
  getBranchRef,
  getCommit,
  type AssignmentsFile,
  getUser,
  getCommitByRepo,
  waitForBranchRefRepo,
  fetchTextWithFriendlyErrors,
  fetchAssignmentFromPages,
  getRepo,
} from "./queries"
import type { Assignment, AssignmentTest } from "@/types/classroom"
import Papa from "papaparse"

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
    due_date: input.due_date,
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

export type AddStudentToClassroomResult = CreateClassroomResult & {
  student: StudentCsvRow
}

const STUDENT_CSV_FIELDS = [
  "username",
  "first_name",
  "last_name",
  "email",
  "section",
  "github_id",
] as const
type StudentCsvField = (typeof STUDENT_CSV_FIELDS)[number]

export type StudentCsvRow = Record<StudentCsvField, string>

function normalizeStudentRow(
  row: Partial<Record<StudentCsvField, unknown>>,
): StudentCsvRow {
  return {
    username: String(row.username ?? "").trim(),
    first_name: String(row.first_name ?? "").trim(),
    last_name: String(row.last_name ?? "").trim(),
    email: String(row.email ?? "").trim(),
    section: String(row.section ?? "").trim(),
    github_id: String(row.github_id ?? "").trim(),
  }
}

function splitGitHubDisplayName(name: string | null) {
  if (!name?.trim()) {
    return { first_name: "", last_name: "" }
  }

  const parts = name.trim().split(/\s+/)
  const first_name = parts[0] ?? ""
  const last_name = parts.slice(1).join(" ")

  return { first_name, last_name }
}

function parseStudentsCsv(csv: string): StudentCsvRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    delimiter: ",",
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  })

  const fatalErrors = parsed.errors.filter(
    (error) => error.type !== "Delimiter",
  )

  if (fatalErrors.length > 0) {
    throw new Error(
      `Could not parse students.csv: ${parsed.errors
        .map((error) => error.message)
        .join("; ")}`,
    )
  }

  return parsed.data
    .map((row) => normalizeStudentRow(row))
    .filter((row) => row.username || row.github_id)
}

function stringifyStudentsCsv(rows: StudentCsvRow[]) {
  const normalizedRows = rows
    .map((row) => normalizeStudentRow(row))
    .filter((row) => row.username || row.github_id)

  return (
    Papa.unparse(normalizedRows, {
      columns: [...STUDENT_CSV_FIELDS],
      delimiter: ",",
      header: true,
      newline: "\n",
    }) + "\n"
  )
}

export async function addStudentToClassroom(
  client: GitHubClient,
  input: AddStudentToClassroomInput,
): Promise<AddStudentToClassroomResult> {
  const normalizedUsername = input.username.trim()

  if (!normalizedUsername) {
    throw new Error("GitHub username is required")
  }

  const ref = await getBranchRef(client, input.org)
  const commit = await getCommit(client, input.org, ref.object.sha)

  const studentsFilePath = `${input.classroom}/students.csv`

  const currentCsv = await getRawFile(client, {
    org: input.org,
    path: studentsFilePath,
    ref: ref.object.sha,
  })

  const githubUser = await getUser(client, normalizedUsername)
  const currentStudents = parseStudentsCsv(currentCsv)

  const alreadyExists = currentStudents.some(
    (student) =>
      student.username.toLowerCase() === githubUser.login.toLowerCase() ||
      student.github_id === String(githubUser.id),
  )

  if (alreadyExists) {
    throw new Error(`Student already exists: ${githubUser.login}`)
  }

  const nameParts = splitGitHubDisplayName(githubUser.name)

  const student: StudentCsvRow = {
    username: githubUser.login,
    first_name: input.first_name?.trim() ?? nameParts.first_name,
    last_name: input.last_name?.trim() ?? nameParts.last_name,
    email: input.email?.trim() ?? githubUser.email ?? "",
    section: input.section?.trim() ?? "",
    github_id: String(githubUser.id),
  }

  const nextStudents = [...currentStudents, student]
  const nextCsv = stringifyStudentsCsv(nextStudents)

  const tree = await createGitTree(client, {
    org: input.org,
    base_tree: commit.tree.sha,
    tree: [
      {
        path: studentsFilePath,
        mode: "100644",
        type: "blob",
        content: nextCsv,
      },
    ],
  })

  const newCommit = await createGitCommit(client, {
    org: input.org,
    message: `Add student: ${input.classroom}/${student.username}`,
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
    student,
  }
}

export async function addStudentToClassroomWithConflictRetry(
  client: GitHubClient,
  input: AddStudentToClassroomInput,
) {
  return withGitConflictRetry(() => addStudentToClassroom(client, input))
}

type AddStudentToClassroomInput = {
  org: string
  classroom: string
  username: string

  first_name?: string
  last_name?: string
  email?: string
  section?: string
}
export async function enrollStudentInClassroom(
  client: GitHubClient,
  input: AddStudentToClassroomInput,
) {
  const { org, classroom } = input
  const result = await addStudentToClassroomWithConflictRetry(client, input)

  await addUserToTeam(client, {
    org,
    teamSlug: `classroom50-${classroom}`,
    username: result.student.username,
    role: "member",
  })

  return result
}

type BulkImportProgress = {
  processed: number
  total: number
  message: string
}
export type AddStudentsToClassroomInput = {
  org: string
  classroom: string
  usernames: string[]
  onProgress?: (progress: BulkImportProgress) => void
}

export type AddStudentsToClassroomResult = CreateClassroomResult & {
  addedStudents: StudentCsvRow[]
  skippedStudents: {
    username: string
    reason: "duplicate" | "not_found" | "invalid" | "error"
    message?: string
  }[]
}

export const normalizeGithubUsername = (username: string) => {
  return username.trim().replace(/^@/, "")
}

export const isLikelyGithubUsername = (username: string) => {
  // alphanumeric + hyphens, no hyphens at start or end
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)
}

export async function addStudentsToClassroom(
  client: GitHubClient,
  input: AddStudentsToClassroomInput,
): Promise<AddStudentsToClassroomResult> {
  const normalizedUsernames = Array.from(
    new Map(
      input.usernames
        .map((username) => normalizeGithubUsername(username))
        .filter(Boolean)
        .map((username) => [username.toLowerCase(), username]),
    ).values(),
  )

  if (normalizedUsernames.length === 0) {
    throw new Error("At least one GitHub username is required")
  }

  input.onProgress?.({
    processed: 0,
    total: normalizedUsernames.length,
    message: "Reading current students.csv...",
  })

  const ref = await getBranchRef(client, input.org)
  const commit = await getCommit(client, input.org, ref.object.sha)

  const studentsFilePath = `${input.classroom}/students.csv`

  const currentCsv = await getRawFile(client, {
    org: input.org,
    path: studentsFilePath,
    ref: ref.object.sha,
  })

  const currentStudents = parseStudentsCsv(currentCsv)

  const existingUsernameKeys = new Set(
    currentStudents.map((student) => student.username.toLowerCase()),
  )

  const existingGithubIds = new Set(
    currentStudents.map((student) => student.github_id).filter(Boolean),
  )

  const skippedStudents: AddStudentsToClassroomResult["skippedStudents"] = []
  const addedStudents: StudentCsvRow[] = []

  let processed = 0

  for (const username of normalizedUsernames) {
    input.onProgress?.({
      processed,
      total: normalizedUsernames.length,
      message: `Checking ${username}...`,
    })

    if (!isLikelyGithubUsername(username)) {
      skippedStudents.push({
        username,
        reason: "invalid",
        message: "Invalid GitHub username",
      })

      processed++
      continue
    }

    if (existingUsernameKeys.has(username.toLowerCase())) {
      skippedStudents.push({
        username,
        reason: "duplicate",
        message: "Student is already in students.csv",
      })

      processed++
      continue
    }

    try {
      const githubUser = await getUser(client, username)

      if (existingGithubIds.has(String(githubUser.id))) {
        skippedStudents.push({
          username: githubUser.login,
          reason: "duplicate",
          message: "Student GitHub ID is already in students.csv",
        })

        processed++
        continue
      }

      const nameParts = splitGitHubDisplayName(githubUser.name)

      const student = normalizeStudentRow({
        username: githubUser.login,
        first_name: nameParts.first_name,
        last_name: nameParts.last_name,
        email: githubUser.email ?? "",
        section: "",
        github_id: String(githubUser.id),
      })

      existingUsernameKeys.add(student.username.toLowerCase())
      existingGithubIds.add(student.github_id)
      addedStudents.push(student)
    } catch (err) {
      skippedStudents.push({
        username,
        reason: "not_found",
        message:
          err instanceof Error ? err.message : "Could not fetch GitHub user",
      })
    }

    processed++

    input.onProgress?.({
      processed,
      total: normalizedUsernames.length,
      message: `Checked ${processed} of ${normalizedUsernames.length} usernames...`,
    })
  }

  if (addedStudents.length === 0) {
    throw new Error("No new students to add")
  }

  input.onProgress?.({
    processed,
    total: normalizedUsernames.length,
    message: "Writing students.csv...",
  })

  const nextStudents = [...currentStudents, ...addedStudents]
  const nextCsv = stringifyStudentsCsv(nextStudents)

  const tree = await createGitTree(client, {
    org: input.org,
    base_tree: commit.tree.sha,
    tree: [
      {
        path: studentsFilePath,
        mode: "100644",
        type: "blob",
        content: nextCsv,
      },
    ],
  })

  const newCommit = await createGitCommit(client, {
    org: input.org,
    message: `Add ${addedStudents.length} student ${
      addedStudents.length === 1 ? "" : "s"
    }: ${input.classroom}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
  })

  const updatedRef = await updateRef(client, input.org, newCommit.sha)

  input.onProgress?.({
    processed: normalizedUsernames.length,
    total: normalizedUsernames.length,
    message: "students.csv updated.",
  })

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.sha,
    newCommitSha: newCommit.sha,
    updatedRef,
    addedStudents,
    skippedStudents,
  }
}

export async function addStudentsToClassroomWithConflictRetry(
  client: GitHubClient,
  input: AddStudentsToClassroomInput,
) {
  return withGitConflictRetry(() => addStudentsToClassroom(client, input))
}

export type BulkEnrollStudentsResult = AddStudentsToClassroomResult & {
  teamResults: {
    username: string
    status: "added" | "failed"
    message?: string
  }[]
}

export type BulkImportResult = {
  addedStudents: StudentCsvRow[]
  skippedStudents: {
    username: string
    reason: "duplicate" | "not_found" | "invalid" | "error"
    message?: string
  }[]
  teamResults?: {
    username: string
    status: "added" | "failed"
    message?: string
  }[]
}
export async function bulkEnrollStudentsInClassroom(
  client: GitHubClient,
  input: AddStudentsToClassroomInput,
): Promise<BulkEnrollStudentsResult> {
  const { onProgress, ...bulkInput } = input

  const total = bulkInput.usernames.length

  onProgress?.({
    processed: 0,
    total,
    message: "Reading classroom roster...",
  })

  const addResult = await addStudentsToClassroom(client, {
    ...bulkInput,
    onProgress,
  })

  const teamSlug = `classroom50-${bulkInput.classroom}`

  const teamResults: BulkImportResult["teamResults"] = []

  for (let i = 0; i < addResult.addedStudents.length; i++) {
    const student = addResult.addedStudents[i]

    onProgress?.({
      processed: i,
      total: addResult.addedStudents.length,
      message: `Adding ${student.username} to classroom team...`,
    })

    try {
      await addUserToTeam(client, {
        org: bulkInput.org,
        teamSlug,
        username: student.username,
        role: "member",
      })

      teamResults.push({
        username: student.username,
        status: "added",
      })
    } catch (err) {
      teamResults.push({
        username: student.username,
        status: "failed",
        message:
          err instanceof Error
            ? err.message
            : "Could not add user to classroom team",
      })
    }

    onProgress?.({
      processed: i + 1,
      total: addResult.addedStudents.length,
      message: `Processed ${i + 1} of ${addResult.addedStudents.length} team memberships...`,
    })
  }

  onProgress?.({
    processed: total,
    total,
    message: "Import complete",
  })

  return {
    ...addResult,
    teamResults,
  }
}

export async function acceptPendingOrgInvite(
  client: GitHubClient,
  org: string,
) {
  try {
    await client.request(`/user/memberships/orgs/${org}`, {
      method: "PATCH",
      body: {
        state: "active",
      },
    })
  } catch {
    // ignore
  }
}

function pagesAutograderUrl(org: string, classroom: string, name: string) {
  return `https://${org}.github.io/classroom50/${classroom}/autograders/${name}/yaml`
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

async function createRepoFromTemplate(params: {
  client: GitHubClient
  templateOwner: string
  templateRepo: string
  owner: string
  name: string
}) {
  const { client, templateOwner, templateRepo, owner, name } = params

  try {
    return await client.request<GitHubRepo>(
      `/repos/${templateOwner}/${templateRepo}/generate`,
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
  } catch (err) {
    if (err instanceof GitHubAPIError) {
      if (err.status === 422) {
        const existing = await client.request<GitHubRepo>(
          `/repos/${owner}/${name}`,
        )

        return {
          repo: existing,
          alreadyAccepted: true,
        }
      }

      if (err.status === 404) {
        throw new Error(
          `Template ${templateOwner}/${templateRepo} is not accessible to you. Ask your instructor to make it public or grant your account access.`,
        )
      }

      throw err
    }
  }
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
      permission: "maintain",
    },
  })
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

async function getAuthenticatedUser(client: GitHubClient) {
  return client.request<GitHubUser>("/user")
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

  const sourceOwner = assignment.template.owner
  const sourceRepo = assignment.template.repo
  const sourceBranch = assignment.template.branch ?? "main"

  console.log("resolving autograder workflow...")
  const autogradeYaml = await resolveAutograderWorkflow(
    org,
    classroom,
    assignment.autograder,
  )

  const studentRepoName =
    `${classroom}-${assignment.slug}-${username}`.toLowerCase()

  console.log("creating repo from template...")
  const generated = await createRepoFromTemplate({
    client,
    templateOwner: sourceOwner,
    templateRepo: sourceRepo,
    owner: org,
    name: studentRepoName,
  })

  if (
    generated &&
    "alreadyAccepted" in generated &&
    generated.alreadyAccepted
  ) {
    return {
      status: "already-accepted",
      repo: generated.repo,
      cloneCommand: `git clone ${generated.repo.ssh_url}`,
    }
  }

  const repo = generated as GitHubRepo

  console.log("patching repo surface...")
  await patchRepoSurface(client, org, repo.name)

  console.log("adding maintain collaborator...")
  await addMaintainCollaborator({
    client,
    owner: org,
    repo: repo.name,
    username,
  })

  const targetBranch = repo.default_branch || sourceBranch

  console.log("getting branch ref...")
  const ref = await waitForBranchRefRepo(client, org, repo.name, targetBranch)

  console.log("get commit by repo...")
  const currentCommit = await getCommitByRepo(
    client,
    org,
    repo.name,
    ref.object.sha,
  )

  console.log("creating classroom50 yaml...")
  const metadataYaml = createClassroom50Yaml({
    classroom,
    assignment: assignment.slug,
    sourceOwner,
    sourceRepo,
    sourceBranch,
  })

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

async function tryStep<T>(
  fn: () => Promise<T>,
  options?: { warningCodes: number[] },
) {
  try {
    const data = await fn()
    return { status: "complete" as const, data }
  } catch (err) {
    if (
      err instanceof GitHubAPIError &&
      options?.warningCodes?.some((code) => err.status === code)
    ) {
      return {
        status: "warning" as const,
        message: err.message,
      }
    }

    return {
      status: "error" as const,
      message: (err as any).message ?? "Unknown error",
    }
  }
}

type InitClassroomStep = {
  status: InitStepStatus
  message?: string
  data?: unknown
}
type InitStepStatus =
  | "pending"
  | "running"
  | "complete"
  | "warning"
  | "error"
  | "skipped"

type InitResults = {
  orgDefaults?: InitClassroomStep
  configRepo?: InitClassroomStep
  skeleton?: InitClassroomStep
}

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

export async function findMissingSkeletonFiles(
  client: GitHubClient,
  org: string,
) {}

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

export async function initClassroom50({
  client,
  org,
  collectToken,
  serviceAccountConfirmed,
}: {
  client: GitHubClient
  org: string
  collectToken?: string
  serviceAccountConfirmed: boolean
}) {
  const results: InitResults = {}

  results.orgDefaults = await tryStep(
    () => updateOrgClassroomSafetyDefaults(client, org),
    { warningCodes: [403, 422] },
  )

  results.configRepo = await tryStep(() => ensureClassroom50Repo(client, org))

  results.skeleton = await tryStep(() => ensureSkeletonFiles(client, org))

  results.pages = await tryStep(() => ensurePages(client, org, "classroom50"))

  results.actionsPermissions = await tryStep(() =>
    ensureWorkflowPermissions(client, org, "classroom50"),
  )

  results.reusableWorkflowAccess = await tryStep(() =>
    ensureReusableWorkflowAccess(client, org, "classroom50"),
  )

  results.branchProtection = await tryStep(() =>
    ensureBranchProtection(client, org, "classroom50", "main"),
  )

  if (collectToken) {
    if (!serviceAccountConfirmed) {
      throw new Error("Service account confirmation is required.")
    }

    results.collectToken = await tryStep(() =>
      putRepoSecret(
        client,
        org,
        "classroom50",
        "CLASSROOM50_COLLECT_TOKEN",
        collectToken,
      ),
    )
  }

  return {
    ...results,
    pagesUrl: `https://${org}.github.io/classroom50/`,
  }
}
