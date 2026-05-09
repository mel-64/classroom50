# cli

Sources for `gh` CLI extensions. Each subfolder is its own extension; once published to its own repo, an extension is installable via:

```
gh extension install <owner>/<repo>
```

See the [GitHub CLI extensions docs](https://docs.github.com/en/github-cli/github-cli/creating-github-cli-extensions) for background on what `gh` extensions are and how they're built.

## Extensions

- [gh-teacher/](gh-teacher/) — instructor-facing extension.
- [gh-student/](gh-student/) — student-facing extension.

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
1. Advise user to visit `https://github.com/{org}` to accept the invitation atop the page.

The org-invitation endpoint requires the `admin:org` OAuth scope, which is not granted by `gh auth login` by default. Run `gh teacher auth` once to refresh the token with that scope before the first org invite.

### Accept an assignment ([gh-student/](gh-student/))

Uses the API to create a repo from a template repo for the student called `{username}-{assignment}` in `{org}`, then uses git to clone it locally.

```
gh student accept {org}/{classroom}/{assignment}
```

1. If the student has a pending org invitation, auto-accept it via `PATCH /user/memberships/orgs/{org}` with `{"state": "active"}`, per <https://docs.github.com/en/rest/orgs/members?apiVersion=2026-03-10#update-an-organization-membership-for-the-authenticated-user>.
1. Create a private repo called `{username}-{assignment}`, **canonicalized as lowercase**, in `{org}` using the assignment's repo template, per <https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-using-a-template>. Disable issues, projects, and wiki by default. If the repo already exists (HTTP 422 already-exists), short-circuit with an `Assignment already accepted` message rather than touching the existing repo.
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

Uses git to add, commit, and push the contents of the current branch to remote, after fetching the parent repo's latest `.gitignore` and `.github`.

```
gh student submit
```

1. Use `git` or `curl` to get the latest contents of the teacher's `.gitignore` file and `.github` directory.
1. Use `git add -A && git commit --allow-empty --message && git push` or, to avoid merge conflicts like `submit50`, use, e.g., `git clone --bare hello /tmp && git symbolic-ref HEAD refs/heads/main && git add --all && git commit --allow-empty --message && git push origin refs/heads/main`.

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
