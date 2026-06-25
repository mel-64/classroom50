// Mirrors the authoritative result/v1 schema produced per submission by the
// classroom50 autograder runner (foundation50/classroom50:
// schemas/result-v1.schema.json). The web app is a pure consumer: this is the
// `result.json` asset attached to a submit/* release on the student's repo.
//
// Field names follow the on-disk JSON exactly (note the hyphenated `max-score`
// and `test-name`). Per-test entries allow extra diagnostic fields an
// autograder may attach (e.g. `output`, `message`), preserved verbatim.

export type ResultTest = {
  "test-name": string
  passed: boolean
  score: number
  "max-score": number
  // Optional diagnostic fields an autograder.py may attach.
  output?: string
  message?: string
  [key: string]: unknown
}

export type SubmittedBy = {
  username: string
  id?: number | null
}

export type ResultJson = {
  schema: string
  classroom: string
  assignment: string
  assignment_type: "individual" | "group"
  owner: string
  submission: string
  commit: string
  release: string
  review: string
  datetime: string
  score: number
  "max-score": number
  tests: ResultTest[]
  submitted_by?: SubmittedBy
}
