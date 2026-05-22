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
2. Looks up the assignment in the classroom's published manifest (`https://<org>.github.io/classroom50/<classroom>/assignments.json`) to find the template repo and which autograder workflow this assignment opts into. The template may live in another org — your instructor's `gh teacher assignment add --template <owner>/<repo>` chose it.
3. Fetches the referenced autograder workflow from Pages (`https://<org>.github.io/classroom50/<classroom>/autograders/<name>.yaml`). The fetch runs *before* the repo gets created — if the autograder isn't published yet, no half-baked repo is left behind.
4. Creates a **private** copy of the template at `<org>/<classroom>-<assignment>-<username>` (lowercased), with issues, projects, and wiki disabled.
5. Adds you as a `maintain` collaborator on the new repo.
6. Writes `.classroom50.yaml` and `.github/workflows/autograde.yaml` (the fetched workflow body) in a single commit. The metadata records the template, config-repo, and autograder coordinates so subsequent submissions know which autograder to refresh.
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

`gh student submit` snapshots your current branch, pushes it as a new commit on top of `main`, and pushes a lightweight `submit/<UTC-timestamp>` tag at the same SHA. The autograde workflow listens for that tag and publishes a GitHub Release with your score shortly after.

Run this after each meaningful change — every submit gets its own tag + release, so you can iterate freely and the teacher can grade any individual submission.

When submit finishes, three URLs are printed:

- **Submit tag** — links to the snapshot at the tag.
- **Autograde** — the repo's Actions tab. The autograde run for this submission shows up there within a few seconds.
- **Release** — the eventual scored release. 404s until the workflow finishes; once it does, the release body shows per-test results.

A few useful properties:

- **The autograde workflow refreshes on every submit.** `.github/workflows/autograde.yaml` is re-fetched from your instructor's Pages site on every submit — any teacher-side edit to the workflow (or to which autograder this assignment opts into in `assignments.json`) propagates the next time you submit, without you having to do anything.
- **History is preserved.** Submissions overlay as commits on top of the existing `main`; prior commits stay reachable for review.
- **No git config required.** The commit is authored with your GitHub login and noreply email, passed via `git -c user.name=... -c user.email=...`, so a fresh shell with no global git identity still submits cleanly. `GIT_AUTHOR_*` / `GIT_COMMITTER_*` environment variables override these defaults if you want a custom identity.
- **Build artifacts are excluded.** Only tracked files plus untracked-not-ignored files are submitted, so build outputs and unrelated local files don't end up in the snapshot.

The submit tag follows the shape `submit/2026-06-01T14-32-05Z` (UTC, hyphens between time components). Tags are immutable, so each submission's snapshot stays linkable forever.

## See also

- [`gh student` command reference](gh-student) — every command and flag.
- [Troubleshooting](Troubleshooting) — debug flags, common errors.
