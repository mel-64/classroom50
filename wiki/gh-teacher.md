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
| `gh teacher download <org> <classroom> <assignment>` | Clone every repo in `<org>` whose name starts with `<classroom>-<assignment>-`. Default destination is `<classroom>-<assignment>_submissions_<YYYY_MM_DD_T_HH_MM_SS>/`; override with `-d`. |
| `gh teacher init <org>` | Bootstrap `<org>/classroom50` (config repo, Pages, branch protection, collect-token secret). Idempotent. |
| `gh teacher rotate-collect-token <org>` | Replace the `CLASSROOM50_COLLECT_TOKEN` repo secret on an existing config repo. |
| `gh teacher classroom add <org> <short-name>` | Add a new classroom directory to `<org>/classroom50`. Optional flags: `--name "<display name>"`, `--term <e.g. Spring-2026>`. Refuses to overwrite an existing classroom. |
| `gh teacher roster add <org> <classroom> <username>` | Append or upsert a student in `students.csv`; resolves `github_id`, sends an org invite if needed. Optional flags: `--first-name`, `--last-name`, `--email`, `--section`. |
| `gh teacher roster remove <org> <classroom> <username>` | Remove a row from `students.csv`. Does NOT touch org membership. Idempotent. |
| `gh teacher roster import <org> <classroom> <path-to-csv>` | Bulk upsert from a local CSV (`username,first_name,last_name,email,section` header; trailing `github_id` accepted but ignored). One Tree commit; auto-invites new students. |

## `gh teacher init`

One-shot bootstrap for the per-org `classroom50` config repo. See the [Teacher Guide](Teacher-Guide) for when to run it in your workflow.

```sh
CLASSROOM50_COLLECT_TOKEN=ghp_xxx gh teacher init <org>
gh teacher init <org>                              # interactive token prompt
gh teacher init <org> --service-account-confirm    # silence service-account reminder
```

Performs these steps in order:

1. **Org plan check** — `GET /orgs/{org}`; warns when the org is not on Team or Enterprise Cloud (Pages from a private repo). Advisory only.
2. **Create or fetch repo** — `POST /orgs/{org}/repos` with `auto_init: true` for `classroom50`. On 422 (name taken), falls back to `GET /repos/{org}/classroom50`. The default branch from the response flows through to later steps (org policy can rename `main`).
3. **Skeleton drop** — single Tree commit of embedded files (`.github/workflows/`, `.github/scripts/`, `README.md`). Re-runs detect `.github/workflows/publish-pages.yml` and skip without overwriting teacher edits. `publish-pages.yml` is templated with the org's actual default branch at commit time.
4. **Enable Pages** — `POST .../pages` with `build_type: workflow`; 409 = already enabled.
5. **Branch protection** — no force pushes or branch deletion on the default branch.
6. **Workflow permissions** — raises default `GITHUB_TOKEN` to `write`. HTTP 409 (org-enforced policy) is tolerated; skeleton workflows declare workflow-level `permissions:` blocks.
7. **Collect token** — reads `CLASSROOM50_COLLECT_TOKEN` from env (trimmed), piped stdin, or hidden TTY prompt; libsodium sealbox-encrypts and uploads as a repo-level Actions secret.

**Collect token requirements:** fine-grained PAT with `Contents: read` on org repos matching `<classroom>-*`. No CLI flag for the value. Prefer an org-owned service account.

**Skeleton shipped:**

| Path | Status |
| --- | --- |
| `.github/workflows/publish-pages.yml` | Working allow-list Pages publisher |
| `.github/workflows/collect-scores.yml` | Placeholder (`workflow_dispatch` + nightly cron) |
| `.github/scripts/collect_scores.py` | Placeholder (exits 0 until implemented) |
| `README.md` | Describes the config repo layout |

Score collection is **pull-based**: the collect workflow (once implemented) polls student repos for `autograde.json` on submit-tag releases and writes `scores.json`. No cross-repo write PAT or `repository_dispatch` from student repos.

## `gh teacher rotate-collect-token`

Re-runs only step 7 of `init` — replaces the `CLASSROOM50_COLLECT_TOKEN` secret in place. Use when the PAT nears expiry, staff change, or after a suspected compromise.

```sh
CLASSROOM50_COLLECT_TOKEN=ghp_xxx gh teacher rotate-collect-token <org>
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
| `<short-name>/assignments.json` | `classroom50/assignments/v1` | Empty `assignments: []` array — populated by `gh teacher assignment add` (forthcoming). |
| `<short-name>/students.csv` | n/a | Header row `username,first_name,last_name,email,section,github_id`. The `email` column is optional per row (values may be empty). The trailing `github_id` is a hidden column populated by `gh teacher roster add/import` — do not hand-edit it. |
| `<short-name>/scores.json` | `classroom50/scores/v1` | Schema sentinel only — score entries are written by the `collect-scores.yml` workflow. |

**Errors:**

- `<org>/classroom50` does not exist → prints `run gh teacher init <org> first` and exits non-zero.
- `<short-name>` directory already exists in the config repo → refuses to overwrite. Use `gh teacher roster add` or `gh teacher assignment add` (assignment add forthcoming) to modify an existing classroom.
- Short-name fails the slug regex → prints the exact rule with the offending input.

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

Drops the row matching `<username>` (case-insensitive). Idempotent: a no-op + zero exit when the row is already absent. **Does NOT remove org membership** — that's a separate `gh teacher remove <org> <username>` so an off-by-one roster edit can't accidentally revoke a student's repo access. The `--also-remove-from-org` companion flag is deferred to v0.3.

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
gh teacher download <org> <classroom> <assignment>              # clones into <classroom>-<assignment>_submissions_<timestamp>/
gh teacher download -d <dir> <org> <classroom> <assignment>     # literal dir, no timestamp
gh teacher download -v <org> <classroom> <assignment>           # stream raw git output per repo
gh teacher download -q <org> <classroom> <assignment>           # suppress per-repo summary, forward --quiet to git
```

Under the hood:

1. Page through `GET /orgs/{org}/repos` ([docs](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#list-organization-repositories)), collecting every repo whose name starts with `<classroom>-<assignment>-` (matching the `gh student accept` convention `<classroom>-<assignment>-<username>`). The `<classroom>` and `<assignment>` arguments are lowercased before matching so any case works on the input side.
2. For each match, shell out to `gh repo clone <org>/<name> <dir>/<name>` so authentication flows through the current `gh` session — no separate git credential setup needed for private classroom repos.

Default destination is `<classroom>-<assignment>_submissions_YYYY_MM_DD_T_HH_MM_SS/` (24-hour local time) so each run produces a fresh folder and prior downloads are preserved without manual cleanup. Pass `-d` to override (the value is taken literally, no timestamp appended).

Existing target dirs are skipped, so re-runs with the same `-d` pick up new submissions without aborting on the ones already cloned. Failures carry git's actionable diagnostic (e.g. `fatal: ...`) rather than just an exit code, and a non-zero exit code surfaces if any clone failed after the rest still run.

## `gh teacher whoami` / `login` / `logout`

- `gh teacher whoami` — prints the authenticated GitHub user (a thin wrapper around `gh api user`).
- `gh teacher login` — runs `gh auth login -s admin:org`, optionally with additional scopes via `-s/--scope`.
- `gh teacher logout` — runs `gh auth logout`.

## Contributing

Building, testing, and linting the extension is documented in the [`cli/gh-teacher/` README](https://github.com/foundation50/classroom50/blob/main/cli/gh-teacher/README.md) in the repo (where contributors expect to find it).
