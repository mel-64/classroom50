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
| `gh student auth`                                  | Refresh the gh token with the `read:org` and `repo` scopes (required for accepting assignments). Pass `-s` to add other scopes. |
| `gh student accept <org>/<classroom>/<assignment>` | Accept an assignment: auto-accept any pending org invite, create a private repo from the template, add the student as `maintain`, write `.classroom50.yml`, and print clone instructions. Default output is the `Assignment accepted: <org>/<repo>` header plus a `git clone` command. Re-running on an already-accepted assignment short-circuits with an `Assignment already accepted: <org>/<repo>` message and leaves the existing repo (and the student's work in it) untouched. |
| `gh student invite <org>/<repo> <user>`            | Invite a classmate or TA to the repo with `push` permission.      |
| `gh student submit`                                | Snapshot the current branch and force-push it to the assignment repo's `main` branch (hardcoded for now), after fetching the instructor's `.gitignore` and `.github/` from the template. Both files are required template artifacts; a 404 fetching either fails the submit so a misconfigured template is surfaced loudly. Reads `.classroom50.yml` for the source repo and branch. |

Run `gh student <command> --help` for available flags. Errors always go to stderr with a non-zero exit code. Pass `--verbose` / `-v` to see per-step operational details (repo creation, collaborator updates, metadata writes, `git` activity).

## Layout

`main.go` defines the cobra root command and registers subcommands. Each subcommand lives in its own file (`whoami.go`, `accept.go`, …) exposing a `<name>Cmd()` factory function. To add a new command, copy an existing file and follow the same pattern: factory returns `*cobra.Command`, write to `cmd.OutOrStdout()`, wrap errors with `fmt.Errorf("ctx: %w", err)`.

## Distribution

Currently install-from-source only. Cross-platform binary releases via [`cli/gh-extension-precompile`](https://github.com/cli/gh-extension-precompile) are deferred until this extension lives in its own repository (`gh extension install <owner>/<repo>` resolves the binary by repo name, which only matches once `gh-student` is the repo).
