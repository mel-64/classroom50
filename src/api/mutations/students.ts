import Papa from "papaparse"
import type { GitHubClient } from "@/hooks/github/client"
import {
  addUserToTeam,
  createGitCommit,
  createGitTree,
  getErrorMessage,
  removeUserFromTeam,
  updateRef,
} from "@/hooks/github/mutations"
import { withGitConflictRetry, type CreateClassroomResult } from "./classrooms"
import { getRawFile, getUser } from "@/hooks/github/queries"
import { getBranchRef, getClassroomJson, getCommit } from "../github/queries"
import { GitHubAPIError } from "@/hooks/github/errors"
import type { Student } from "@/types/classroom"

// The classroom team slug is authoritative in classroom.json: on a name
// collision GitHub may assign a slug other than `classroom50-<slug>`, so
// re-deriving it can target the wrong team. The derived form is only correct
// when classroom.json genuinely lacks a team block (a read with no `team`, or a
// 404 = pre-feature classroom). A transient read failure is NOT "no team" —
// propagate it so the caller reports an actionable failure instead of silently
// targeting a possibly-wrong slug.
async function resolveClassroomTeamSlug(
  client: GitHubClient,
  org: string,
  classroom: string,
): Promise<string> {
  try {
    const classroomJson = await getClassroomJson(client, { org, classroom })
    if (classroomJson.team?.slug) {
      return classroomJson.team.slug
    }
  } catch (err) {
    // 404 = no classroom.json (pre-feature) is a genuine "no team"; fall
    // through. Anything else is transient and must not be misread as "no team".
    if (!(err instanceof GitHubAPIError && err.isNotFound)) {
      throw err
    }
  }
  return `classroom50-${classroom}`
}

export type AddStudentToClassroomResult = CreateClassroomResult & {
  student: StudentCsvRow
  // Set when the student was added to the roster (committed) but the
  // follow-up team add failed — a non-fatal warning (no private-template read
  // until retried). Mirrors the bulk path's teamResults / teamDeleteWarning.
  teamWarning?: string
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
  // Resolve the slug concurrently with the roster commit. It can reject on a
  // transient read; attach a catch to avoid an unhandled rejection and consume
  // it (rethrowing into the warning path) after the commit lands.
  const teamSlugPromise = resolveClassroomTeamSlug(client, org, classroom)
  teamSlugPromise.catch(() => {})
  const result = await addStudentToClassroomWithConflictRetry(client, input)

  // The roster commit already landed, so any team-side failure — resolving the
  // slug OR the team-add — is a non-fatal warning, not a failed enroll.
  let teamWarning: string | undefined
  try {
    const teamSlug = await teamSlugPromise
    await addUserToTeam(client, {
      org,
      teamSlug,
      username: result.student.username,
      role: "member",
    })
  } catch (err) {
    console.error("team add failed (student enrolled):", err)
    const detail = getErrorMessage(err)
    teamWarning =
      `${result.student.username} was added to the roster, but adding them to ` +
      `the classroom team failed (${detail}); they won't have read on private ` +
      `templates until it's retried.`
  }

  return { ...result, teamWarning }
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

  // Retry on conflict: a concurrent commit during the slow bulk window would
  // 409 the roster commit and discard the whole import. Re-reading is safe —
  // adds are append-only.
  const addResult = await addStudentsToClassroomWithConflictRetry(client, {
    ...bulkInput,
    onProgress,
  })

  // The roster commit already landed. A transient slug-read failure becomes a
  // per-student team failure (the result still reports the committed adds)
  // rather than rejecting the whole bulk enroll.
  let teamSlug: string | undefined
  let teamSlugError: string | undefined
  try {
    teamSlug = await resolveClassroomTeamSlug(
      client,
      bulkInput.org,
      bulkInput.classroom,
    )
  } catch (err) {
    teamSlugError = getErrorMessage(err)
  }

  const teamResults: BulkImportResult["teamResults"] = []

  for (let i = 0; i < addResult.addedStudents.length; i++) {
    const student = addResult.addedStudents[i]

    onProgress?.({
      processed: i,
      total: addResult.addedStudents.length,
      message: `Adding ${student.username} to classroom team...`,
    })

    if (teamSlug === undefined) {
      teamResults.push({
        username: student.username,
        status: "failed",
        message:
          `Could not read the classroom team to add the student` +
          (teamSlugError ? ` (${teamSlugError})` : "") +
          "; retry to add them to the team.",
      })

      onProgress?.({
        processed: i + 1,
        total: addResult.addedStudents.length,
        message: `Processed ${i + 1} of ${addResult.addedStudents.length} team memberships...`,
      })
      continue
    }

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

export type UnenrollStudentInput = {
  org: string
  classroom: string
  student: Student
}
export async function unenrollStudent(
  client: GitHubClient,
  input: UnenrollStudentInput,
) {
  const { org, classroom, student: toRemoveStudent } = input
  const normalizedUsername = toRemoveStudent?.username.trim()

  if (!normalizedUsername) {
    throw new Error("Student's GitHub username is required")
  }

  // Resolve the slug concurrently with the removal commit. It can reject on a
  // transient read; attach a catch and consume it in the warning path below.
  const teamSlugPromise = resolveClassroomTeamSlug(client, org, classroom)
  teamSlugPromise.catch(() => {})

  const ref = await getBranchRef(client, org)
  const commit = await getCommit(client, org, ref.object.sha)

  const studentsFilePath = `${classroom}/students.csv`

  const currentCsv = await getRawFile(client, {
    org,
    path: studentsFilePath,
    ref: ref.object.sha,
  })

  const currentStudents = parseStudentsCsv(currentCsv)

  const exists = currentStudents.some(
    (student) =>
      student.username.toLowerCase() ===
        toRemoveStudent.username.toLowerCase() ||
      student.github_id === String(toRemoveStudent.github_id),
  )

  if (!exists) {
    throw new Error(
      `Student ${toRemoveStudent.username} does not exist in roster!`,
    )
  }

  const nextStudents = [
    ...currentStudents.filter(
      (student) =>
        student.username !== toRemoveStudent.username &&
        student.github_id !== toRemoveStudent.github_id,
    ),
  ]
  const nextCsv = stringifyStudentsCsv(nextStudents)

  const tree = await createGitTree(client, {
    org,
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
    org,
    message: `Remove student: ${classroom}/${toRemoveStudent.username}`,
    tree_sha: tree.sha,
    parents: [ref.object.sha],
  })

  const updatedRef = await updateRef(client, org, newCommit.sha)

  // Symmetric with enroll: drop the student from the classroom team. Idempotent
  // (404 = not a member / team gone); org membership untouched. The commit
  // already landed, so any team-side failure — resolving the slug OR the
  // removal — is a non-fatal warning, not a thrown error.
  let teamWarning: string | undefined
  try {
    const teamSlug = await teamSlugPromise
    await removeUserFromTeam(client, {
      org,
      teamSlug,
      username: normalizedUsername,
    })
  } catch (err) {
    console.error("team removal failed (student unenrolled):", err)
    const detail = getErrorMessage(err)
    teamWarning =
      `${toRemoveStudent.username} was removed from the roster, but removing ` +
      `them from the classroom team failed (${detail}); they may keep read on ` +
      `private templates until it's retried.`
  }

  return {
    previousCommitSha: ref.object.sha,
    baseTreeSha: commit.tree.sha,
    newTreeSha: tree.sha,
    newCommitSha: newCommit.sha,
    updatedRef,
    teamWarning,
  }
}
