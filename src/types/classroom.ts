export type Classroom = {
  path: string
  active: boolean
  term: string
  name: string
  short_name: string
  org: string
  // Per-classroom GitHub team { id, slug } granting rostered students read on
  // private org templates. Written at classroom creation; absent on
  // classrooms created before this feature.
  team?: {
    id: number
    slug: string
  }
  // Optional capability-URL secret. When present, this classroom's published
  // Pages resources live under `<classroom>/<secret>/...` and every consumer
  // (this GUI, the student CLI, the autograde runner) inserts it; when
  // absent, resources live at the plain `<classroom>/...` path. Opt-in per
  // classroom (off by default), so omitted on unprotected classrooms. Kept
  // in lockstep with the CLI's classroom-v1 schema (`[a-z0-9]{4,64}`).
  secret?: string
  // How the teacher's onboarding reconciliation disposes of a student's
  // onboarding repo once its identity is folded into the roster. GUI-managed
  // (like `secret`), absent on classrooms created before this feature ->
  // treated as the default "delete". "delete" removes the repo (needs
  // delete_repo scope, requested by default; falls back to archive + a warning
  // for an older session that lacks it), "archive" hides it reversibly, "keep"
  // leaves it untouched.
  onboarding_cleanup?: OnboardingCleanupMode
}

export type OnboardingCleanupMode = "delete" | "archive" | "keep"

export const DEFAULT_ONBOARDING_CLEANUP: OnboardingCleanupMode = "delete"

// Inclusive bounds for a group assignment's max_group_size (owner included).
// The CLI schema enforces the same range; an out-of-range value makes
// assignments.json unparseable, so the form and mutation layer both clamp/guard
// against these.
export const GROUP_SIZE_MIN = 2
export const GROUP_SIZE_MAX = 100

// Mirrors one entry of classroom50/assignments/v1 — the shape gh-teacher
// writes and parses (strictly: unknown fields are rejected by the CLI).
// Schema: https://github.com/foundation50/classroom50/blob/main/schemas/assignments-v1.schema.json
export type Assignment = {
  slug: string
  name: string
  description?: string
  // Optional starter-code repo. Omitted for a template-less assignment, where
  // `gh student accept` (and the GUI accept flow) creates an empty repo
  // carrying only the autograder shim. Mirrors the CLI's optional --template.
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
  // Empty/absent = all files allowed. Authored here; enforced server-side.
  allowed_files?: string[]
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

// Lifecycle for an enrolment. A row may exist before the GitHub account is
// known: "invited" (invite sent, no GitHub identity bound yet — covers a
// student who has self-reported via onboarding but not yet been confirmed),
// "enrolled" (username/github_id bound into this row and confirmed by the
// teacher). Legacy rows (pre-feature) carry "" and are treated as already
// enrolled when they have a github_id, else as invited.
//
// CLI coupling: students.csv is a data contract shared with the gh-teacher CLI
// (a separate repo). This value was renamed "reconciled" -> "enrolled" and the
// column "reconciled_at" -> "enrolled_at"; there is intentionally NO back-compat
// for the old names, so the CLI must be updated to the new schema in lockstep
// (tracked in foundation50/classroom50-cli#195).
export type EnrollmentStatus = "invited" | "enrolled" | ""

// How the student was added to the roster: "github" (added by GitHub username,
// already has github_id + team access) or "email" (invited by email, identity
// resolved later via onboarding). "" on legacy rows. A hint for UI/analytics;
// reconcile no longer looks the onboarding repo up by this method — it lists
// the onboarding repos and matches each self-report's YAML payload back to a
// row (by invite_token, then github_id, then email).
export type EnrollmentMethod = "github" | "email" | ""

export type Student = {
  username: string
  first_name: string
  last_name: string
  email: string
  section: string
  github_id: string
  // Email-first onboarding columns (added after the original 6). Optional in
  // the type so legacy CSVs and existing callers stay valid; the CSV layer
  // defaults them to "".
  enrollment_status?: EnrollmentStatus
  enrollment_method?: EnrollmentMethod
  // Cached emailHash(email): a stable key the teacher reconcile uses to match a
  // student's onboarding self-report back to this row by email (the fallback
  // after invite_token and github_id).
  email_hash?: string
  // Per-student secure-link invite token. Minted by default for every row so a
  // unique secure onboarding link always exists. If the student onboards via
  // that link, the token is written into the self-report YAML and is
  // reconcile's strongest match key; it never names the onboarding repo.
  invite_token?: string
  invited_at?: string
  // UTC instant the teacher's reconcile bound a GitHub identity into this row
  // (enrollment_status -> "enrolled"). Empty until then.
  enrolled_at?: string
}
