# Classroom 50 CLI - Teacher Guide

**This guide is under active development; the complete version will be available on July 1.** It currently documents the command-line setup path. Starting July 1, teachers will be able to set up a classroom either from the command line or from the web interface, and this guide will cover both. See the [overview](Home) for more.

End-to-end walkthrough for instructors. Each step assumes the previous ones are done. Install the CLI first — see [Installation](Installation).

## 1. Set up the organization (one-time, on github.com)

The CLI doesn't create the org for you. Do these once via the GitHub web UI:

1. **Create the organization** at <https://github.com/account/organizations/new>.
2. **Create a template assignment repo.** Any repo flagged as a template (Settings → "Template repository") works. **The template must be public** so students can read it: the "No permission" baseline that `gh teacher init` applies in step 3 blocks org members from reading private repos they aren't explicit collaborators on, and a private template would 404 on `gh student accept`. The Free and Team plans don't have a way around this. (GitHub Enterprise Cloud has a third visibility called "internal" that all enterprise members can read without per-repo collaboration; on that plan an internal template works without going public — see [GitHub's docs on internal repositories](https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/about-repositories#about-internal-repositories).) See [Assignment Templates](Assignment-Templates) for the expected file structure; copy that layout into your own template repo.

The org member-privilege lockdown (base permission "No permission", and disabling every member capability except private-repo creation) is applied by `gh teacher init` (step 3 below) — no manual web-UI tweak required for those. Four settings that have no API are listed as a one-time manual checklist under step 3.

## 2. Log in with the right scopes

`gh teacher login` grants the OAuth scopes the teacher commands need (`admin:org` for org invitations, `workflow` so `gh teacher init` can commit the config repo's workflow files), which a plain `gh auth login` doesn't. Run once:

```sh
gh teacher login
```

![Demo: gh teacher login](images/gh_teacher_auth.gif)

This shells out to `gh auth login -s admin:org -s workflow` and opens a browser to authorize. If you haven't logged in to `gh` before, it performs the initial login and grants both scopes in one shot; if you have, it re-authenticates with them appended.

If you skip this step and have no token at all, the CLI detects the missing token and runs `gh teacher login` automatically. If a token exists but lacks `admin:org` or `workflow`, the affected command (`gh teacher invite` or `gh teacher init`, respectively) fails with an error instructing you to run `gh teacher login` to grant the missing scope.

## 3. Bootstrap the classroom50 config repo

Run once per teaching org to create `<org>/classroom50` — the private config repo that will hold classroom metadata, published assignment manifests, and collected scores:

```sh
CLASSROOM50_COLLECT_TOKEN=github_pat_... gh teacher init <org>
```

Or omit the env var and the command prompts for the token interactively:

```sh
gh teacher init <org>
```

`init` is idempotent: re-running picks up where a prior run left off. It also offers to refresh skeleton files that differ from the CLI's embedded version (how an existing org gains new features like declarative tests) — since that resets any teacher edits to those files, it asks for confirmation first and skips them if you decline (`--yes` skips the prompt for scripted runs).

**Collect token.** Supply a fine-grained PAT with **Contents: read** to all repositories in the org. Store it only via the `CLASSROOM50_COLLECT_TOKEN` environment variable or a hidden stdin prompt — there is no `--collect-token` flag (command-line PATs leak via shell history and process listings). Use an org-owned service account, not a personal teacher account; pass `--service-account-confirm` to silence the reminder. Rotate before expiry (fine-grained PATs support up to 1 year; 90 days is a common rotation interval) with:

> **Group assignments need no extra scope.** A group assignment grades once in
> the first-accepter's repo; `collect-scores` then reads that repo's collaborators
> to give every group member the same score row. Listing collaborators
> (`GET /repos/{owner}/{repo}/collaborators`) requires only `Metadata: read`,
> which is auto-included on every fine-grained PAT (and already implied by the
> `Contents: read` you grant above), so the same collect token works for
> individual and group assignments alike — no scope change needed.

> **Why all repositories, not just `<classroom>-*`?** Student repos are created on
> demand when students run `gh student accept`, so they don't exist when you mint the
> token — a PAT scoped to "Only select repositories" can't include them, and
> `collect-scores` silently counts those students as not submitted, logging
> `0/<N> submitted` for the assignment, since an unreadable repo and one with no
> release yet both surface as a 404 from `/releases/latest`. Org-wide
> `Contents: read` is broader than strictly necessary, but it avoids that trap;
> tighten it later if your org policy requires.

```sh
gh teacher rotate-collect-token <org>
```

**What `init` sets up:** a least-privilege lockdown of org member privileges (the only enabled member capabilities are private repo creation — `members_can_create_private_repositories: true` so `gh student accept` works — and public Pages creation, which init **enforces** so the config repo's public Pages site keeps publishing; everything else is denied: `default_repository_permission: none`, no public/internal repo creation, no private Pages, no repo delete/transfer, no repo visibility change, no issue deletion, no team creation, no dependency-insights viewing, no private-repo forking, and no member-invited outside collaborators — applied via a combined `PATCH /orgs/{org}` that falls back to one PATCH per policy if a plan-gated or enterprise-locked field is rejected, warning only for the fields it can't set), GitHub Actions enabled for the org and re-enabled on the `classroom50` repo so the workflows can run, private `classroom50` repo with `auto_init`, embedded workflows (`publish-pages.yaml`, `collect-scores.yaml`, reusable `autograde-runner.yaml`), GitHub Pages (workflow build, visibility set to **public** so students can fetch published `assignments.json` unauthenticated; non-default `--autograder` YAML shims, when registered, are also fetched from Pages), branch protection on the default branch, workflow `GITHUB_TOKEN` permissions (409 tolerated when the org enforces a stricter policy — skeleton workflows declare their own workflow-level `permissions:` blocks), reusable-workflow access for other repos in the org (so student shims can `uses:` the runner), and the repo-level `CLASSROOM50_COLLECT_TOKEN` Actions secret.

This member-privilege lockdown is what makes it safe for `gh student accept` to leave each student as **admin** of their own assignment repo: students need admin to manage collaborators (so a group founder can add teammates with `gh student invite`), and the org-level locks defang the dangerous repo-admin powers (delete, transfer, visibility change) org-wide.

### Manual org hardening (one-time)

Four member-privilege settings have **no REST API**, so `gh teacher init` can't set them (it prints this same reminder). Apply them once at **Org → Settings → Member privileges** (`https://github.com/organizations/<org>/settings/member_privileges`):

- [ ] **App access requests** → Members only (or Disabled)
- [ ] **GitHub Apps** → deselect "Allow repository admins to install GitHub Apps for their repositories"
- [ ] **Projects base permissions** → No access
- [ ] **Branch renames** → deselect "Allow repository administrators to rename branches protected by organization rules" (enabled by default on new orgs; **defense-in-depth** — the `classroom50-protect-submission-history` org ruleset already protects each repo's default branch with org-admin-only bypass, so a student-admin cannot rename out of that protection. Disable it as a tidy-up.)

**Plan check.** `init` warns when the org is not on Team or Enterprise Cloud (required for Pages from a private repo). The warning is advisory; you can still proceed.

After `init` completes, the CLI prints the future Pages URL (`https://<org>.github.io/classroom50/`) and suggests `gh teacher classroom add` as the next step.

## 4. Add a classroom

> **Migrating from GitHub Classroom?** If you already run a course on the legacy product, replace steps 4 and 7 with `gh teacher classroom migrate --source <id-or-org> --target <org>` — it discovers the source classroom, copies each starter repo into your target org as a fresh template, and commits a populated `<short-name>/` directory in one Tree commit. The roster and scores are not migrated; onboard students for the new term via step 6 below. See [`gh teacher classroom migrate`](gh-teacher#gh-teacher-classroom-migrate) for the full reference; pass `--dry-run` first to preview without writing.

Each classroom is a directory at the root of `<org>/classroom50` holding four files:

- `classroom.json` — public name / term / org metadata.
- `assignments.json` — assignment manifest (published via Pages, fetched by `gh student accept` and by the autograde-runner workflow on every submission).
- `students.csv` — private roster.
- `scores.json` — private collected scores.

Plus, optionally:

- `autograder.py` at the classroom root — the **classroom default autograder**, used by every assignment that doesn't have its own override. Drop it via `gh teacher autograder set-default` (no scaffold by default — classrooms work without one, the runner just publishes a vacuous-pass result).
- `autograders/<slug>/` subdirectories — **per-assignment overrides**. One folder per assignment slug containing `autograder.py` (the entrypoint) and any sibling fixtures or helpers.

Foundation50-managed pieces (the runner-side bootstrap `.github/scripts/runner.py`, the runner workflow, the publish-pages allow-list) live at the org level, not per-classroom; the autograder shim that lands in each student repo is embedded in `gh-student` and never has to be edited by a teacher.

Scaffold one with:

```sh
gh teacher classroom add <org> <short-name> --name "<full name>" --term <term>
```

For example:

```sh
gh teacher classroom add cs50-fall-2026 cs-principles --name "CS Principles" --term Spring-2026
```

The `<short-name>` must match `^[a-z0-9][a-z0-9-]{1,38}$` (2-39 chars, lowercase letters/digits/hyphens, starting with a letter or digit) because it flows into student repo names like `<short-name>-<assignment>-<username>`. `--name` and `--term` are optional but recommended — they're written into `classroom.json` and surface in the published Pages site (forthcoming) and in `gh teacher download` summaries.

The command commits all four paths in a single Tree commit on the default branch. If `<org>/classroom50` doesn't exist yet, it prints `run gh teacher init <org> first` and exits non-zero. If the `<short-name>` directory already exists, it refuses to overwrite rather than clobbering an in-progress classroom — modify it via `gh teacher roster add` (step 6) and `gh teacher assignment add` (step 7) instead.

Run this command once per classroom you teach in the org. You can have several classrooms side by side in the same `classroom50` repo.

**Managing classrooms later.** List what's registered with `gh teacher classroom list <org>` (add `--json` for the display name and term). Change a classroom's display name or term with `gh teacher classroom edit <org> <short-name> --name "…" --term …` (the short-name itself is immutable). Delete one with `gh teacher classroom remove <org> <short-name>` — it removes the `<short-name>/` config directory only (not student repos) and asks you to type the short-name to confirm (`--yes` skips the prompt). See the [`gh teacher` reference](gh-teacher#gh-teacher-classroom-list) for details.

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

**View the current roster:**

```sh
gh teacher roster list <org> <classroom>
gh teacher roster list cs50-fall-2026 cs-principles --json
gh teacher roster list cs50-fall-2026 cs-principles --quiet
```

Prints `students.csv` without opening it on GitHub. Default output is an aligned table (username, name, email, section, github_id; empty cells show as `-`) with a `N student(s)` summary on stderr. Use `--json` for scripting (the full row objects) or `--quiet` for one username per line (handy for piping into `xargs` or an agent loop). An empty roster exits 0 with a clear note; a missing `students.csv` points you back at `gh teacher classroom add`. Read-only — no commit lands.

**Remove a student from the roster:**

```sh
gh teacher roster remove <org> <classroom> <username>
```

Drops the row from `students.csv`. **Does NOT remove org membership** — use `gh teacher remove <org> <username>` (step 8) for that. Splitting roster removal from org removal is deliberate: an off-by-one roster edit shouldn't be able to revoke a student's access to every repo in the org.

`roster list` is read-only; the three write subcommands (`add`, `import`, `remove`) go through an optimistic-update-with-rebase loop (a small number of retries with exponential backoff) so two teachers editing the roster concurrently can't silently lose each other's work. If you see a `lost the rebase race` message, just retry the command.

## 7. Add assignments

Each classroom keeps an `assignments.json` file inside `<org>/classroom50/<classroom>/`. Each entry pairs a slug (used in student repo names like `<classroom>-<slug>-<username>`) with a template repo, an optional due date, an optional runtime block, and the workflow-shim name (the `autograder` field; defaults to `default` = the universal shim embedded in `gh-student`). Register one with:

```sh
gh teacher assignment add <org> <classroom> <slug> --name "<name>" --template <owner>/<repo>[@branch] [--description <text>] [--due <ISO-8601>] [--runtime <path>] [--autograder <name>]
gh teacher assignment add cs50-fall-2026 cs-principles hello --name "Hello" --template cs50/hello-template --due 2026-09-15T23:59:00-04:00
gh teacher assignment add cs50-fall-2026 cs-principles greet --name "Greet" --template cs50/greet-template --runtime ./runtime-c.json
```

**`--name` and `--template` are required.** The slug must match `^[a-z0-9][a-z0-9-]{1,38}$` (the same shape as classroom short-names). The template repo must be flagged `is_template: true` (Settings → "Template repository") and visible to your token — if it lives in another org and isn't public, students won't be able to read it either. When you omit `@branch`, the CLI reads the template's default branch from `GET /repos/{owner}/{repo}` and writes that into `assignments.json`.

**Per-assignment grading is NOT registered here.** Drop an `autograder.py` at `<classroom>/autograders/<slug>/autograder.py` in the config repo — that single file is the entrypoint the runner invokes per submission. Or run `gh teacher autograder set-default <org> <classroom> --from <path>` to install a classroom default at `<classroom>/autograder.py` that grades every assignment in the classroom. See the [Autograders](Autograders) wiki page for the entrypoint contract and templates (pytest, check50, custom).

**Optional flags:**

- `--description <text>` — short description written into the entry.
- `--due <ISO-8601>` — a due date, e.g. `2026-09-15T23:59:00-04:00`. Normalized to a UTC instant before storage (so that example lands as `2026-09-16T03:59:00Z`). If you omit the offset (`2026-09-15T23:59:00`), your machine's local timezone is auto-detected and applied. The original value and detected zone are preserved in a `due_meta` block for auditing. A bare date with no time is rejected as ambiguous.
- `--mode individual|group` — `individual` (default) gives each student their own repo. `group` lets teammates share one repo: the first student to `gh student accept` creates it (and becomes its admin), then adds teammates with `gh student invite <org>/<repo> <teammate>`. Requires `--max-group-size`.
- `--max-group-size <N>` — maximum collaborators on a group repo (`>= 2`; required with `--mode group`, rejected otherwise). **The limit is advisory** — the CLI does not hard-enforce it; the founder coordinates group size when adding teammates, and collaborators can also be added directly through GitHub's web UI. At collection time a group submission's score is fanned out to every rostered member (the runner emits the owner; `collect-scores` reads the repo's collaborators and credits each — see step 9).
- `--runtime <path>` — JSON file describing the runtime environment for this assignment's autograde job (`runs-on`, `python` / `node` / `java` / `go`, `apt`, or a custom `container` image). Omit for the defaults (ubuntu-latest + Python 3.12). The runner reads this on every submission, so changes propagate without any student-repo edit. See the [Autograders](Autograders) wiki page for the schema and worked examples.
- `--autograder <name>` — reserved for swapping the entire reusable workflow (rare). For different language toolchains or apt packages, use `--runtime` instead. Default `default` resolves to the universal shim embedded in `gh-student`; non-default values reference a sibling `<classroom>/autograders/<name>.yaml` you've authored, and the CLI verifies that file exists before the assignment lands.

Re-running with the same slug replaces the entry in place (idempotent). New slugs append.

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

The default form is pipeable directly into `xargs gh teacher download` or any other command that takes a slug from stdin; the `--json` form preserves every field (template ref, due, autograder) for scripting against the manifest. Pass `-q` to suppress the stderr summary when capturing stdout in a script.

## 8. Remove students or TAs when needed

```sh
gh teacher remove <org> <username>           # remove from organization
gh teacher remove <org>/<repo> <username>    # remove from one repo
```

The org form revokes access to every repository in the org, removes the user from all teams, and cancels any pending invitation in one call. Both forms are idempotent — a 404 (user is not a member or collaborator) prints a clear message and exits 0 so re-runs are safe.

**Check who's actually a member:**

```sh
gh teacher member list <org>         # org members + pending invitations, with role
gh teacher member list <org>/<repo>  # repo collaborators, with permission level
```

The roster (`students.csv`) is the *intended* class list; this is *actual* GitHub membership, so the two can drift — e.g. a student who was added to the roster but never accepted their org invite still shows as a pending `invitation`, not a `member`. Default output is a table (`LOGIN`, `KIND`, `ROLE`, `GITHUB_ID`); add `--json` for scripting or `--quiet` for one login per line (pipe into `xargs`/`grep` or diff against the roster to spot who hasn't joined yet). Reading an org's pending invitations needs the `admin:org` scope (the same scope `invite` uses). Read-only.

## 9. Collect scores

Every student submission publishes a GitHub Release on their own repo carrying a `result.json` asset. The `collect-scores` workflow in `<org>/classroom50` walks every `(student, assignment)` pair in `<classroom>/students.csv` × `<classroom>/assignments.json`, asks GitHub for each expected repo's latest release, and aggregates the results into `<classroom>/scores.json` — the authoritative score record for the class.

Run it from the Actions tab on `<org>/classroom50`, or trigger it from your shell:

```sh
gh workflow run collect-scores.yaml --repo <org>/classroom50
gh workflow run collect-scores.yaml --repo <org>/classroom50 -f classroom=cs-principles    # one classroom only
```

The skeleton committed by `gh teacher init` ships the workflow with a nightly cron (`17 4 * * *` UTC), so even if you never trigger it manually, scores land in `scores.json` once a day. If you want manual-only triggering, comment out the `schedule:` block in `.github/workflows/collect-scores.yaml`.

What it does on each run:

1. Iterates every classroom under `<org>/classroom50/<classroom>/` (or just the one you passed via `-f classroom=`).
2. For each `(student, assignment)` pair in `students.csv` × `assignments.json`, computes the canonical repo name `<classroom>-<assignment>-<username>` (the same formula `gh student accept` uses) and asks GitHub for that repo's latest release. A `404` from `/releases/latest` means the student hasn't accepted or hasn't submitted yet — the collector counts the gap and moves on.
3. For each release found, downloads `result.json`, schema-validates it, and checks the payload's identity against the source repo: `classroom` / `assignment` must match, and the repo's derived owner must be the `usernames` entry for an individual assignment (or present among `usernames` for a group assignment). This defends against a hostile autograder payload trying to land in the wrong scores.json. For a group assignment, the collector then reads the repo's collaborators and rewrites `usernames` to the full rostered member list.
4. Upserts the validated payload into `<classroom>/scores.json` under that assignment's bucket, dropping the now-redundant `assignment` field from the stored row (it's the bucket key). If the assignment has `due`, the row also gets `"late": true` or `"late": false` by comparing the submission `datetime` against the due timestamp. **Existing entries with `"override": true` are preserved verbatim** -- if you hand-edited a row to grant partial credit, the next collect run leaves it alone.
5. Logs a per-assignment `cs-principles/hello: 23/30 submitted` line so you see roster coverage at a glance.
6. Commits the updated `*/scores.json` files back to `<org>/classroom50` on a single `collect: refresh scores.json` commit. A no-op run (no submissions changed) does not produce a commit.

**Token requirements.** The workflow reads the `CLASSROOM50_COLLECT_TOKEN` secret provisioned by `gh teacher init` (a fine-grained PAT with `Contents: read` on all org repos; see the collect-token note in the setup section above). If that token expires mid-semester, the workflow run fails loudly with a 401 — rotate with `gh teacher rotate-collect-token <org>`.

**Override workflow.** To grant partial credit for a flaky test or correct a misgrade, hand-edit `<classroom>/scores.json` in the config repo, change the row's `score`, and add `"override": true`. Commit and push. The next collect run will leave that row alone. A `gh teacher score override` CLI helper is planned for a later release; until then, the JSON edit is the canonical path.

**`scores.json` shape:** `submissions` is an object keyed by assignment slug; each value is that assignment's rows. For an individual assignment there is one row per student. For a **group assignment** there is one row per *group*, whose `usernames` lists every member — collect-scores reads the group repo's collaborators and credits all of them with the shared score (see the group note below). A row is the validated `result.json` payload with the redundant `assignment` field dropped (it's the bucket key); everything else, including `schema` and `tests`, is kept.

```json
{
  "schema": "classroom50/scores/v1",
  "submissions": {
    "hello": [
      {
        "schema": "classroom50/result/v1",
        "classroom": "cs-principles",
        "usernames": ["alice"],
        "submission": "submit/2026-06-01T14-32-05Z-a1b2c3d",
        "commit": "https://github.com/cs50-fall-2026/cs-principles-hello-alice/commit/...",
        "release": "https://github.com/cs50-fall-2026/cs-principles-hello-alice/releases/tag/submit%2F2026-06-01T14-32-05Z-a1b2c3d",
        "review": "https://github.com/cs50-fall-2026/cs-principles-hello-alice/compare/...",
        "datetime": "2026-06-01T14:33:11Z",
        "score": 18,
        "max-score": 30,
        "tests": [
          { "test-name": "compiles", "passed": true, "score": 10, "max-score": 10 }
        ]
      }
    ]
  }
}
```

One row per student (individual assignments) or one row per group (group assignments — `usernames` carries all members) within each assignment bucket. Re-running collect refreshes each row with the latest release's data unless `override: true` is set. (A scores.json still in the older flat-array layout is migrated to this map on the next collect run.)

**Group assignments.** A group assignment is graded once, in the first-accepter's repo. `collect-scores` reads that repo's student collaborators (org admins/instructors excluded), **keeps only those on the classroom roster** (the owner is always credited), and rewrites the row's `usernames` to that member list, so every rostered teammate gets the same score — `scores.csv` then has a row per member with the shared score. A non-rostered collaborator added out-of-band (e.g. via the GitHub UI) is **not** credited. Reading collaborators needs only `Metadata: read` (auto-included on every fine-grained PAT and already implied by `Contents: read`), so the existing collect token works as-is. If the collaborator read fails for any reason, the score is credited to the repo owner only and the run logs a warning. Teammates who joined a repo own no repo of their own, so they are not reported as "missing" in `gh teacher download`.

## 10. Download submissions

After students have run `gh student submit` and the autograde workflow has published its release, pull every student's latest submission for an assignment with:

```sh
gh teacher download <org> <classroom> <assignment>
```

![Demo: gh teacher download](images/gh_teacher_download.gif)

By default the command is **roster-driven**: it reads `<classroom>/students.csv` and `<classroom>/assignments.json` from your config repo, then for each roster entry:

1. Probes whether the expected `<classroom>-<assignment>-<username>` repo exists in the org.
2. Clones it if it does, or reports `Missing: <username> (not accepted yet?)` if it doesn't.
3. After each clone, refreshes `<repo>/result.json` from the latest submit-tag release on that repo — so the autograded payload lands alongside the code.

After all clones, the command writes a `scores.csv` summary at the destination root: one row per roster entry (`username,score,max_score,datetime,submission_tag,review_url,late,override`). Submitters carry their scores; non-submitters get blank score columns so you can sort the spreadsheet by score and immediately see who hasn't submitted yet.

Each run produces a fresh timestamped folder named `<classroom>-<assignment>_submissions_YYYY_MM_DD_T_HH_MM_SS/` (24-hour local time), so re-running picks up newer submissions without overwriting earlier downloads. Override the destination with `-d`:

```sh
gh teacher download -d <dir> <org> <classroom> <assignment>     # literal, no timestamp
```

Existing target dirs are skipped on the clone step, but `result.json` is still refreshed on the existing clones — so re-running after the latest `collect-scores.yaml` cycle picks up the newest score without re-cloning. Pass `--quiet` / `-q` to suppress the per-repo summary; pass `--verbose` / `-v` to stream raw git output instead of the concise `Cloning <name>... Done` summary.

**Fallback for unconfigured classrooms.** If the config repo isn't bootstrapped yet (no `students.csv`, no `assignments.json`), or you want to clone every matching repo regardless of who's currently rostered, pass `--by-pattern`:

```sh
gh teacher download --by-pattern <org> <classroom> <assignment>
```

That skips the roster lookup and instead pages through the org's repos, cloning every one whose name starts with `<classroom>-<assignment>-`. The `result.json` refresh and the `scores.csv` summary are also skipped in this mode.

## See also

- [`gh teacher` command reference](gh-teacher) — every command and flag.
- [Troubleshooting](Troubleshooting) — debug flags, common errors.
