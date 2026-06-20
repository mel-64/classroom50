export type Classroom = {
  path: string
  active: boolean
  term: string
  name: string
  short_name: string
  org: string
  // Per-classroom GitHub team { id, slug } that grants rostered students
  // read on private, org-owned assignment templates. Written by classroom
  // creation; absent on classrooms created before this feature.
  team?: {
    id: number
    slug: string
  }
}

// Mirrors one entry of classroom50/assignments/v1 — the shape gh-teacher
// writes and parses (strictly: unknown fields are rejected by the CLI).
// Schema: https://github.com/foundation50/classroom50/blob/main/schemas/assignments-v1.schema.json
export type Assignment = {
  slug: string
  name: string
  description?: string
  template: {
    owner: string
    repo: string
    branch: string
  }
  due?: string
  due_meta?: DueMeta
  mode: string
  autograder: string
  max_group_size?: number
  runtime?: {
    container?: {
      image: string
      user?: string
    }
  }
  tests?: AssignmentTest[]
}

// Write-side provenance for `due`. Since `due` is stored as a UTC instant
// (losing the teacher's wall-clock and offset), this records what was supplied.
// Required: input, offset, source. `zone` is set only for auto-detected offsets.
export type DueMeta = {
  input: string
  zone?: string
  offset: string
  source: "explicit-offset" | "auto-detected" | "migrated"
}

export type AssignmentTestType = "io" | "run" | "python"
export type AssignmentTestComparison = "included" | "exact" | "regex"

// One declarative autograding test (v1 testSpec, kebab-case wire keys).
// `io` compares stdout, `run` checks the exit code, `python` runs pytest.
export type AssignmentTest = {
  name: string
  type: AssignmentTestType
  setup?: string
  run: string
  input?: string
  "input-file"?: string
  expected?: string
  "expected-file"?: string
  comparison?: AssignmentTestComparison
  timeout?: number
  "exit-code"?: number
  points: number
}

export type Student = {
  username: string
  first_name: string
  last_name: string
  email: string
  section: string
  github_id: string
}
