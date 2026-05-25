# Student Guide

End-to-end walkthrough for students. Install the CLI first — see [Installation](Installation).

## Before you start

Your instructor must have already:

1. Set up a GitHub organization for the class.
2. Created an assignment template repo in that org.
3. Invited you to the org (you'll get an email invitation).

You don't need to accept the org invitation in the GitHub UI — `gh student accept` does it for you on first use.

## 1. Log in

```sh
gh student login
```

![Demo: gh student login](images/gh_student_auth.gif)

This runs `gh auth login` with the `read:org` and `repo` scopes that the classroom commands need. If you skip this step, the next command you run will trigger the login flow automatically.

`gh student logout` mirrors `gh auth logout`.

## 2. Accept an assignment

```sh
gh student accept <org> <classroom> <assignment>
```

![Demo: gh student accept](images/gh_student_accept.gif)

- `<org>` — the GitHub org your class uses.
- `<classroom>` — the classroom your instructor set up (e.g. `cs-principles`). Has to match a real classroom directory in your org's `classroom50` config repo.
- `<assignment>` — the slug your instructor registered with `gh teacher assignment add` (e.g. `hello`).

What this command does:

1. Auto-accepts any pending org invitation for your account.
2. Looks up the assignment in the classroom's published manifest (`https://<org>.github.io/classroom50/<classroom>/assignments.json`) to find the template repo. The template may live in another org — your instructor's `gh teacher assignment add --template <owner>/<repo>` chose it.
3. Resolves the autograder workflow shim. For the default autograder (the common case), the universal shim embedded in `gh-student` is used directly. For a non-default `--autograder <name>` your instructor registered, the shim is fetched from Pages (`https://<org>.github.io/classroom50/<classroom>/autograders/<name>.yaml`) — if that fetch fails, no half-baked repo is left behind.
4. Creates a **private** copy of the template at `<org>/<classroom>-<assignment>-<username>` (lowercased), with issues, projects, and wiki disabled.
5. Adds you as a `maintain` collaborator on the new repo.
6. Writes `.classroom50.yaml` and `.github/workflows/autograde.yaml` (the resolved shim) in a single commit. The metadata records the classroom, assignment, and template-repo identity; the runner derives everything else at workflow time.
7. Prints the `git clone` command for your new repo.

If you've already accepted this assignment, the command short-circuits with `Assignment already accepted: <org>/<repo>` and leaves your existing repo (and any work in it) alone — re-running is safe.

**Errors you might see:**

- _"the classroom may not exist yet, or `publish-pages.yaml` may not have run"_ — your instructor hasn't completed the classroom setup yet, or the Pages site hasn't deployed. Wait a few minutes and try again, or ask your instructor to confirm.
- _"assignment X is not registered in ..."_ — typo, or your instructor hasn't run `gh teacher assignment add` yet for this assignment.
- _"autograder `<name>` not published yet"_ — the assignment references an autograder workflow whose YAML isn't on the Pages site. Ask your instructor to confirm `<classroom>/autograders/<name>.yaml` exists in the config repo and that `publish-pages.yaml` has run.
- _"autograder `<name>` is malformed YAML"_ — the teacher's autograder workflow has a YAML syntax error. Ask them to fix the file in the config repo before retrying.
- _"template `<owner>/<repo>` is not accessible to you"_ — the template repo is private and not shared with you; ask your instructor to make it public or grant your account access.
- _"group assignments are not yet supported"_ — your instructor registered the assignment with `--mode group`. Group mode is not yet available.

## 3. Clone and work

Run the `git clone` command that `gh student accept` printed. Edit the code in your usual editor, commit and push to your repo's `main` branch as you normally would.

If you'd like to collaborate with a classmate or invite a TA to your repo:

```sh
gh student invite <org>/<repo> <username>
```

That adds them with `push` permission.

## 4. Submit

From inside the cloned repo:

```sh
gh student submit
```

![Demo: gh student submit](images/gh_student_submit.gif)

`gh student submit` snapshots your current branch and pushes it as a new commit on top of `main`. The autograde workflow runs automatically on the push: it tags the commit with `submit/<UTC-timestamp>-<short-sha>`, runs the autograder, and publishes a GitHub Release with your score a minute or two later.

You can also `git push` directly — the result is identical. `gh student submit` exists mainly to refresh the instructor's `.gitignore` and `.github/` from the assignment template before pushing, so any teacher-side updates flow through.

When submit finishes, two URLs are printed:

- **Autograde** — the repo's Actions tab. The autograde run for this submission shows up there within a few seconds and creates the submit tag.
- **Releases** — the releases page. The scored release lands once the workflow finishes; per-test results appear in the release body.

A few useful properties:

- **Every push grades.** Whether through `gh student submit` or `git push`, every commit on `main` triggers a graded run with its own tag and release. The latest release on the page is always the most recent submission.
- **History is preserved.** Submissions overlay as commits on top of the existing `main`; prior commits stay reachable for review.
- **No git config required.** The commit is authored with your GitHub login and noreply email, passed via `git -c user.name=... -c user.email=...`, so a fresh shell with no global git identity still submits cleanly. `GIT_AUTHOR_*` / `GIT_COMMITTER_*` environment variables override these defaults if you want a custom identity.
- **Build artifacts are excluded.** Only tracked files plus untracked-not-ignored files are submitted, so build outputs and unrelated local files don't end up in the snapshot.

Submit tags follow the shape `submit/2026-06-01T14-32-05Z-a1b2c3d` (UTC timestamp, hyphens between time components, then a short SHA suffix). Tags are immutable, so each submission's snapshot stays linkable forever.

## See also

- [`gh student` command reference](gh-student) — every command and flag.
- [Troubleshooting](Troubleshooting) — debug flags, common errors.
