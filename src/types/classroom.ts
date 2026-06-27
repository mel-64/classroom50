export type Classroom = {
  path: string
  active: boolean
  term: string
  name: string
  short_name: string
  org: string
  // Per-classroom GitHub team granting rostered students read on private org
  // templates. Absent on classrooms created before this feature.
  team?: {
    id: number
    slug: string
  }
  // Optional capability-URL secret. When present, this classroom's Pages
  // resources live under `<classroom>/<secret>/...` (every consumer inserts it);
  // when absent, the plain `<classroom>/...` path. Opt-in per classroom (off by
  // default). Kept in lockstep with the CLI's classroom-v1 schema (`[a-z0-9]{4,64}`).
  secret?: string
  // How reconciliation disposes of a student's onboarding repo once folded into
  // the roster. GUI-managed (like `secret`); absent -> default "delete".
  // "delete" removes it (needs delete_repo scope; falls back to archive + a
  // warning when missing), "archive" hides it reversibly, "keep" leaves it.
  onboarding_cleanup?: OnboardingCleanupMode
}

export type OnboardingCleanupMode = "delete" | "archive" | "keep"

export const DEFAULT_ONBOARDING_CLEANUP: OnboardingCleanupMode = "delete"

// Inclusive bounds for a group assignment's max_group_size (owner included).
// The CLI schema enforces the same range; an out-of-range value makes
// assignments.json unparseable, so form and mutation layer both clamp/guard.
export const GROUP_SIZE_MIN = 2
export const GROUP_SIZE_MAX = 100

// Mirrors one entry of classroom50/assignments/v1 — the shape gh-teacher writes
// and parses strictly (unknown fields rejected).
// Schema: https://github.com/foundation50/classroom50/blob/main/schemas/assignments-v1.schema.json
export type Assignment = {
  slug: string
  name: string
  description?: string
  // Optional starter-code repo. Omitted for a template-less assignment, where
  // the accept flow creates an empty repo with only the autograder shim.
  template?: {
    owner: string
    repo: string
    branch: string
  }
  due?: string
  due_meta?: DueMeta
  mode: string
  autograder: string
  max_group_size?: number
  feedback_pr?: boolean
  runtime?: {
    "runs-on"?: string | string[]
    container?: {
      image: string
      user?: string
    }
  }
  // Ordered .gitignore-style allowlist (last match wins, `!` re-includes).
  // Empty/absent = all files allowed. Enforced server-side.
  allowed_files?: string[]
  tests?: AssignmentTest[]
}

// Write-side provenance for `due`. Since `due` is stored as a UTC instant
// (losing wall-clock and offset), this records what was supplied. `zone` is set
// only for auto-detected offsets.
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

// Lifecycle for an enrolment. "invited" (invite sent, no GitHub identity bound
// yet — incl. self-reported-but-unconfirmed), "enrolled" (identity bound and
// confirmed). Legacy rows ("") are treated as enrolled when they have a
// github_id, else invited.
//
// CLI coupling: students.csv is a data contract shared with the gh-teacher CLI
// (separate repo). "reconciled"/"reconciled_at" were renamed to "enrolled"/
// "enrolled_at" with intentionally NO back-compat; the CLI must move in lockstep
// (foundation50/classroom50-cli#195).
export type EnrollmentStatus = "invited" | "enrolled" | ""

// How the student was added: "github" (by username, already has github_id +
// team access) or "email" (identity resolved later via onboarding). "" on
// legacy rows. A UI/analytics hint only; reconcile matches each self-report's
// YAML back to a row (invite_token, then github_id, then email), not by method.
export type EnrollmentMethod = "github" | "email" | ""

export type Student = {
  username: string
  first_name: string
  last_name: string
  email: string
  section: string
  github_id: string
  // Email-first onboarding columns (added after the original 6). Optional so
  // legacy CSVs stay valid; the CSV layer defaults them to "".
  enrollment_status?: EnrollmentStatus
  enrollment_method?: EnrollmentMethod
  // Cached emailHash(email): a stable key reconcile uses to match a self-report
  // back to this row by email (fallback after invite_token and github_id).
  email_hash?: string
  // Per-student secure-link invite token, minted by default for every row. If
  // the student onboards via that link, it's written into the self-report YAML
  // and is reconcile's strongest match key; it never names the onboarding repo.
  invite_token?: string
  invited_at?: string
  // UTC instant reconcile bound a GitHub identity into this row
  // (enrollment_status -> "enrolled"). Empty until then.
  enrolled_at?: string
}
