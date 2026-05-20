# `gh student` reference

Complete reference for the student CLI. For a step-by-step walkthrough, see the [Student Guide](Student-Guide).

Run `gh student <command> --help` for the live flag list. Errors always go to stderr with a non-zero exit code. Pass `--verbose` / `-v` to any command to see per-step operational details (repo creation, collaborator updates, metadata writes, `git` activity).

## Commands at a glance

| Command | Description |
| --- | --- |
| `gh student whoami` | Print the authenticated GitHub user. |
| `gh student login` | Log in to GitHub via `gh auth login`, requesting `read:org` and `repo` (required for accepting assignments). Pass `-s` to add other scopes. Other commands trigger this same login flow automatically when no token is configured for `github.com`. |
| `gh student logout` | Log out of GitHub via `gh auth logout`. |
| `gh student accept <org> <classroom> <assignment>` | Accept an assignment: auto-accept any pending org invite, create a private repo from the template, add the student as `maintain`, write `.classroom50.yml`, and print clone instructions. |
| `gh student invite <org>/<repo> <user>` | Invite a classmate or TA to the repo with `push` permission. |
| `gh student submit` | Snapshot the current branch and push it as a new commit on top of the assignment repo's `main` branch (after fetching the instructor's `.gitignore` and `.github/` from the template). |

## `gh student accept`

```sh
gh student accept <org> <classroom> <assignment>
```

Creates a private copy of the assignment template repo for the student under `<org>/<classroom>-<assignment>-<username>` (lowercased), then prints a `git clone` command.

Under the hood:

1. If the student has a pending org invitation, auto-accept it via `PATCH /user/memberships/orgs/{org}` with `{"state": "active"}` ([docs](https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#update-an-organization-membership-for-the-authenticated-user)).
2. **Look up the assignment on the classroom's Pages site.** Fetch `https://<org>.github.io/classroom50/<classroom>/assignments.json` (the published `assignments.json`; no token required) and find the entry whose `slug` matches `<assignment>`. The entry's `template.{owner,repo,branch}` is used to resolve the source template. Errors are surfaced loudly:
   - **Pages 404** → "the classroom may not exist yet, or `publish-pages.yml` may not have run; ask your instructor to confirm the Pages site has deployed".
   - **Schema mismatch** (e.g. `assignments.json` advertises a v2 shape but this `gh-student` only handles v1) → tells the student to update `gh-student`.
   - **Missing slug** → "ask your instructor to run `gh teacher assignment add <org> <classroom> <assignment>`".
   - **`mode: group`** → "group assignments are not yet supported (deferred to v0.3)". Group mode is reserved for a future release; the teacher CLI rejects `--mode group` symmetrically.
3. **Create the assignment repo from the resolved template.** `POST /repos/{template.owner}/{template.repo}/generate` ([docs](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-using-a-template)) creates `<classroom>-<assignment>-<username>` (lowercased) under `<org>`. The template may live in another org — a **404 on this call** surfaces "template `<owner>/<repo>` is not accessible to you — ask your instructor to make it public or grant your account access". A 422 with the GitHub "already exists" message short-circuits to `Assignment already accepted: <org>/<repo>` and leaves the existing repo untouched.
4. **Disable issues, projects, and wiki** on the new repo via `PATCH /repos/{owner}/{repo}` so the assignment surface is just code + history.
5. **Add `<username>` as a `maintain` collaborator** via `PUT /repos/{owner}/{repo}/collaborators/{username}` ([docs](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator)). The PUT is upsert; a single call covers both the initial add and the downgrade from the creator-default `admin` to `maintain`.
6. **Drop `.classroom50.yml` and `.github/workflows/autograde.yml` in a single Tree commit** on the templated branch. The metadata records four blocks:
   - `classroom` / `assignment` — identity.
   - `source.{owner,repo,branch}` — the template repo (resolved from the assignments.json entry).
   - `config.{owner,repo,branch,path}` — the per-org config repo (`<org>/classroom50`) and the classroom directory path. The autograde workflow reads this at run time to find the published `assignments.json`.
   - `autograde.version` — mirrors the `# classroom50-autograde-version: <semver>` sentinel comment at the top of the dropped workflow. The workflow's load job uses it to detect drift between a local copy and the canonical version (the drift-detection job lands with v0.2 step 5; the recorded version lands now so old `gh-student` versions don't surprise the workflow when it ships).
7. Print the `git clone` command, with a warning if the student is currently inside a git repo (to avoid an accidental nested clone).

Re-running on an already-accepted assignment short-circuits with `Assignment already accepted: <org>/<repo>` and leaves the existing repo (and any work in it) alone.

## `gh student invite`

```sh
gh student invite <org>/<repo> <username>
```

Invites a classmate or TA to a repo with `push` permission. Calls `PUT /repos/{owner}/{repo}/collaborators/{username}` ([docs](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator)).

## `gh student submit`

```sh
gh student submit
```

Run from inside a cloned assignment repo. Snapshots the current working tree, pushes it as a new commit on top of `main`, and pushes a lightweight `submit/<UTC-timestamp>` tag at the same SHA. The autograde workflow listens for that tag and publishes a GitHub Release with `autograde.json` attached and a scored body shortly after.

Under the hood:

1. **Read `.classroom50.yml`** from the local clone for `source.owner`, `source.repo`, and `source.branch`.
2. **Copy submittable files** (tracked + untracked-not-ignored) into a temp worktree so the submission isn't polluted by build artifacts or unrelated state.
3. **Fetch instructor `.gitignore` and `.github/`** (both optional) from `source.owner/source.repo@source.branch` via `GET /repos/{owner}/{repo}/contents/{path}` ([docs](https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10#get-repository-content)) so any teacher-side updates flow through on the next submit.
4. **Refresh the autograde workflow** by overwriting `.github/workflows/autograde.yml` with the version-substituted copy embedded in `gh-student`. The workflow YAML stays in lockstep with the CLI version sentinel regardless of what the template ships. The recorded `autograde.version` in `.classroom50.yml` is re-rendered to match.
5. **Push the submission to `main`.** `git clone --bare` the remote, stage the temp worktree, commit (with the user's GitHub login + noreply email, scoped via `git -c user.name=... -c user.email=...`), push as a fast-forward. Submissions overlay as commits — no force-push, prior commits stay reachable for review.
6. **Push a `submit/<UTC-timestamp>` tag** at the just-pushed SHA. The tag fires the autograde workflow (which triggers on `submit/*` tags), giving each submission an immutable history entry plus its own Release. The tag is pushed *after* the `main` push so the workflow never runs against a non-existent commit.
7. **Print three URLs** for tracking the submission:
   - the submit tag (`.../tree/submit%2F...`),
   - the Actions tab (`.../actions`, where the autograde workflow run shows up),
   - the eventual release (`.../releases/tag/submit%2F...`, 404 until the workflow finishes).

The commit is authored with the user's GitHub login and noreply email (`<id>+<login>@users.noreply.github.com`) via `git -c user.name=... -c user.email=...`, so a fresh shell with no global git identity still submits cleanly. `GIT_AUTHOR_*` / `GIT_COMMITTER_*` environment variables override these defaults.

The hardcoded `main` push target means templates whose default branch is `master`/`develop` end up with a separate `main` after the first submit. That hardcoded value is unchanged from v0.1.

## `gh student whoami` / `login` / `logout`

- `gh student whoami` — prints the authenticated GitHub user.
- `gh student login` — runs `gh auth login -s read:org -s repo`, optionally with additional scopes via `-s/--scope`.
- `gh student logout` — runs `gh auth logout`.

## Contributing

Building, testing, and linting the extension is documented in the [`cli/gh-student/` README](https://github.com/foundation50/classroom50/blob/main/cli/gh-student/README.md) in the repo (where contributors expect to find it).
