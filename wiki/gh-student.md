# `gh student` reference

Complete reference for the student CLI. For a step-by-step walkthrough, see the [CLI Student Guide](CLI-Student-Guide).

Run `gh student <command> --help` for the live flag list. Errors always go to stderr with a non-zero exit code. Pass `--verbose` / `-v` to any command to see per-step operational details (repo creation, collaborator updates, metadata writes, `git` activity).

## Commands at a glance

| Command | Description |
| --- | --- |
| `gh student whoami` | Print the authenticated GitHub user. |
| `gh student login` | Log in to GitHub via `gh auth login`, requesting `read:org` and `repo` (required for accepting assignments). Pass `-s` to add other scopes. Other commands trigger this same login flow automatically when no token is configured for `github.com`. |
| `gh student logout` | Log out of GitHub via `gh auth logout`. |
| `gh student accept <org> <classroom> <assignment>` | Accept an assignment: auto-accept any pending org invite, create a private repo from the template, add the student as `maintain`, write `.classroom50.yaml`, and print clone instructions. |
| `gh student invite <org>/<repo> <user>` | Invite a classmate or TA to the repo with `push` permission. |
| `gh student group join <org> <classroom> <assignment> <owner-username>` | For a group assignment, join the shared repo a teammate created (added as `push`, up to the instructor's group size — CLI-enforced, best-effort). |
| `gh student submit` | Snapshot the current branch and push it as a new commit on top of the assignment repo's `main` branch (after refreshing the instructor's `.gitignore` and `.github/` from the template). The autograde workflow tags and grades automatically. |

## `gh student accept`

```sh
gh student accept <org> <classroom> <assignment>
```

Creates a private copy of the assignment template repo for the student under `<org>/<classroom>-<assignment>-<username>` (lowercased), then prints a `git clone` command.

Under the hood:

1. If the student has a pending org invitation, auto-accept it via `PATCH /user/memberships/orgs/{org}` with `{"state": "active"}` ([docs](https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#update-an-organization-membership-for-the-authenticated-user)).
2. **Look up the assignment on the classroom's Pages site.** Fetch `https://<org>.github.io/classroom50/<classroom>/assignments.json` (the published `assignments.json`; no token required) and find the entry whose `slug` matches `<assignment>`. The entry's `template.{owner,repo,branch}` is used to resolve the source template. Errors are surfaced loudly:
   - **Pages 404** → "the classroom may not exist yet, or `publish-pages.yaml` may not have run; ask your instructor to confirm the Pages site has deployed".
   - **Schema mismatch** (e.g. `assignments.json` advertises a v2 shape but this `gh-student` only handles v1) → tells the student to update `gh-student`.
   - **Missing slug** → "ask your instructor to run `gh teacher assignment add <org> <classroom> <assignment>`".
   - **`mode: group`** → accepted. The first teammate to `gh student accept` creates the shared repo (named after them); the others join it with `gh student group join <org> <classroom> <assignment> <owner-username>`. Only an unrecognized mode errors.
3. **Resolve the autograder workflow shim.** When the assignment's `autograder` field is `default` (the common case), the universal shim embedded in `gh-student` is used directly — no Pages fetch. When it's a non-default name (a teacher who's wired up a custom reusable workflow), the shim is fetched from `https://<org>.github.io/classroom50/<classroom>/autograders/<entry.autograder>.yaml`. Errors are surfaced loudly:
   - **404** → "autograder `<name>` not published yet — ask your instructor to confirm `<classroom>/autograders/<name>.yaml` exists in the config repo and that `publish-pages.yaml` has run".
   - **Malformed YAML** → "autograder `<name>` is malformed YAML — ask your instructor to check the file in the config repo".
   - **Empty body** → "Pages deployment may still be in flight; retry in a minute" (the Pages cache occasionally serves a stub right after a fresh deploy).

   Resolution happens *before* creating the assignment repo so a non-default-shim fetch failure surfaces without leaving a half-baked repo on the teacher's org.
4. **Create the assignment repo from the resolved template.** `POST /repos/{template.owner}/{template.repo}/generate` ([docs](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-using-a-template)) creates `<classroom>-<assignment>-<username>` (lowercased) under `<org>`. The template may live in another org — a **404 on this call** surfaces "template `<owner>/<repo>` is not accessible to you — ask your instructor to make it public or grant your account access". A 422 with the GitHub "already exists" message short-circuits to `Assignment already accepted: <org>/<repo>` and leaves the existing repo untouched.
5. **Disable issues, projects, and wiki** on the new repo via `PATCH /repos/{owner}/{repo}` so the assignment surface is just code + history.
6. **Add `<username>` as a `maintain` collaborator** via `PUT /repos/{owner}/{repo}/collaborators/{username}` ([docs](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator)). The PUT is upsert; a single call covers both the initial add and the downgrade from the creator-default `admin` to `maintain`.
7. **Drop `.classroom50.yaml` and `.github/workflows/autograde.yaml` in a single Tree commit** on the templated branch. The metadata records:
   - `classroom` / `assignment` — identity.
   - `source.{owner,repo,branch}` — the template repo (resolved from the assignments.json entry). `gh student submit` reads this on every submit to refresh the instructor's `.gitignore` and `.github/`.

   The runner derives the config-repo coordinates at workflow time from the calling repo's org (`${{ github.repository_owner }}`) and the classroom slug, so no extra block is needed on disk.
8. Print the `git clone` command, with a warning if the student is currently inside a git repo (to avoid an accidental nested clone).

Re-running on an already-accepted assignment short-circuits with `Assignment already accepted: <org>/<repo>` and leaves the existing repo (and any work in it) alone.

## `gh student invite`

```sh
gh student invite <org>/<repo> <username>
```

Invites a classmate or TA to a repo with `push` permission. Calls `PUT /repos/{owner}/{repo}/collaborators/{username}` ([docs](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator)).

## `gh student group join`

```sh
gh student group join <org> <classroom> <assignment> <owner-username>
```

For **group assignments**, join the shared repo a teammate already created. The first teammate runs `gh student accept` (which creates the repo, named after them); everyone else runs `group join`, passing that teammate's username as `<owner-username>`.

The command reads the assignment from the classroom's published Pages site, confirms it's a group assignment, then adds you as a `push` collaborator on `<org>/<classroom>-<assignment>-<owner-username>` — provided the group isn't already full. Re-running once you're already a member is a clean no-op.

The group size is the `--max-group-size` the instructor set. **The limit is enforced only through this CLI**: it counts the repo's current student members (admin collaborators — the instructor and any TA — are excluded) and refuses to add you past the maximum. A teammate can still add collaborators directly through GitHub's web UI, which this command cannot prevent — so the limit is best-effort, not a hard guarantee.

Pass `--json` to emit a `{action, org, repo, login, member_count, max_group_size}` object instead of prose, so a script can branch on `action` (`added` | `already_member` | `refused_full` | `not_found`) without matching message text. The `refused_full` and `not_found` cases still print the object (on stdout) and exit non-zero.

## `gh student submit`

```sh
gh student submit
```

Run from inside a cloned assignment repo. Snapshots the current working tree and pushes it as a new commit on top of `main`. The autograde workflow in the student repo listens for the push, creates its own `submit/<UTC-timestamp>-<short-sha>` tag, and publishes a scored Release at that tag a minute or two later.

Functionally equivalent to `git commit -am "Submit" && git push`, with the template `.gitignore`/`.github/` refresh as the only delta — submit doesn't manage tags, manifests, or the autograde workflow shim itself.

Under the hood:

1. **Read `.classroom50.yaml`** from the local clone for `source.owner`, `source.repo`, `source.branch`, `classroom`, and `assignment`.
2. **Copy submittable files** (tracked + untracked-not-ignored) into a temp worktree so the submission isn't polluted by build artifacts or unrelated state.
3. **Fetch instructor `.gitignore` and `.github/`** (both optional) from `source.owner/source.repo@source.branch` via `GET /repos/{owner}/{repo}/contents/{path}` ([docs](https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10#get-repository-content)) so any teacher-side updates flow through on the next submit.
4. **Push the submission to `main`.** `git clone --bare` the remote, stage the temp worktree, commit (with the user's GitHub login + noreply email, scoped via `git -c user.name=... -c user.email=...`), push as a fast-forward. Submissions overlay as commits — no force-push, prior commits stay reachable for review.
5. **Print URLs** for the Actions tab (where the autograde run will appear) and the releases page (where the scored release will land).

The commit is authored with the user's GitHub login and noreply email (`<id>+<login>@users.noreply.github.com`) via `git -c user.name=... -c user.email=...`, so a fresh shell with no global git identity still submits cleanly. `GIT_AUTHOR_*` / `GIT_COMMITTER_*` environment variables override these defaults.

Tagging is the runner's job — the autograde workflow's first step creates `submit/<UTC-timestamp>-<short-sha>` at the just-pushed SHA. That gives each submission an immutable history entry plus its own Release without `gh student submit` having to know anything about tags.

The hardcoded `main` push target means templates whose default branch is `master`/`develop` end up with a separate `main` after the first submit.

## `gh student whoami` / `login` / `logout`

- `gh student whoami` — prints the authenticated GitHub user.
- `gh student login` — runs `gh auth login -s read:org -s repo`, optionally with additional scopes via `-s/--scope`.
- `gh student logout` — runs `gh auth logout`.

## Contributing

Building, testing, and linting the extension is documented in the [`cli/gh-student/` README](https://github.com/foundation50/classroom50/blob/main/cli/gh-student/README.md) in the repo (where contributors expect to find it).
