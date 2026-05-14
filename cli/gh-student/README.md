# gh-student

A `gh` CLI extension targeted at students. Written in Go using [`go-gh`](https://github.com/cli/go-gh) and [`cobra`](https://github.com/spf13/cobra).

## Local development

First-time setup:

```
cd cli/gh-student
go mod tidy
```

Build and register as a `gh` extension from your local checkout:

```
go build .
gh extension install .
```

After that, `gh student` is registered (see [Commands](#commands)). Re-run `go build .` after code changes; `gh extension install .` only needs to run once.

To debug REST calls, set `GH_DEBUG=api` (honored by `go-gh`) to log every request and response.

## Local checks

Install Go and `golangci-lint` once:

```
brew install go golangci-lint
```

Run all CI checks locally before pushing:

```
golangci-lint fmt && go mod tidy && golangci-lint run && go build ./... && go test ./...
```

If that exits 0, CI will pass. `golangci-lint fmt` applies both `gofmt` and `goimports` (configured in [`.golangci.yml`](.golangci.yml)) so import grouping stays consistent across files. The same checks run in [`gh-student-ci.yml`](../../.github/workflows/gh-student-ci.yml).

VSCode users: install the [Go extension](https://marketplace.visualstudio.com/items?itemName=golang.Go) and add this to `.vscode/settings.json` for format-and-lint on save:

```json
{
  "go.lintTool": "golangci-lint",
  "go.lintOnSave": "package",
  "go.formatTool": "gofmt"
}
```

## Commands

| Command                                            | Description                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `gh student whoami`                                | Print the authenticated GitHub user.                              |
| `gh student login`                                 | Log in to GitHub via `gh auth login`, requesting the `read:org` and `repo` scopes (required for accepting assignments) on top of the gh defaults. Pass `-s` to add other scopes. Other commands trigger this same login flow automatically when no token is configured for `github.com`. |
| `gh student logout`                                | Log out of GitHub via `gh auth logout`. |
| `gh student accept <org>/<classroom>/<assignment>` | Accept an assignment: auto-accept any pending org invite, create a private repo from the template, add the student as `maintain`, write `.classroom50.yml`, and print clone instructions. Default output is the `Assignment accepted: <org>/<repo>` header plus a `git clone` command. Re-running on an already-accepted assignment short-circuits with an `Assignment already accepted: <org>/<repo>` message and leaves the existing repo (and the student's work in it) untouched. |
| `gh student invite <org>/<repo> <user>`            | Invite a classmate or TA to the repo with `push` permission.      |
| `gh student submit`                                | Snapshot the current branch and push it as a new commit on top of the assignment repo's `main` branch (hardcoded for now), after fetching the instructor's `.gitignore` and `.github/` (if present) from the template. Reads `.classroom50.yml` for the source repo and branch. The commit is authored with the user's GitHub login and noreply email (`<id>+<login>@users.noreply.github.com`), passed via `git -c user.name=… -c user.email=…` so a fresh shell with no `git config` user identity still submits cleanly. `GIT_AUTHOR_*` / `GIT_COMMITTER_*` environment variables override these defaults. |

Run `gh student <command> --help` for available flags. Errors always go to stderr with a non-zero exit code. Pass `--verbose` / `-v` to see per-step operational details (repo creation, collaborator updates, metadata writes, `git` activity).

## Layout

`main.go` defines the cobra root command and registers subcommands. Each subcommand lives in its own file (`whoami.go`, `accept.go`, …) exposing a `<name>Cmd()` factory function. To add a new command, copy an existing file and follow the same pattern: factory returns `*cobra.Command`, write to `cmd.OutOrStdout()`, wrap errors with `fmt.Errorf("ctx: %w", err)`.

## Distribution

Currently install-from-source only. Cross-platform binary releases via [`cli/gh-extension-precompile`](https://github.com/cli/gh-extension-precompile) are deferred until this extension lives in its own repository (`gh extension install <owner>/<repo>` resolves the binary by repo name, which only matches once `gh-student` is the repo).
