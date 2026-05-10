# cli

Sources for `gh` CLI extensions. Each subfolder is its own extension; once published to its own repo, an extension is installable via:

```
gh extension install <owner>/<repo>
```

See the [GitHub CLI extensions docs](https://docs.github.com/en/github-cli/github-cli/creating-github-cli-extensions) for background on what `gh` extensions are and how they're built.

## Extensions

- [gh-teacher/](gh-teacher/) — instructor-facing extension.
- [gh-student/](gh-student/) — student-facing extension.

## Quick tutorial

The full lifecycle, end-to-end. Each step assumes the previous ones are done.

### 1. Install (from this repo)

You'll need [Go](https://go.dev/doc/install) and the [GitHub CLI (`gh`)](https://cli.github.com/). The auth steps below (`gh teacher login` / `gh student login`) handle GitHub authentication, so you don't need to run `gh auth login` separately first. The extensions themselves aren't published yet, so install them from a local checkout:

```
git clone https://github.com/foundation50/classroom50-prototype
cd classroom50-prototype

# teacher extension
(cd cli/gh-teacher && go build . && gh extension install .)

# student extension
(cd cli/gh-student && go build . && gh extension install .)
```

`gh teacher` and `gh student` are now available in your shell. Re-run `go build .` after pulling code changes; `gh extension install .` only needs to run once per extension.

### 2. Teacher: set up the organization (manual, on github.com)

The CLI doesn't create or configure orgs. Do these once, on github.com:

1. **Create the organization** at <https://github.com/account/organizations/new>.
2. **Set the org's base permission to "No permission"** at `https://github.com/organizations/{org}/settings/member_privileges` so students don't get implicit access to other repos in the org.
3. **Create a template assignment repo.** Any repo you flag as a template (in the repo's Settings, tick "Template repository") works. **The template must be public** so students can read it: the "No permission" baseline from the previous step blocks org members from reading private repos they aren't explicit collaborators on, and a private template would 404 on `gh student accept`. The Free and Team plans don't have a way around this. (GitHub Enterprise Cloud has a third visibility called "internal" that all enterprise members can read without per-repo collaboration; on that plan an internal template works without going public. See [GitHub's docs on internal repositories](https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/about-repositories#about-internal-repositories).) See [`templates/example-assignment/`](../templates/example-assignment/) in this repo for the expected file structure (`.github/`, starter code, README, and optional `.gitignore`); copy that layout into your own template repo.

### 3. Teacher: log in with the right scopes

Org invitations require the `admin:org` OAuth scope, which `gh auth login` doesn't grant by default. Run once:

```
gh teacher login
```

This shells out to `gh auth login -s admin:org` and opens a browser to authorize. If you haven't logged in to `gh` before, it performs the initial login and grants `admin:org` in one shot; if you have, it re-authenticates with the new scope appended. Either way, this is the only auth step you need before inviting students.

If you skip this step and run another command first (e.g. `gh teacher invite`), it will detect the missing token and run `gh teacher login` for you before continuing — the explicit step is just for predictability on a fresh setup.

### 4. Teacher: invite students to the org

For each student:

```
gh teacher invite {org} {username}
```

The student gets an email invitation. They can accept it by visiting `https://github.com/{org}`, or just skip ahead to step 5: `gh student accept` auto-accepts any pending org invite for the authenticated user before creating the assignment repo. Common API failures (missing scope, not an admin, org not found, already a member, pending invite) surface as actionable messages instead of raw HTTP errors.

### 5. Student: accept an assignment

```
gh student accept {org}/{classroom}/{assignment}
```

This creates a private copy of the template at `{org}/{username}-{assignment}` (lowercased) and prints a `git clone` command. Re-running on an already-accepted assignment short-circuits with an `Assignment already accepted: ...` message and leaves the existing repo (and any work in it) alone.

`{classroom}` is currently a free-form label the CLI just records in `.classroom50.yml` as `classroom`; it isn't validated against any GitHub concept, so any non-empty string works for now. Pick a stable name your class agrees on (e.g. `cs50-fall-2026`) since it'll persist in metadata for downstream tooling.

### 6. Student: submit

From inside the cloned repo:

```
gh student submit
```

This snapshots the current branch, fetches the latest instructor `.gitignore` (if present) and `.github/` from the template, and force-pushes the result to the assignment repo's `main` branch. Run this after each meaningful change; the latest submission is what the teacher sees.

### 7. Teacher: download submissions

To pull every student's latest submission for an assignment:

```
gh teacher download {org} {assignment}
```

Each run produces a fresh timestamped folder (`{org}_submissions_<timestamp>/`), so re-running picks up newer submissions without overwriting earlier downloads. Pass `-d <dir>` to override the destination (the value is taken literally, no timestamp).

### Debugging

Pass `--verbose` / `-v` to any teacher or student command to see per-step operational details (each REST call, raw `git` output during clone, etc.):

```
gh student submit -v
gh teacher download -v {org} {assignment}
```

For raw REST request/response logging, set `GH_DEBUG=api` in the environment; this is honored by the underlying [`go-gh`](https://github.com/cli/go-gh) library.

## Command spec

The behavior below is the design target for both extensions. Implementation status lives in each subfolder's README.

### Invite student to org ([gh-teacher/](gh-teacher/))

Uses the API to invite a student (or teaching assistant) to `{org}`.

```
gh teacher invite {org} {username}           # direct_member
gh teacher invite --admin {org} {username}   # admin
```

1. Get user ID from username, per <https://docs.github.com/en/rest/users/users?apiVersion=2026-03-10#get-a-user>.
1. Invite user ID to org, per <https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#create-an-organization-invitation>.
1. Advise the user to sign in to `https://github.com` as the invited GitHub user, then visit `https://github.com/{org}` to accept the invitation at the top of the page.

The org-invitation endpoint requires the `admin:org` OAuth scope, which is not granted by `gh auth login` by default. Run `gh teacher login` once before the first org invite; it shells out to `gh auth login -s admin:org` so it doubles as the initial login step on a fresh setup.

### Accept an assignment ([gh-student/](gh-student/))

Uses the API to create a repo from a template repo for the student called `{classroom}-{assignment}-{username}` in `{org}`, then uses git to clone it locally.

```
gh student accept {org}/{classroom}/{assignment}
```

1. If the student has a pending org invitation, auto-accept it via `PATCH /user/memberships/orgs/{org}` with `{"state": "active"}`, per <https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#update-an-organization-membership-for-the-authenticated-user>.
1. Create a private repo called `{classroom}-{assignment}-{username}`, **canonicalized as lowercase**, in `{org}` using the assignment's repo template, per <https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-using-a-template>. Disable issues, projects, and wiki by default. If the repo already exists (HTTP 422 already-exists), short-circuit with an `Assignment already accepted` message rather than touching the existing repo.
1. Add `{username}` as a `maintain` collaborator on the new repo via `PUT /repos/{owner}/{repo}/collaborators/{username}`, per <https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator>. The PUT is upsert: a single call covers both the initial add and the downgrade from the creator-default `admin` to `maintain`.
1. Create a `.classroom50.yml` file in the student's repo on the template's default branch containing requisite metadata as key-value pairs, per <https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10#create-or-update-file-contents>:
    * classroom ID
    * assignment ID
    * Owner/Repo/Branch from which the repo was created (the template repo's default branch is looked up at accept time so master/develop templates round-trip correctly).
1. Tell the student how to clone the new repo, with a warning if they're currently inside a git repo (to avoid an accidental nested clone).

### Invite classmate (or TA) to a repo ([gh-student/](gh-student/), [gh-teacher/](gh-teacher/))

Uses the API to invite a classmate (or teaching assistant) to `{org}/{repo}`.

```
gh student invite {org}/{repo} {username}
gh teacher invite {org}/{repo} {username}                 # default: push
gh teacher invite -p maintain {org}/{repo} {username}     # other permissions
```

1. Invite `{username}` to `{repo}`, per <https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator>. Default permission is `push`; `gh teacher invite` accepts `-p / --permission` with one of `pull`, `triage`, `push`, `maintain`, `admin`. Re-running with a different `-p` updates the existing collaborator's permission in place.
    * Is this necessary? Should students just use the GitHub.com GUI or the Classroom 50 GUI for such?

### Remove user from org or repo ([gh-teacher/](gh-teacher/))

Uses the API to remove a user from an organization or from a specific repository.

```
gh teacher remove {org} {username}           # remove from organization
gh teacher remove {org}/{repo} {username}    # remove from repository
```

1. For org targets, `DELETE /orgs/{org}/memberships/{username}`, per <https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#remove-organization-membership-for-a-user>. Revokes access to every repository in the org, removes the user from all teams, and cancels any pending invitation in one call.
1. For repo targets, `DELETE /repos/{owner}/{repo}/collaborators/{username}`, per <https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#remove-a-repository-collaborator>.
1. Both forms are idempotent: a `204` response prints "removed `{username}`", and a `404` (user is not a member or collaborator) prints a clear message and exits 0 so re-runs are safe.

### Submit an assignment ([gh-student/](gh-student/))

Snapshots the current working tree and force-pushes it to the assignment repo's `main` branch (hardcoded for now; templates whose default branch is `master`/`develop` will end up with a separate `main` after submit). Fetches the latest instructor `.gitignore` and `.github/` from the template recorded in `.classroom50.yml` first.

```
gh student submit
```

1. Read `.classroom50.yml` from the local clone for `source.owner`, `source.repo`, and `source.branch`.
1. Copy tracked + untracked-not-ignored files from the working tree into a temp directory so the submission isn't polluted by build artifacts or unrelated state.
1. Fetch the latest instructor `.gitignore` (if present) and `.github/` from `source.owner/source.repo@source.branch` via the GitHub contents API, per <https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10#get-repository-content>.
1. `git init` the temp directory, commit the snapshot, and force-push to the student's assignment repo. The snapshot semantics deliberately replace the remote branch with a fresh commit each time so submissions stay conflict-free.

Also relies on a GitHub Action (see [workflows/](../workflows/)) to create a full-diff tagged commit (on which the teacher can comment) and to create a release for that tag, with Markdown linking to autograding results (when ready).

### Download students' submissions ([gh-teacher/](gh-teacher/))

```
gh teacher download {org} {assignment}              # clones into {org}_submissions_<timestamp>/
gh teacher download -d {dir} {org} {assignment}     # clones into {dir}/ (literal, no timestamp)
gh teacher download -v {org} {assignment}           # streams raw git output per repo
```

1. Page through `GET /orgs/{org}/repos`, per <https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#list-organization-repositories>, collecting every repo whose name ends in `-{assignment}` (the `gh student accept` convention of `{username}-{assignment}`). The `{assignment}` argument is lowercased before matching so teachers can pass any case; the suffix match itself is exact against the lowercase names that `gh student accept` creates.
1. For each match, shell out to `gh repo clone {org}/{name} {dir}/{name}` so authentication flows through the current `gh` session — no separate git credential setup needed for private classroom repos. Default `{dir}` is `{org}_submissions_YYYY_MM_DD_T_HH_MM_SS` (24-hour local time) so each run produces a fresh folder and prior downloads are preserved without manual cleanup; pass `-d` to override (the value is taken literally, no timestamp appended). Pass `--quiet` / `-q` to suppress the per-repo summary and forward `--quiet` to git; pass `--verbose` / `-v` to stream raw git output instead of the concise `Cloning <name>... Done` summary.
1. Skip targets that already exist on disk so re-runs with `-d` pick up new submissions without aborting on the ones already cloned. Failures carry git's actionable diagnostic (e.g. `fatal: ...`) rather than just an exit code, and a non-zero exit code surfaces if any clone failed after the rest still run.
