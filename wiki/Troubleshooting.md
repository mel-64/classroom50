# Troubleshooting

## Make the CLI tell you what it's doing

Both CLIs accept `--verbose` / `-v` on any command. It surfaces per-step operational details — each REST call, the response status, raw `git` output during clone, metadata writes, collaborator updates — and is the first thing to try when something doesn't behave as expected.

```sh
gh student submit -v
gh teacher download -v <org> <classroom> <assignment>
```

For raw REST request/response logging (headers + bodies), set `GH_DEBUG=api` in the environment. This is honored by the underlying [`go-gh`](https://github.com/cli/go-gh) library and is the most detailed view of what's hitting the GitHub API.

```sh
GH_DEBUG=api gh teacher invite <org> <username>
```

Commands that emit informational summaries also accept `--quiet` / `-q` to suppress them (and to forward `--quiet` to `git` where applicable) — useful for scripting.

## "Missing scope" / 403 errors on `gh teacher invite`

Org-level invitations require the `admin:org` OAuth scope, which `gh auth login` doesn't grant by default. Run:

```sh
gh teacher login
```

This re-authenticates with `admin:org` appended. The CLI also detects this missing scope and runs the login flow for you automatically if you skip it.

## "Not an admin" on `gh teacher invite`

Your authenticated user has to be an org owner (or have a role that includes member-invitation permission) for `POST /orgs/{org}/invitations` to succeed. Verify your role under `https://github.com/orgs/<org>/people` — your name should show `Owner`. If you're an admin via a team, GitHub's invitation API still requires owner-level permission.

## "Already a member" / "Pending invite" on `gh teacher invite`

These aren't errors — they mean the desired state already exists. The CLI translates them into clear messages and exits 0 so you can re-run invite commands as part of a script without manual case-handling.

## "Assignment already accepted" on `gh student accept`

You've already accepted this assignment; the repo exists at `<org>/<classroom>-<assignment>-<username>`. The CLI short-circuits to avoid touching your existing repo (and your work in it). Clone it with the URL from `gh repo view <org>/<repo>` if you don't have it locally.

## "Template not found" / 404 on `gh student accept`

Three things to check, in order:

1. **The template repo must be public** under most plans, because GitHub's "No permission" org base setting blocks org members from reading private repos they aren't explicit collaborators on. (GitHub Enterprise Cloud has an "internal" visibility that all enterprise members can read; on that plan, internal templates work.)
2. **The repo must be flagged as a template** in `Settings → General → Template repository`.
3. **The `<assignment>` argument must match the slug your instructor registered** with `gh teacher assignment add` in `assignments.json` — case is normalized, but spelling has to be exact. It does not have to match the template repo's name.

## "Could not find `.classroom50.yaml`" on `gh student submit`

`gh student submit` reads template metadata from `.classroom50.yaml` at the repo root. If it's missing, you're likely running submit from outside the cloned assignment repo, or from a clone that wasn't created by `gh student accept` (which is what writes that file). `cd` into the directory the `git clone` command created and try again.

## "autograder `<name>` not published yet" on `gh student accept`

The assignment's `assignments.json` references an autograder workflow whose YAML isn't on the Pages site. Two common causes:

1. **The file doesn't exist.** This error only fires for non-default `--autograder <name>` values. The `default` autograder is embedded in `gh-student` itself and never needs a config-repo file. For other names (e.g. `--autograder c-makefile`), the corresponding `<classroom>/autograders/<name>.yaml` must be hand-created in the config repo before the assignment is registered. Ask your instructor to confirm the file is there.
2. **`publish-pages.yaml` hasn't run yet.** Even when the file exists in the config repo, the Pages site needs the publish workflow to deploy. A fresh classroom dir requires one Pages deployment to surface the autograders; ask your instructor to wait a minute and try again.

## "autograder `<name>` is malformed YAML" on `gh student accept`

The instructor's autograder workflow has a YAML syntax error. `gh student` validates the fetched YAML before writing it into your repo, so a broken file never lands. Ask the instructor to check `<classroom>/autograders/<name>.yaml` in the config repo and re-run after they fix it.

## Submit pushed a commit but the teacher doesn't see new work

`gh student submit` pushes to the assignment repo's `main` branch (hardcoded for now). If your template uses `master` or `develop`, the first submit creates a new `main` branch alongside it. Make sure the assignment repo's default branch on GitHub is the one you (and the teacher's download flow) expect.

## `gh teacher download` clones nothing

By default, `gh teacher download` is **roster-driven**: it reads `<classroom>/students.csv` and `<classroom>/assignments.json` from your config repo, then probes `GET /repos/<org>/<classroom>-<assignment>-<username>` for each roster row. If you get zero clones:

- Confirm `<org>/classroom50` exists and `<classroom>/students.csv` is populated (`gh teacher roster add` or `gh teacher roster import`).
- Confirm `<assignment>` is registered in `<classroom>/assignments.json` (`gh teacher assignment list <org> <classroom>`).
- Verify a few student repos exist under `https://github.com/orgs/<org>/repositories?q=<classroom>-<assignment>`.
- Re-run with `-v` to see which roster rows were probed and which repos were missing.

If the config repo isn't bootstrapped yet, or you want every matching repo regardless of the roster, pass `--by-pattern` — that mode pages through `GET /orgs/{org}/repos` and clones every repo whose name starts with `<classroom>-<assignment>-`.

## Build fails after a `git pull`

`gh extension install .` only registers the binary the **first** time. After pulling new commits in this repo, re-run `go build .` inside the extension folder:

```sh
(cd cli/gh-teacher && go build .)
(cd cli/gh-student && go build .)
```

If `go build` itself fails, run `go mod tidy` first to catch any new dependencies.

## Filing an issue

If none of the above explain what you're seeing, open an issue at <https://github.com/foundation50/classroom50/issues>. Useful to include:

- The exact command you ran (with arguments).
- The full output, ideally with `-v` and/or `GH_DEBUG=api` set.
- Your `gh --version` and Go version (`go version`).
- OS and shell.
