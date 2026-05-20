# Teacher Guide

End-to-end walkthrough for instructors. Each step assumes the previous ones are done. Install the CLI first — see [Installation](Installation).

## 1. Set up the organization (one-time, on github.com)

The CLI doesn't create or configure orgs. Do these once via the GitHub web UI:

1. **Create the organization** at <https://github.com/account/organizations/new>.
2. **Set the org's base permission to "No permission"** at `https://github.com/organizations/<org>/settings/member_privileges` so students don't get implicit access to other repos in the org.
3. **Create a template assignment repo.** Any repo flagged as a template (Settings → "Template repository") works. **The template must be public** so students can read it: the "No permission" baseline from the previous step blocks org members from reading private repos they aren't explicit collaborators on, and a private template would 404 on `gh student accept`. The Free and Team plans don't have a way around this. (GitHub Enterprise Cloud has a third visibility called "internal" that all enterprise members can read without per-repo collaboration; on that plan an internal template works without going public — see [GitHub's docs on internal repositories](https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/about-repositories#about-internal-repositories).) See [Assignment Templates](Assignment-Templates) for the expected file structure; copy that layout into your own template repo.

## 2. Log in with the right scopes

Org invitations require the `admin:org` OAuth scope, which `gh auth login` doesn't grant by default. Run once:

```sh
gh teacher login
```

![Demo: gh teacher login](images/gh_teacher_auth.gif)

This shells out to `gh auth login -s admin:org` and opens a browser to authorize. If you haven't logged in to `gh` before, it performs the initial login and grants `admin:org` in one shot; if you have, it re-authenticates with the new scope appended.

If you skip this step and run another command first (e.g. `gh teacher invite`), it will detect the missing scope and run `gh teacher login` for you before continuing.

## 3. Bootstrap the classroom50 config repo

Run once per teaching org to create `<org>/classroom50` — the private config repo that will hold classroom metadata, published assignment manifests, and collected scores:

```sh
CLASSROOM50_COLLECT_TOKEN=ghp_xxx gh teacher init <org>
```

Or omit the env var and the command prompts for the token interactively:

```sh
gh teacher init <org>
```

`init` is idempotent: re-running picks up where a prior run left off (it does not overwrite teacher edits to the skeleton).

**Collect token.** Supply a fine-grained PAT with **Contents: read** on org repos whose names match `<classroom>-*`. Store it only via the `CLASSROOM50_COLLECT_TOKEN` environment variable or a hidden stdin prompt — there is no `--collect-token` flag (command-line PATs leak via shell history and process listings). Use an org-owned service account, not a personal teacher account; pass `--service-account-confirm` to silence the reminder. Rotate before expiry (PATs are typically 90 days) with:

```sh
gh teacher rotate-collect-token <org>
```

**What `init` sets up:** private `classroom50` repo with `auto_init`, embedded workflows (`publish-pages.yml`, placeholder `collect-scores.yml`), GitHub Pages (workflow build), branch protection on the default branch, workflow `GITHUB_TOKEN` permissions (409 tolerated when the org enforces a stricter policy — skeleton workflows declare their own workflow-level `permissions:` blocks), and the repo-level `CLASSROOM50_COLLECT_TOKEN` Actions secret.

**Plan check.** `init` warns when the org is not on Team or Enterprise Cloud (required for Pages from a private repo). The warning is advisory; you can still proceed.

After `init` completes, the CLI prints the future Pages URL (`https://<org>.github.io/classroom50/`) and suggests `gh teacher classroom add` as the next step.

## 4. Add a classroom

Each classroom is a directory at the root of `<org>/classroom50` holding five paths:

- `classroom.json` — public name / term / org metadata.
- `assignments.json` — assignment manifest (published via Pages, fetched by `gh student accept`).
- `students.csv` — private roster.
- `scores.json` — private collected scores.
- `autograders/default.yml` — the default per-classroom autograder workflow, scaffolded as a thin wrapper around the reusable `foundation50/classroom50/.github/workflows/autograde-library.yml`. Students fetch it from Pages on accept and refresh it on every submit. Hand-edit it (or drop sibling `<name>.yml` files for bespoke graders) — `gh student accept`/`submit` always read the current Pages version, so teacher edits propagate without per-student-repo maintenance.

Scaffold one with:

```sh
gh teacher classroom add <org> <short-name> --name "<full name>" --term <term>
```

For example:

```sh
gh teacher classroom add cs50-fall-2026 cs-principles --name "CS Principles" --term Spring-2026
```

The `<short-name>` must match `^[a-z0-9][a-z0-9-]{1,38}$` (2-39 chars, lowercase letters/digits/hyphens, starting with a letter or digit) because it flows into student repo names like `<short-name>-<assignment>-<username>`. `--name` and `--term` are optional but recommended — they're written into `classroom.json` and surface in the published Pages site (forthcoming) and in `gh teacher download` summaries.

The command commits all five paths in a single Tree commit on the default branch. If `<org>/classroom50` doesn't exist yet, it prints `run gh teacher init <org> first` and exits non-zero. If the `<short-name>` directory already exists, it refuses to overwrite rather than clobbering an in-progress classroom — modify it via `gh teacher roster add` (step 6) and `gh teacher assignment add` (step 7) instead.

Run this command once per classroom you teach in the org. You can have several classrooms side by side in the same `classroom50` repo.

## 5. Invite students to the org

The fastest way to add students is `gh teacher roster add` (next step) — it registers them in the classroom roster *and* sends an org invite in one shot. Use the bare `gh teacher invite` only for ad-hoc cases (e.g., inviting a TA who shouldn't be in the student roster, or bringing in someone before the roster is set up):

```sh
gh teacher invite <org> <username>
```

![Demo: gh teacher invite](images/gh_teacher_invite.gif)

The student gets an email invitation. They can accept it by visiting `https://github.com/<org>`, or skip ahead and let `gh student accept` auto-accept the pending invite when they accept their first assignment.

Common API failures (missing scope, not an admin, org not found, already a member, pending invite) surface as actionable messages instead of raw HTTP errors.

To invite a teaching assistant as an org admin instead:

```sh
gh teacher invite --admin <org> <username>
```

To invite someone to a single repo rather than the whole org (e.g. a TA on a specific assignment):

```sh
gh teacher invite <org>/<repo> <username>                 # default: push
gh teacher invite -p maintain <org>/<repo> <username>     # other permissions
```

Permission options for `-p`: `pull`, `triage`, `push`, `maintain`, `admin`. Re-running with a different `-p` updates the existing collaborator's permission in place.

## 6. Track students in the roster

Each classroom keeps a `students.csv` file inside `<org>/classroom50/<classroom>/`. The CLI manages it for you with three subcommands; you should rarely hand-edit the file.

**Add or update one student:**

```sh
gh teacher roster add <org> <classroom> <username> [--first-name <name>] [--last-name <name>] [--email <addr>] [--section <id>]
gh teacher roster add cs50-fall-2026 cs-principles alice --first-name Alice --last-name Andersson --email alice@example.edu --section section-1
```

This resolves the student's immutable `github_id` (GitHub's numeric account ID), upserts the row in `students.csv` (case-insensitive match on username), and sends an org invitation if they aren't already a member. All four data flags are optional; values left unset become empty cells in the CSV. Re-running with the same arguments is safe — the row is replaced, the org invite is skipped if already pending or active.

**Bulk import from a local CSV:**

```sh
gh teacher roster import <org> <classroom> <path-to-csv>
```

Accepts either the canonical 6-column header (`username,first_name,last_name,email,section,github_id` — the same shape `students.csv` uses on disk) or a 5-column header without `github_id` (recommended for hand-authored CSVs since `github_id` is CLI-managed). The `email` column values may be empty per row. All usernames are resolved up-front; a single typo aborts the whole import before any commit. The entire file is then written in one Tree commit, and every new student is invited to the org. Re-running is safe — already-imported rows just refresh.

**Remove a student from the roster:**

```sh
gh teacher roster remove <org> <classroom> <username>
```

Drops the row from `students.csv`. **Does NOT remove org membership** — use `gh teacher remove <org> <username>` (step 8) for that. Splitting roster removal from org removal is deliberate: an off-by-one roster edit shouldn't be able to revoke a student's access to every repo in the org.

All three subcommands write through an optimistic-update-with-rebase loop (a small number of retries with exponential backoff) so two teachers editing the roster concurrently can't silently lose each other's work. If you see a `lost the rebase race` message, just retry the command.

## 7. Add assignments

Each classroom keeps an `assignments.json` file inside `<org>/classroom50/<classroom>/`. Each entry pairs a slug (used in student repo names like `<classroom>-<slug>-<username>`) with a template repo, an optional due date, and optional autograding tests. Register one with:

```sh
gh teacher assignment add <org> <classroom> <slug> --name "<name>" --template <owner>/<repo>[@branch] [--description <text>] [--due <ISO-8601>] [--autograder <name>] [--tests <path-to-tests.json>]
gh teacher assignment add cs50-fall-2026 cs-principles hello --name "Hello" --template cs50/hello-template --due 2026-09-15T23:59:00-04:00 --tests ./hello-tests.json
```

**`--name` and `--template` are required.** The slug must match `^[a-z0-9][a-z0-9-]{1,38}$` (the same shape as classroom short-names). The template repo must be flagged `is_template: true` (Settings → "Template repository") and visible to your token — if it lives in another org and isn't public, students won't be able to read it either. When you omit `@branch`, the CLI reads the template's default branch from `GET /repos/{owner}/{repo}` and writes that into `assignments.json`.

**Optional flags:**

- `--description <text>` — short description written into the entry.
- `--due <ISO-8601>` — RFC 3339 timestamp with a timezone offset, e.g. `2026-09-15T23:59:00-04:00`. Stored verbatim so the timezone round-trips.
- `--mode individual` — the only currently-supported value; `--mode group` is planned for a future release and produces an explicit error today.
- `--autograder <name>` — which autograder workflow this assignment opts into. Defaults to `default` (the workflow `gh teacher classroom add` scaffolded under `<classroom>/autograders/default.yml`). To opt in to a per-language or bespoke grader, drop a sibling `<classroom>/autograders/<name>.yml` in the config repo first, then pass `--autograder <name>` — the CLI verifies the file exists at write time and rejects a typo before the assignment lands. Students fetch the named workflow from Pages on accept and refresh it on every submit; the source-of-truth is the config repo, so editing `<classroom>/autograders/<name>.yml` updates every student's next submission with no per-repo maintenance.
- `--tests <path-to-tests.json>` — local JSON file whose top-level value is a JSON array of test entries. The array merges into the assignment's `tests` field, replacing any previous tests for that slug. The CLI validates every entry against the autograding-tests schema (`test-name`, `test-type` ∈ `{input_output, run_command}`, `command`, `timeout`, `max-score`, plus per-test-type field rules) before writing — a schema violation aborts the command without producing a partial-state commit.

Re-running with the same slug replaces the entry in place (idempotent). New slugs append. Every entry on disk carries a `tests` field, even an empty one: an assignment with no tests still serializes `"tests": []` (not absent, not null), so the autograde workflow can read it without nil guards.

Remove an entry with:

```sh
gh teacher assignment remove <org> <classroom> <slug>
```

This does NOT touch existing student repos — the starter code and submission history stay intact; only new `gh student accept` invocations stop finding the slug. Idempotent: an already-absent slug exits 0 with a note.

**List what's registered** at any time:

```sh
gh teacher assignment list <org> <classroom>            # one slug per line on stdout
gh teacher assignment list <org> <classroom> --json     # full JSON array of entries
```

The default form is pipeable directly into `xargs gh teacher download` or any other command that takes a slug from stdin; the `--json` form preserves every field (template ref, due, tests) for scripting against the manifest. Pass `-q` to suppress the stderr summary when capturing stdout in a script.

## 8. Remove students or TAs when needed

```sh
gh teacher remove <org> <username>           # remove from organization
gh teacher remove <org>/<repo> <username>    # remove from one repo
```

The org form revokes access to every repository in the org, removes the user from all teams, and cancels any pending invitation in one call. Both forms are idempotent — a 404 (user is not a member or collaborator) prints a clear message and exits 0 so re-runs are safe.

## 9. Collect scores

Every student submission publishes a GitHub Release on their own repo carrying a `result.json` asset. The `collect-scores` workflow in `<org>/classroom50` walks every `(student, assignment)` pair in `<classroom>/students.csv` × `<classroom>/assignments.json`, asks GitHub for each expected repo's latest release, and aggregates the results into `<classroom>/scores.json` — the authoritative score record for the class.

Run it from the Actions tab on `<org>/classroom50`, or trigger it from your shell:

```sh
gh workflow run collect-scores.yml --repo <org>/classroom50
gh workflow run collect-scores.yml --repo <org>/classroom50 -f classroom=cs-principles    # one classroom only
```

The skeleton committed by `gh teacher init` ships the workflow with a nightly cron (`17 4 * * *` UTC), so even if you never trigger it manually, scores land in `scores.json` once a day. If you want manual-only triggering, comment out the `schedule:` block in `.github/workflows/collect-scores.yml`.

What it does on each run:

1. Iterates every classroom under `<org>/classroom50/<classroom>/` (or just the one you passed via `-f classroom=`).
2. For each `(student, assignment)` pair in `students.csv` × `assignments.json`, computes the canonical repo name `<classroom>-<assignment>-<username>` (the same formula `gh student accept` uses) and asks GitHub for that repo's latest release. A `404` from `/releases/latest` means the student hasn't accepted or hasn't submitted yet — the collector counts the gap and moves on.
3. For each release found, downloads `result.json`, schema-validates it, and checks that the payload's `classroom` / `assignment` / `usernames[0]` match the expected `(classroom, assignment, student)` tuple (defense against a hostile autograder payload trying to land in the wrong scores.json).
4. Upserts the validated payload into `<classroom>/scores.json`. **Existing entries with `"override": true` are preserved verbatim** — if you hand-edited a row to grant partial credit, the next collect run leaves it alone.
5. Logs a per-assignment `cs-principles/hello: 23/30 submitted` line so you see roster coverage at a glance.
6. Commits the updated `*/scores.json` files back to `<org>/classroom50` on a single `collect: refresh scores.json` commit. A no-op run (no submissions changed) does not produce a commit.

**Token requirements.** The workflow reads the `CLASSROOM50_COLLECT_TOKEN` secret provisioned by `gh teacher init` (a fine-grained PAT with `Contents: read` on `<classroom>-*` repos). If that token expires mid-semester, the workflow run fails loudly with a 401 — rotate with `gh teacher rotate-collect-token <org>`.

**Override workflow.** To grant partial credit for a flaky test or correct a misgrade, hand-edit `<classroom>/scores.json` in the config repo, change the row's `score`, and add `"override": true`. Commit and push. The next collect run will leave that row alone. A `gh teacher score override` CLI helper is planned for a later release; until then, the JSON edit is the canonical path.

**`scores.json` shape:**

```json
{
  "schema": "classroom50/scores/v1",
  "submissions": [
    {
      "schema": "classroom50/result/v1",
      "classroom": "cs-principles",
      "assignment": "hello",
      "usernames": ["alice"],
      "submission": "submit/2026-06-01T14-32-05Z",
      "commit": "https://github.com/cs50-fall-2026/cs-principles-hello-alice/commit/...",
      "release": "https://github.com/cs50-fall-2026/cs-principles-hello-alice/releases/tag/submit%2F2026-06-01T14-32-05Z",
      "review": "https://github.com/cs50-fall-2026/cs-principles-hello-alice/commit/...",
      "datetime": "2026-06-01T14:33:11Z",
      "score": 18,
      "max-score": 30,
      "tests": [
        { "test-name": "compiles", "passed": true, "score": 10, "max-score": 10 }
      ]
    }
  ]
}
```

One row per (assignment, student) tuple. Re-running collect refreshes each row with the latest release's data unless `override: true` is set.

## 10. Download submissions

After students have run `gh student submit`, pull every student's latest submission for an assignment with:

```sh
gh teacher download <org> <classroom> <assignment>
```

![Demo: gh teacher download](images/gh_teacher_download.gif)

This pages through the org's repos, finds every one whose name starts with `<classroom>-<assignment>-` (the convention `gh student accept` uses: `<classroom>-<assignment>-<username>`), and shells out to `gh repo clone` for each. Authentication flows through the current `gh` session — no separate git credential setup is needed for private classroom repos.

Each run produces a fresh timestamped folder named `<classroom>-<assignment>_submissions_YYYY_MM_DD_T_HH_MM_SS/` (24-hour local time), so re-running picks up newer submissions without overwriting earlier downloads. Override the destination with `-d`:

```sh
gh teacher download -d <dir> <org> <classroom> <assignment>     # literal, no timestamp
```

Existing target dirs are skipped, so re-runs with the same `-d` pick up new submissions without aborting on the ones already cloned. Pass `--quiet` / `-q` to suppress the per-repo summary and forward `--quiet` to git; pass `--verbose` / `-v` to stream raw git output instead of the concise `Cloning <name>... Done` summary.

## See also

- [`gh teacher` command reference](gh-teacher) — every command and flag.
- [Troubleshooting](Troubleshooting) — debug flags, common errors.
