# `gh teacher` reference

Complete reference for the teacher CLI. For a step-by-step walkthrough, see the [Teacher Guide](Teacher-Guide).

Run `gh teacher <command> --help` for the live flag list. Errors always go to stderr with a non-zero exit code. Commands that emit informational output accept `--quiet` / `-q` to suppress it; pass `--verbose` / `-v` to see per-step operational details (e.g. raw `git` output during `download`).

## Commands at a glance

| Command | Description |
| --- | --- |
| `gh teacher whoami` | Print the authenticated GitHub user. |
| `gh teacher login` | Log in to GitHub via `gh auth login`, requesting `admin:org` (required for org invites). Pass `-s` to add other scopes. Other commands trigger this same login flow automatically when no token is configured for `github.com`. |
| `gh teacher logout` | Log out of GitHub via `gh auth logout`. |
| `gh teacher invite <org> <user>` | Invite user to an org (use `--admin` for org admin). |
| `gh teacher invite <org>/<repo> <user>` | Invite user to a specific repo. Default permission `push`; override with `-p {pull,triage,push,maintain,admin}`. Re-running updates the collaborator in place. |
| `gh teacher remove <org> <user>` | Remove user from an org. Revokes access to every repo in the org, removes them from all teams, and cancels any pending invitation. Idempotent. |
| `gh teacher remove <org>/<repo> <user>` | Remove user from a single repo. Idempotent. |
| `gh teacher download <org> <classroom> <assignment>` | Roster-driven by default: clone one repo per `<classroom>/students.csv` row, refresh each repo's `result.json` from the latest submit-tag release, and write a `scores.csv` summary at the destination root. Pass `--by-pattern` to skip the roster lookup and clone by name prefix instead. Default destination is `<classroom>-<assignment>_submissions_<YYYY_MM_DD_T_HH_MM_SS>/`; override with `-d`. |
| `gh teacher teardown <org>` | Delete every repo in a Classroom 50 org (development reset). Requires `<org>/classroom50` to exist (the marker repo guards against accidental teardown of non-Classroom orgs); prompts for typed org-name confirmation unless `--yes`; deletes `classroom50` last so an interrupted run stays safe to re-run. Requires the `delete_repo` OAuth scope (opt in once via `gh teacher login -s delete_repo`). |
| `gh teacher init <org>` | Bootstrap `<org>/classroom50` (org member defaults, config repo, Pages, branch protection, collect-token secret). Idempotent. |
| `gh teacher rotate-collect-token <org>` | Replace the `CLASSROOM50_COLLECT_TOKEN` repo secret on an existing config repo. |
| `gh teacher classroom add <org> <short-name>` | Add a new classroom directory to `<org>/classroom50`. Optional flags: `--name "<display name>"`, `--term <e.g. Spring-2026>`. Refuses to overwrite an existing classroom. |
| `gh teacher classroom migrate --source <id-or-org> --target <org>` | Import an existing GitHub Classroom into `<target>/classroom50`. Discovers the source classroom (numeric ID or org login), copies each starter repo into the target org as a fresh template, and commits a populated `<short-name>/` directory in one Tree commit. Optional: `--short-name`, `--term`, `--template-suffix`, `--include-archived`, `--dry-run`. Roster and scores are NOT migrated. |
| `gh teacher roster add <org> <classroom> <username>` | Append or upsert a student in `students.csv`; resolves `github_id`, sends an org invite if needed. Optional flags: `--first-name`, `--last-name`, `--email`, `--section`. |
| `gh teacher roster remove <org> <classroom> <username>` | Remove a row from `students.csv`. Does NOT touch org membership. Idempotent. |
| `gh teacher roster import <org> <classroom> <path-to-csv>` | Bulk upsert from a local CSV (`username,first_name,last_name,email,section` header; trailing `github_id` accepted but ignored). One Tree commit; auto-invites new students. |
| `gh teacher assignment add <org> <classroom> <slug>` | Register or upsert an assignment in `assignments.json`. Required flags: `--name`, `--template`. Optional: `--description`, `--due` (ISO-8601), `--mode` (only `individual` currently supported), `--runtime <path-to-json>` (per-assignment runtime: `runs-on`, language toolchains, apt packages, container image), `--autograder <name>` (default `default`; non-default values reference a sibling shim at `<classroom>/autograders/<name>.yaml`). Per-assignment grading logic is NOT registered here — drop an `autograder.py` (and any sibling fixtures) under `<classroom>/autograders/<slug>/` in the config repo, or set a classroom default with `gh teacher autograder set-default`. |
| `gh teacher autograder set-default <org> <classroom>` | Drop a default `autograder.py` at `<classroom>/autograder.py` in the config repo. With `--from <path>` (or `--from -` for stdin), uploads the given Python source. Without `--from`, installs a diagnostic stub that echoes runner metadata and emits a vacuous-pass `result.json` — useful for verifying the runner pipeline before authoring real grading logic. |
| `gh teacher assignment remove <org> <classroom> <slug>` | Drop an assignment entry from `assignments.json`. Does NOT touch existing student repos. Idempotent. |
| `gh teacher assignment list <org> <classroom>` | Print every assignment slug registered in `assignments.json`, one per line on stdout. Pass `--json` for the full entries array, `-q` to suppress the stderr summary. Read-only. |

## `gh teacher init`

One-shot bootstrap for the per-org `classroom50` config repo. See the [Teacher Guide](Teacher-Guide) for when to run it in your workflow.

```sh
CLASSROOM50_COLLECT_TOKEN=github_pat_... gh teacher init <org>
gh teacher init <org>                              # interactive token prompt
gh teacher init <org> --service-account-confirm    # silence service-account reminder
```

Performs these steps in order:

1. **Org plan check** — `GET /orgs/{org}`; warns when the org is not on Team or Enterprise Cloud (Pages from a private repo). Advisory only.
2. **Tighten org member defaults** — single `PATCH /orgs/{org}` setting `default_repository_permission: "none"` (new members don't get implicit read access to other repos in the org — existing members and their established access are unaffected) and `members_can_create_public_repositories: false` (prevents members from accidentally publishing student work). Idempotent — re-runs on an already-tightened org are no-ops. 403/422 (enterprise-locked policy) → warn-and-continue with a link to `https://github.com/organizations/{org}/settings/member_privileges` for manual setup; init still completes.
3. **Create or fetch repo** — `POST /orgs/{org}/repos` with `auto_init: true` for `classroom50`. On 422 (name taken), falls back to `GET /repos/{org}/classroom50`. The default branch from the response flows through to later steps (org policy can rename `main`).
4. **Skeleton drop** — single Tree commit of embedded files (`.github/workflows/`, `.github/scripts/`, `README.md`). Re-runs detect `.github/workflows/publish-pages.yaml` and skip without overwriting teacher edits. `publish-pages.yaml` is templated with the org's actual default branch at commit time.
5. **Enable Pages** — `POST .../pages` with `build_type: workflow`; 409 = already enabled. Followed by `PUT .../pages` with `{"public": true}` so the published content is reachable unauthenticated: the student CLIs fetch `assignments.json` (and a non-default `--autograder` shim, when registered); the runner workflow fetches `assignments.json`, `runner.py`, the per-classroom `<classroom>/autograder.py` (when set), and per-assignment bundles. The visibility step is warn-and-continue if the API rejects it (rare org policy), with a manual `Settings → Pages → Visibility` toggle as the recovery path.
6. **Branch protection** — no force pushes or branch deletion on the default branch.
7. **Workflow permissions** — raises default `GITHUB_TOKEN` to `write`. HTTP 409 (org-enforced policy) is tolerated; skeleton workflows declare workflow-level `permissions:` blocks.
8. **Reusable-workflow access** — `PUT .../actions/permissions/access` with `access_level: organization` so student-repo shims can `uses:` the autograde-runner workflow. 403/409 is warn-and-continue with manual recovery instructions.
9. **Collect token** — reads `CLASSROOM50_COLLECT_TOKEN` from env (trimmed), piped stdin, or hidden TTY prompt; libsodium sealbox-encrypts and uploads as a repo-level Actions secret.

**Collect token requirements:** fine-grained PAT with `Contents: read` on org repos matching `<classroom>-*`. No CLI flag for the value. Prefer an org-owned service account.

**Skeleton shipped:**

| Path | Status |
| --- | --- |
| `.github/workflows/publish-pages.yaml` | Working allow-list Pages publisher |
| `.github/workflows/collect-scores.yaml` | Working `workflow_dispatch` + nightly cron |
| `.github/workflows/autograde-runner.yaml` | Reusable workflow called by every student-repo autograde shim |
| `.github/scripts/runner.py` | Runner-side bootstrap fetched from Pages on every submission. Downloads the per-assignment bundle, resolves the entrypoint (per-assignment `autograder.py` if present, otherwise the classroom default at `<classroom>/autograder.py`, otherwise a vacuous-pass synthesis), execs it, and validates the v1 `result.json` it produces. Teachers don't normally edit this file — grading logic lives in `autograder.py`. |
| `.github/scripts/collect_scores.py` | Working roster-driven score collector. Walks `(student, assignment)` pairs from `<classroom>/students.csv` x `assignments.json`, hits each `<classroom>-<assignment>-<username>` repo's `releases/latest` endpoint, downloads + schema-validates `result.json`, and upserts it into `<classroom>/scores.json` under that assignment's bucket -- `submissions` is keyed by assignment slug, and the redundant `assignment` field is dropped from each stored row (`override:true` respected, atomic per-classroom write). Per-assignment "X of Y submitted" summary on stdout. |
| `README.md` | Describes the config repo layout |

Score collection is **pull-based** and **roster-driven**: the collect workflow reads `<classroom>/students.csv` × `assignments.json`, computes the canonical repo name for each pair, and asks GitHub for that repo's latest release. A 404 means the student hasn't accepted or submitted yet (no error — just a gap in the "X of Y submitted" report). No org-repo enumeration, no longest-slug-wins disambiguation, no cross-repo write PAT or `repository_dispatch` from student repos.

## `gh teacher rotate-collect-token`

Re-runs only the collect-token step of `init` — replaces the `CLASSROOM50_COLLECT_TOKEN` secret in place. Use when the PAT nears expiry, staff change, or after a suspected compromise.

```sh
CLASSROOM50_COLLECT_TOKEN=github_pat_... gh teacher rotate-collect-token <org>
gh teacher rotate-collect-token <org>
```

Fails with a clear message if `<org>/classroom50` does not exist (`run gh teacher init <org> first`). Accepts the same token input paths and `--service-account-confirm` flag as `init`.

## `gh teacher classroom add`

Create a new classroom directory at the root of `<org>/classroom50` and scaffold its four canonical files in a single commit:

```sh
gh teacher classroom add <org> <short-name> --name "<full name>" --term <term>
gh teacher classroom add cs50-fall-2026 cs-principles --name "CS Principles" --term Spring-2026
gh teacher classroom add cs50-fall-2026 intro-java
```

**Short-name rules** (must match `^[a-z0-9][a-z0-9-]{1,38}$`):

- 2-39 characters total
- lowercase letters, digits, or hyphens
- must start with a letter or digit (not a hyphen)

The short-name flows into student repo names like `<short-name>-<assignment>-<username>` (the convention `gh student accept` and `gh teacher download` rely on), so it has to stay within GitHub's repo-name constraints.

**Flags:**

- `--name <full name>` — display name written into `classroom.json` (e.g. `"CS Principles"`). Optional but recommended.
- `--term <term>` — term identifier written into `classroom.json` (e.g. `Spring-2026`). Optional.

**What it scaffolds**, all in one Tree commit on the default branch:

| Path | Schema sentinel | Contents |
| --- | --- | --- |
| `<short-name>/classroom.json` | `classroom50/classroom/v1` | `name`, `short_name`, `term`, `org` |
| `<short-name>/assignments.json` | `classroom50/assignments/v1` | Empty `assignments: []` array — populated by `gh teacher assignment add`. |
| `<short-name>/students.csv` | n/a | Header row `username,first_name,last_name,email,section,github_id`. The `email` column is optional per row (values may be empty). The trailing `github_id` is a hidden column populated by `gh teacher roster add/import` — do not hand-edit it. |
| `<short-name>/scores.json` | `classroom50/scores/v1` | Scaffolds with an empty `submissions: {}` object -- rows are written by the `collect-scores.yaml` workflow, keyed by assignment slug. |

Three things this scaffold does **not** include:

- **The runner-side bootstrap** (`.github/scripts/runner.py`) is landed once by `gh teacher init` and shared across every classroom in the org. The runner stays untouched in normal use.
- **No autograder by default.** Classrooms work end-to-end without one — the runner publishes a vacuous-pass `result.json` (status=`success`, score 0/0) so submissions still tag and release. Add a classroom default later with `gh teacher autograder set-default`, or per-assignment overrides at `<classroom>/autograders/<slug>/autograder.py`.
- **The autograder workflow shim** is embedded in `gh-student` and dropped into each student repo at accept time. Teachers don't write or maintain it.

Per-assignment autograders (an `autograder.py` entrypoint + any sibling fixtures) go under `<short-name>/autograders/<slug>/` once the classroom is in place; the runner picks them over the classroom default at `<short-name>/autograder.py`. Per-assignment runtime customization (Python version, language toolchains, apt packages, container image) lives in the `runtime:` block on each `assignments.json` entry; see [Autograders](Autograders) for the schema.

**Errors:**

- `<org>/classroom50` does not exist → prints `run gh teacher init <org> first` and exits non-zero.
- `<short-name>` directory already exists in the config repo → refuses to overwrite. Use `gh teacher roster add` or `gh teacher assignment add` to modify an existing classroom.
- Short-name fails the slug regex → prints the exact rule with the offending input.

The command commits all four paths in a single Tree commit on the default branch.

## `gh teacher classroom migrate`

Import an existing GitHub Classroom into your `<target>/classroom50` config repo. For each assignment, the command copies the source starter repo into the target org as a fresh template (with `is_template: true`), then commits the matching `<short-name>/` directory — `classroom.json` / `assignments.json` / `students.csv` / `scores.json` — in a single Tree commit.

```sh
gh teacher classroom migrate --source <id-or-org> --target <org>
gh teacher classroom migrate --source 95884 --target cs50-fall-2026 --dry-run
gh teacher classroom migrate --source classroom50test --target cs50-fall-2026
gh teacher classroom migrate --source 95884 --target cs50-fall-2026 \
    --short-name cs-principles --term Spring-2026
```

**Why this exists.** GitHub Classroom is 1:1 with orgs — the org IS the classroom container. Classroom 50 hosts multiple classrooms per org under one `classroom50` config repo. To migrate N legacy classrooms into one target org, run this command N times, once per source classroom.

**What it does** (in order):

1. **Discovery** — resolves `--source`, derives a short-name from the classroom name, fetches every assignment detail (including `starter_code_repository`) from the GitHub Classroom REST API.
2. **Pre-flight** — refuses if the target `<short-name>/` directory already exists in `<target>/classroom50` before any template repos are created.
3. **Template copy** — for each assignment: verify the source repo is a template → probe the target name for collision → `POST /repos/.../generate` → `PATCH .../is_template:true` → wait for the new branch ref to stabilize.
4. **Config commit** — single Tree commit on `<target>/classroom50` writing the four-file scaffold with the migrated entries.

**Flags:**

- `--source <id-or-org>` (required) — numeric GitHub Classroom ID (e.g. `95884`) or the source org's login (e.g. `classroom50test`).
- `--target <org>` (required) — destination org where the `classroom50` config repo lives. Run `gh teacher init <target>` first if it doesn't exist yet. `--target` is *unrelated to the source classroom's org* — Classroom 50 lets you migrate several legacy classrooms into one target org as siblings under the same `classroom50` repo.
- `--short-name <name>` — override the auto-derived classroom directory name. By default the source classroom's name is slugified (lowercase, non-alnum → `-`, collapsed, trimmed, truncated to 39 chars) and validated against `^[a-z0-9][a-z0-9-]{1,38}$`. Pass `--short-name` explicitly if the derived value fails validation.
- `--term <text>` — set `classroom.json.term` (e.g. `Spring-2026`).
- `--template-suffix <suffix>` — appended to every target template repo name. Use to escape collisions: `--template-suffix migrated` renames the target template from `<slug>` to `<slug>-migrated`.
- `--include-archived` — include archived classrooms when resolving `--source` by org name (ignored when `--source` is a numeric ID — archived classrooms always resolve by ID, with a stderr warning).
- `--dry-run` — run discovery and print the plan without any API writes against source or target. Useful for previewing what would migrate before committing to anything.

**Source resolution:**

- **Numeric** (`--source 95884`) → `GET /classrooms/95884` directly. Archived classrooms resolve with a stderr warning (`archived in GitHub Classroom — proceeding`). The `--include-archived` flag is irrelevant here.
- **Org login** (`--source classroom50test`) → list every classroom your token can administer, fetch each one's detail to recover `organization.login`, filter case-insensitively. The Classroom listing endpoint doesn't carry `organization` so the per-row detail fetch is unavoidable. Errors when zero matches (with a hint about `--include-archived`) or when multiple classrooms in the same org match (enumerates candidates with IDs and asks for `--source <id>`).

**Target template repo naming.** Each migrated assignment becomes `<target>/<slug>` in the target org. Use `--template-suffix <s>` to rename to `<slug>-<s>` when a name collides with an existing repo. If the colliding repo is *already* a template (e.g. you re-ran migrate), the existing template is reused without re-generating; if it's a regular repo, migrate skips that assignment with an actionable error pointing at `--template-suffix`.

**`migrated_from` provenance.** Every migrated `classroom.json` and `assignments.json` entry carries an optional `migrated_from` block recording the legacy classroom/assignment IDs, source starter-repo path, GitHub Classroom invite link, and migration timestamp. Hand-authored classrooms (from `gh teacher classroom add` / `gh teacher assignment add`) never carry this block — it's exclusively a provenance marker for migrated content.

**`mode: "group"` preserved.** Group assignments from the source are recorded losslessly in `assignments.json` (preserving teacher intent across the migration), but `gh teacher assignment add --mode group` and `gh student accept` still reject group entries at their own seams until group-mode support lands. Once it does, no re-migration is needed.

**What's NOT migrated** (covered by separate workflows):

- **Roster** — `students.csv` is left empty. Re-onboard students for the new term with `gh teacher roster add` / `gh teacher roster import`. (This is a deliberate "fresh start" — most teachers want a clean roster for the new term anyway.)
- **Scores / grades** — `scores.json` is left empty.
- **Accepted-assignment student repos** — student work isn't cloned. The new term starts fresh; old submissions stay on the legacy org if you need them.
- **Autograding test config** — GitHub Classroom's `.github/classroom/autograding.json` schema doesn't translate to our `autograder.py` model. Author grading code separately under `<classroom>/autograders/<slug>/` or set a classroom default with `gh teacher autograder set-default`.

**Failure model.** Per-assignment failures are best-effort: a source repo that isn't a template, a target collision with a non-template repo, or a failed generate/PATCH call skips that single entry with a stderr reason. The commit still lands with the entries that succeeded; exit code is non-zero so partial completion is visible. Re-running reuses any templates that already exist (collision = template path).

**Errors:**

- `<target>/classroom50` missing → `run gh teacher init <target> first`.
- Target classroom dir already exists → `pick a different --short-name or delete the dir`. The pre-flight probe fires *before* any template repos get created, so no orphan repos are left behind in the target org.
- `--source <id>` 404 → `classroom is not accessible — confirm you are a GitHub Classroom admin`.
- `--source <org>` resolves to zero classrooms → `no classrooms found in org "<source>"`. If `--include-archived` wasn't passed, the error includes a hint about it.
- `--source <org>` resolves to multiple classrooms (rare — Classroom is 1:1 with orgs) → lists candidates with IDs and asks for `--source <id>`.
- Derived short-name fails the slug regex → asks for `--short-name <name>` explicitly with the offending input.

## `gh teacher roster`

Manage student rows in `<org>/classroom50/<classroom>/students.csv`. All three subcommands write through a shared optimistic-update-with-rebase loop: each attempt reads the current branch tip, re-applies the upsert/remove against the latest file, and PATCHes the ref with a fast-forward check. Up to 5 attempts with exponential backoff before giving up — concurrent edits from multiple teachers can't silently lose each other's work.

Every row carries an immutable numeric `github_id` (resolved at write time via `GET /users/{username}`) so a mid-class username change doesn't desynchronize records. The `github_id` column is CLI-managed; teachers should not hand-edit it. The column is named `github_id` (not the API-side `id`) to keep the source unambiguous when classroom50 grows additional ID columns from non-GitHub sources.

### `gh teacher roster add`

```sh
gh teacher roster add <org> <classroom> <username> [--first-name <n>] [--last-name <n>] [--email <addr>] [--section <s>]
gh teacher roster add cs50-fall-2026 cs-principles alice --first-name Alice --last-name Andersson --email alice@example.edu --section section-1
gh teacher roster add cs50-fall-2026 cs-principles bob
```

Appends or upserts one row by `username` (case-insensitive match). All four data flags are optional; an absent flag writes an empty value into its column. After the roster write lands, sends an org invitation if the student isn't already a member and doesn't have a pending invite — same path `gh teacher invite` uses, but quiet about already-member/already-pending cases.

Safe to re-run: the row is replaced in place — every run produces a commit, but a no-change re-run yields a same-tree commit (never duplicates or removes data). The org-invite step is skipped when the student is already an active or pending member.

### `gh teacher roster remove`

```sh
gh teacher roster remove <org> <classroom> <username>
```

Drops the row matching `<username>` (case-insensitive). Idempotent: a no-op + zero exit when the row is already absent. **Does NOT remove org membership** — that's a separate `gh teacher remove <org> <username>` so an off-by-one roster edit can't accidentally revoke a student's repo access.

### `gh teacher roster import`

```sh
gh teacher roster import <org> <classroom> <path-to-csv>
gh teacher roster import cs50-fall-2026 cs-principles ./section-1.csv
```

Bulk upsert from a local CSV. Accepts either header shape:

- **5-column** (recommended for hand-authored CSVs): `username,first_name,last_name,email,section`
- **6-column** (exported from a previous `students.csv`): same as above plus `github_id`, which is ignored — the CLI re-resolves `github_id` at import time so the on-disk roster always carries the GitHub-authoritative ID.

The `email` column values may be empty per row.

Resolves every username up-front (one `GET /users/{username}` per row); a non-existent username aborts the import with the row number, before any commit. Once all usernames resolve, the entire file is written in a single Tree commit — there's no partial-import state visible on the repo. After the commit, each non-member is invited; the command prints a summary `N invited, M already members, K already pending`.

Duplicate usernames within the input (case-insensitive) collapse with last-wins semantics.

### Errors common to all three subcommands

- `<org>/classroom50` missing → `run gh teacher init <org> first`, non-zero exit.
- `<classroom>/students.csv` missing → `run gh teacher classroom add <org> <classroom> first, or restore the file if it was deleted`.
- `students.csv` header doesn't match `username,first_name,last_name,email,section,github_id` → exits non-zero with the offending header.
- GitHub user not found (404 from `GET /users/{username}`) → exits with the offending username.
- Repeated rebase failures (the CLI retries a small fixed number of times with exponential backoff) → exits with a `lost the rebase race` message and a hint to retry or investigate concurrent writers.

## `gh teacher assignment`

Manage entries in `<org>/classroom50/<classroom>/assignments.json` — the authoritative manifest the autograde workflow and `gh student accept` both read. Each entry pairs a `slug` (used in student repo names like `<classroom>-<slug>-<username>`) with a template repo, an optional due date, a `mode` (only `individual` is currently supported), and an optional `autograder` name (defaults to `default`).

Writes flow through the same optimistic-update-with-rebase loop the roster commands use (up to 5 attempts with exponential backoff), so concurrent edits from multiple teachers don't silently lose each other's work.

### `gh teacher assignment add`

```sh
gh teacher assignment add <org> <classroom> <slug> --name "<name>" --template <owner>/<repo>[@branch] [--description <text>] [--due <ISO-8601>] [--mode individual] [--runtime <path-to-json>] [--autograder <name>]
gh teacher assignment add cs50-fall-2026 cs-principles hello --name "Hello" --template cs50/hello-template --due 2026-09-15T23:59:00-04:00
gh teacher assignment add cs50-fall-2026 cs-principles intro --name "Intro" --template cs50/intro-template@main --runtime ./runtime-c.json
```

Register or upsert one assignment. Idempotent on re-run: the same `slug` replaces the existing entry in place (position-preserving), a new `slug` appends.

**Slug rules** (same as classroom short-names): `^[a-z0-9][a-z0-9-]{1,38}$`, 2-39 chars, lowercase letters/digits/hyphens, starting with a letter or digit. The slug becomes part of the student repo name `<classroom>-<slug>-<username>`, so the constraint mirrors GitHub's repo-name rules.

**Required flags:**

- `--name <display name>` — written into `assignments.json`'s `name` field. Used in release titles and the published Pages site (forthcoming).
- `--template <owner>/<repo>[@branch]` — the starter-code repo. The CLI calls `GET /repos/{owner}/{repo}` to verify it exists, is visible to your token, and has `is_template: true`. When you omit `@branch`, the template's `default_branch` from the response is used; pass `@main` (or `@master`, etc.) to pin explicitly.

**Optional flags:**

- `--description <text>` — short description written into the entry (omitted from the file when empty).
- `--due <ISO-8601>` — due date in RFC 3339 form, e.g. `2026-09-15T23:59:00-04:00`. The timezone is required. Stored verbatim, so a teacher's choice of offset round-trips through the file.
- `--mode individual` — `individual` is the only currently-supported value; `group` is planned for a future release and produces an explicit error today.
- `--runtime <path>` — JSON file describing the runtime environment for this assignment's autograde job. Supports `runs-on` (allow-listed GitHub-hosted runner labels only), `python` / `node` / `java` / `go` toolchain versions, `apt` packages, and an escape-hatch `container` image. Omit for the defaults (ubuntu-latest + Python 3.12). See the [Autograders](Autograders) wiki page for the schema and worked examples.
- `--autograder <name>` — reserved for the rare case where you want to call a different *reusable workflow* entirely (not just different language toolchains — for that, use `--runtime`). The default `default` resolves to the universal shim embedded in `gh-student`. Non-default values reference a sibling shim at `<classroom>/autograders/<name>.yaml` in the config repo; the referenced file must exist at write time.

**Where grading logic lives.** Per-assignment grading is NOT registered through this command. Drop an `autograder.py` (Python script that produces `result.json`) at `<classroom>/autograders/<slug>/autograder.py` in the config repo — sibling fixtures and helpers go in the same folder and ride along in the bundle. Or run `gh teacher autograder set-default <org> <classroom>` to install a classroom default at `<classroom>/autograder.py` (used for every assignment in the classroom that has no per-assignment override). See the [Autograders](Autograders) wiki page for the entrypoint contract and copy-pasteable templates (pytest, check50, custom).

**Errors:**

- `<org>/classroom50` missing → `run gh teacher init <org> first`, non-zero.
- `<classroom>/assignments.json` missing → `run gh teacher classroom add <org> <classroom> first, or restore the file if it was deleted`.
- Template repo 404 (private, in another org, or doesn't exist) → `template <owner>/<repo> is not visible to your account — either make it public, or copy it into your org and reference the copy`.
- Template repo exists but `is_template: false` → message naming the Settings toggle to flip.
- `--autograder <name>` (non-default) references a file that doesn't exist in the config repo at write time → `autograder "<name>" does not exist at <org>/classroom50/<classroom>/autograders/<name>.yaml — create it (or pass --autograder default) before registering this assignment`. The default name resolves to the embedded gh-student shim and skips the file-existence probe.
- `--runtime <path>` JSON fails the schema or allow-list (e.g. self-hosted `runs-on`, malformed apt name, raw token in container credentials) → an error naming the offending field, with the path to the JSON file.
- Repeated rebase failures (5 attempts with exponential backoff) → `lost the rebase race` with a retry hint.

**Same-slug concurrent writes.** The rebase loop handles concurrent edits to *different* slugs cleanly — each teacher's retry sees the other's commit and re-applies their own upsert. For concurrent edits to the *same* slug (two teachers running `gh teacher assignment add hello ...` within the rebase window), the contract is last-writer-wins: the loser's retry observes the winner's entry and replaces it with theirs, without an on-CLI signal. Both commits remain in the config repo's git history, so a teacher who notices an unexpected overwrite can recover with `git revert` on the config repo.

### `gh teacher assignment remove`

```sh
gh teacher assignment remove <org> <classroom> <slug>
```

Drops the matching entry. Idempotent: if the slug is already absent, exits 0 with a note. **Does NOT touch existing student repos** — the starter code and submission history stay intact; only new `gh student accept` invocations stop finding the slug.

### `gh teacher assignment list`

```sh
gh teacher assignment list <org> <classroom>
gh teacher assignment list <org> <classroom> --json
gh teacher assignment list <org> <classroom> -q | xargs -I{} gh teacher download <org> <classroom> {}
```

Read-only enumeration of every slug registered in `<org>/classroom50/<classroom>/assignments.json`. Default output is one slug per line on stdout — pipeable directly into `xargs gh teacher download`, `grep`, an agent loop, or anything else expecting a newline-separated list.

**Flags:**

- `--json` — emit the full JSON array of assignment entries instead of one slug per line. Preserves every field (template ref, due, mode, autograder) so an agent can introspect the manifest without a second API call. Output matches the on-disk indent so `jq` pipes work without reformatting.
- `--quiet` / `-q` — suppress the one-line stderr summary (`<repo-path>: N assignments`). Use this when capturing stdout from a script that should not have to filter mixed streams.

**Errors:** same shape as `add` and `remove` — missing config repo points at `gh teacher init`, missing `assignments.json` points at `gh teacher classroom add`. Exits 0 with empty stdout when the classroom has no assignments yet (the stderr summary, when not suppressed, hints at `gh teacher assignment add` for the next step).

## `gh teacher autograder`

Manage the **classroom default autograder** at `<classroom>/autograder.py`. The runner uses this script for every assignment in the classroom that has no per-assignment override under `<classroom>/autograders/<slug>/`.

### `gh teacher autograder set-default`

```sh
gh teacher autograder set-default <org> <classroom> --from <path>
gh teacher autograder set-default <org> <classroom> --from -
gh teacher autograder set-default <org> <classroom>
gh teacher autograder set-default cs50-fall-2026 cs-principles \
    --from examples/autograders/cs50/autograder.py
```

Replaces `<classroom>/autograder.py` in the config repo with the contents of `--from <path>`. `--from -` reads from stdin (one-shot agent flows). When `--from` is omitted, installs the diagnostic stub shipped with this CLI — the stub echoes every env var the runner exposed and emits a vacuous-pass `result.json`, so teachers can verify the pipeline before authoring real grading logic.

Lands as a single Tree commit on the config repo's default branch and is picked up by every subsequent submission once the next `publish-pages.yaml` run deploys (~30s). Re-running with the same content is a no-op.

**Validation.** The classroom must already exist (`<classroom>/classroom.json` present in the repo). If it doesn't, the command refuses to write — preventing typos from creating phantom-classroom directories that contain only `autograder.py`. Run `gh teacher classroom add` first.

**No `unset-default`.** Delete the file via the GitHub web UI (or `git rm` + push) when you want to revert a classroom to "no autograder configured" (the runner's default vacuous-pass behavior).

## `gh teacher invite`

Uses the API to invite a student or teaching assistant to an org or a specific repo.

```sh
gh teacher invite <org> <username>             # direct_member to org
gh teacher invite --admin <org> <username>     # admin to org
gh teacher invite <org>/<repo> <username>      # collaborator on repo (default push)
gh teacher invite -p maintain <org>/<repo> <username>
```

Under the hood:

1. Resolve the username to a user ID via `GET /users/{username}` ([docs](https://docs.github.com/en/rest/users/users?apiVersion=2026-03-10#get-a-user)).
2. For org targets, invite by user ID via `POST /orgs/{org}/invitations` ([docs](https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#create-an-organization-invitation)).
3. For repo targets, add via `PUT /repos/{owner}/{repo}/collaborators/{username}` ([docs](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator)).
4. Advise the user to sign in to `https://github.com` as the invited GitHub user, then visit `https://github.com/<org>` to accept.

The org-invitation endpoint requires the `admin:org` OAuth scope. Run `gh teacher login` once before the first org invite to grant it.

Common API failures (missing scope, not an admin, org not found, already a member, pending invite) are translated into actionable messages instead of raw HTTP errors.

## `gh teacher remove`

```sh
gh teacher remove <org> <username>           # remove from organization
gh teacher remove <org>/<repo> <username>    # remove from one repository
```

- Org targets call `DELETE /orgs/{org}/memberships/{username}` ([docs](https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#remove-organization-membership-for-a-user)). Revokes access to every repository in the org, removes the user from all teams, and cancels any pending invitation in one call.
- Repo targets call `DELETE /repos/{owner}/{repo}/collaborators/{username}` ([docs](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#remove-a-repository-collaborator)).
- Both forms are idempotent: a `204` prints `removed <username>`; a `404` (user is not a member or collaborator) prints a clear message and exits 0 so re-runs are safe.

## `gh teacher download`

```sh
gh teacher download <org> <classroom> <assignment>              # roster-driven (default)
gh teacher download --by-pattern <org> <classroom> <assignment> # skip roster, clone by name prefix
gh teacher download -d <dir> <org> <classroom> <assignment>     # literal dir, no timestamp
gh teacher download -v <org> <classroom> <assignment>           # stream raw git output per repo
gh teacher download -q <org> <classroom> <assignment>           # suppress per-repo summary, forward --quiet to git
```

### Roster-driven mode (default)

The command reads `<org>/classroom50/<classroom>/students.csv` and `<classroom>/assignments.json`, then for each roster row:

1. Computes the canonical `<classroom>-<assignment>-<username>` repo name (lowercased — matches `gh student accept`'s naming).
2. Probes `GET /repos/<org>/<name>` ([docs](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#get-a-repository)). A 404 prints `Missing: <username> (not accepted yet?)` and contributes to the per-run summary; a non-404 error surfaces as a per-repo failure.
3. For repos that exist, shells out to `gh repo clone <org>/<name> <dir>/<name>` so authentication flows through the current `gh` session.
4. For each cloned repo (and for repos already on disk), refreshes `<repo>/result.json` from the latest submit-tag release. The asset is fetched via `GET /repos/<org>/<repo>/releases/latest` → the asset's API URL with `Accept: application/octet-stream`, and `Authorization` is stripped on the redirect to the signed storage URL so the GitHub token never reaches the storage origin. A repo with no releases, a non-submit tag, or no `result.json` asset is a silent no-op.
5. After all clones, writes a `scores.csv` summary at the destination root with one row per roster entry. Submitters carry their score columns (`score`, `max_score`, `datetime`, `submission_tag`, `review_url`, `override`); non-submitters get blank score columns so a teacher can sort by score and immediately see who hasn't submitted yet. Submissions in `scores.json` whose `usernames[0]` isn't on the current roster are dropped from the CSV (the roster is the source of truth for which students are in this class right now).

The command refuses to run when:

- `<org>/classroom50` doesn't exist → `run gh teacher init <org> first`.
- `<classroom>/students.csv` is missing → `run gh teacher classroom add` first.
- `<assignment>` isn't registered in `assignments.json` → `run gh teacher assignment add <org> <classroom> <assignment>` first, or pass `--by-pattern` to skip the roster lookup.

### `--by-pattern`

Pages through `GET /orgs/{org}/repos` ([docs](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#list-organization-repositories)) and clones every repo whose name starts with `<classroom>-<assignment>-`. Skips the roster lookup, the `result.json` refresh, and the `scores.csv` summary — useful when the config repo isn't bootstrapped yet, or when you want every matching repo regardless of who's currently on the roster.

### Destination

Default is `<classroom>-<assignment>_submissions_YYYY_MM_DD_T_HH_MM_SS/` (24-hour local time) so each run produces a fresh folder and prior downloads are preserved without manual cleanup. Pass `-d` to override (the value is taken literally, no timestamp appended).

Existing target dirs are skipped on the clone step, so re-runs with the same `-d` pick up new submissions without aborting on the ones already cloned. `result.json` is still refreshed on the existing clones — so a re-run after the latest collect-scores cycle picks up the newest score without re-cloning. Clone failures carry git's actionable diagnostic (e.g. `fatal: ...`) rather than just an exit code; a non-zero exit code surfaces after the rest of the run still completes.

## `gh teacher teardown`

```sh
gh teacher teardown <org>              # interactive (typed org-name prompt)
gh teacher teardown --yes <org>        # skip the prompt (scripted runs)
```

Delete every repository in `<org>` after confirming the org is a Classroom 50 setup. Intended for **development scenarios** — resetting a test org between runs of `gh teacher init` / `migrate` / etc. Production teachers should use the GitHub web UI for selective deletion; this is a sledgehammer.

**What it does:**

1. Confirms the marker repo exists: `GET /repos/<org>/classroom50`. A 404 refuses teardown with `not found — refusing teardown on an org without the Classroom 50 marker repo`. This is the safety net that prevents accidental nukes of orgs that aren't dedicated to a single classroom.
2. Lists every repo in the org via `GET /orgs/<org>/repos` (paginated). Prints the full set on stdout — teachers see exactly what's about to disappear.
3. Prompts for **typed org-name confirmation** (e.g. `Type the org name (cs50-fall-2026) to confirm:`). Anything other than the org name aborts with `confirmation did not match org name — aborted without deleting anything`. Pass `--yes` to skip the prompt; CI / scripts only.
4. Issues `DELETE /repos/<org>/<repo>` for each repo. `<org>/classroom50` is deleted **last** so a mid-run failure leaves the marker repo behind — re-running teardown still passes the precondition check and tries again on the survivors.
5. Per-repo failures are tolerated: each prints to stderr with the failure reason and the run continues. Exits non-zero when any repo failed so scripts see the partial-completion signal.

**Required scope (opt-in).** `delete_repo` is NOT part of the default `gh teacher login` scope set. Opt in once with `gh teacher login -s delete_repo` before running teardown. This is intentional: teachers who haven't explicitly opted in can't accidentally wipe their org. If your token lacks the scope, the first `DELETE` returns 403 and teardown surfaces an actionable hint pointing back at `gh teacher login -s delete_repo`.

**Errors:**

- `<org>/classroom50` not found → refuses with the "Classroom 50 marker repo" message. Re-create with `gh teacher init <org>` if this is intended, or delete repos manually via the web UI.
- Confirmation mismatch → aborts cleanly, no `DELETE` calls are made.
- 403 on a `DELETE` → token lacks `delete_repo`. Run `gh teacher login -s delete_repo` and retry.
- Other per-repo failures → continue the run, print to stderr, exit non-zero at the end.

## `gh teacher whoami` / `login` / `logout`

- `gh teacher whoami` — prints the authenticated GitHub user (a thin wrapper around `gh api user`).
- `gh teacher login` — runs `gh auth login -s admin:org`, optionally with additional scopes via `-s/--scope`.
- `gh teacher logout` — runs `gh auth logout`.

## Contributing

Building, testing, and linting the extension is documented in the [`cli/gh-teacher/` README](https://github.com/foundation50/classroom50/blob/main/cli/gh-teacher/README.md) in the repo (where contributors expect to find it).
