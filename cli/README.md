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

1. If the student hasn't already accepted an invitation to the org itself, automatically accept that invitation first.
    * There doesn't seem to be a way to do this, so the student might first have to visit `https://github.com/{org}`?
1. Create a private repo called `{username}-{assignment}`, **canonicalized as lowercase**, in `{org}` using the assignment's repo template, per <https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-using-a-template>. Disable issues, projects, and wiki by default.
1. Invite `{username}` to the repo with `maintain` permission, per <https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator>.
1. Downgrade `{username}`'s permission from `admin` (default) to `maintain`, just for good measure, per <https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2026-03-10#add-a-repository-collaborator>.
    * There doesn't seem to be a way to modify an existing permission, but perhaps re-adding the same user with a lower permission will achieve such?
1. Create a `.classroom50.yml` file in the student's repo on the `main` branch containing requisite metadata as key-value pairs, per <https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10#create-or-update-file-contents>:
    * classroom ID
    * assignment ID
    * Owner/Repo/Branch from which the repo was created.
1. Use `git` to clone the newly created repo.
    * Or just show the student the `git clone` command that they can now run.
    * And/or check if the student is already inside a git repo, in which case they should be encouraged/required to clone the repo higher up in the file system, to avoid a repo in a repo.

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
gh teacher download {org} {assignment}              # clones into {org}_submissions/
gh teacher download -d {dir} {org} {assignment}     # clones into {dir}/
```

1. Page through `GET /orgs/{org}/repos`, per <https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#list-organization-repositories>, collecting every repo whose name ends in `-{assignment}` (the `gh student accept` convention of `{username}-{assignment}`).
1. For each match, shell out to `gh repo clone {org}/{name} {dir}/{name}` so authentication flows through the current `gh` session — no separate git credential setup needed for private classroom repos. Default `{dir}` is `{org}_submissions` so the cwd stays clean and one teacher can pull multiple orgs' submissions side-by-side; pass `-d` to override. Pass `--quiet` to git when the user passes `-q`.
1. Skip targets that already exist on disk so re-runs pick up new submissions without aborting on the ones already cloned. Failures are reported per-repo on stderr; a non-zero exit code surfaces if any clone failed, after the rest still run.
