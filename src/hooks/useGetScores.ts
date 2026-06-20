import { useQuery } from "@tanstack/react-query"

import { useGitHubClient } from "@/context/github/GitHubProvider"
import { jsonFileQuery } from "./github/queries"

// === Canonical <classroom>/scores.json shape (classroom50/scores/v1) ===
// Written by the CLI's collect_scores.py and described by
// schemas/scores-v1.schema.json in foundation50/classroom50. The GUI is a
// pure consumer of this contract — it does not share code with the CLI, so
// the only thing that must agree is this JSON shape.
//
// scores.json is keyed by assignment slug under `assignments`; each value
// is a bucket `{ type, entries[] }`. An entry is one student repo's
// gradebook record (keyed by repo `owner`) holding the full submission
// history (newest first). Each submission is a result/v1 payload minus the
// bucket-key `assignment`.
type SubmissionRecord = {
  schema: string
  classroom: string
  assignment_type: "individual" | "group"
  owner: string
  submission: string
  commit: string
  release: string
  review: string
  datetime: string
  score: number
  "max-score": number
  tests: unknown[]
  late?: boolean
  submitted_by?: {
    username: string
    id?: number | null
  }
}

type ScoreEntry = {
  owner: string
  member_usernames?: string[]
  submissions: SubmissionRecord[]
  override?: boolean
}

type AssignmentBucket = {
  type: "individual" | "group"
  entries: ScoreEntry[]
}

type ScoresSchema = {
  schema: string
  assignments: Record<string, AssignmentBucket>
}

// The flattened row the submissions UI renders: one row per student repo,
// carrying the latest submission's fields plus a credited-username list and
// the total submission count. Keeping the legacy field names (`usernames`,
// `score`, `datetime`, `commit`, `release`, `review`, `max-score`) lets the
// table/CSV consumers stay simple while we read the new nested shape.
export type SubmissionRow = {
  usernames: string[]
  owner: string
  datetime: string
  commit: string
  release: string
  review: string
  score: number
  "max-score": number
  submissionCount: number
  late?: boolean
}

export type NormalizedScores = {
  schema: string
  submissions: Record<string, SubmissionRow[]>
}

// Collapse a bucket's entries to one row each (latest submission first).
// `member_usernames` credits the whole group; individual entries fall back
// to the sole `owner`. submissions[0] is the newest per the schema, but we
// sort defensively in case a hand-edit reordered them.
function bucketToRows(bucket: AssignmentBucket): SubmissionRow[] {
  return bucket.entries
    .filter((entry) => entry.submissions && entry.submissions.length > 0)
    .map((entry) => {
      const latest = entry.submissions
        .slice()
        .sort((a, b) => (a.datetime < b.datetime ? 1 : -1))[0]

      const usernames =
        entry.member_usernames && entry.member_usernames.length > 0
          ? entry.member_usernames
          : [entry.owner]

      return {
        usernames,
        owner: entry.owner,
        datetime: latest.datetime,
        commit: latest.commit,
        release: latest.release,
        review: latest.review,
        score: latest.score,
        "max-score": latest["max-score"],
        submissionCount: entry.submissions.length,
        late: latest.late,
      }
    })
}

// Map the canonical nested shape to a slug -> rows map. Returns `null` for a
// missing/empty file so callers can distinguish "no data yet" from "no
// submissions".
export function normalizeScores(
  data: ScoresSchema | undefined,
): NormalizedScores | undefined {
  if (!data) return undefined

  const submissions: Record<string, SubmissionRow[]> = {}
  for (const [slug, bucket] of Object.entries(data.assignments ?? {})) {
    submissions[slug] = bucketToRows(bucket)
  }

  return { schema: data.schema, submissions }
}

const useGetScores = (org: string, classroom: string) => {
  const client = useGitHubClient()
  return useQuery({
    ...jsonFileQuery<ScoresSchema>(
      client,
      org,
      "classroom50",
      `${classroom}/scores.json`,
    ),
    select: normalizeScores,
  })
}

export default useGetScores
