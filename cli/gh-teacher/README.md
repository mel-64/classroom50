# gh-teacher

A `gh` CLI extension targeted at instructors. Written in Go using [`go-gh`](https://github.com/cli/go-gh) and [`cobra`](https://github.com/spf13/cobra).

## Local development

First-time setup:

```
cd cli/gh-teacher
go mod tidy
```

Build and register as a `gh` extension from your local checkout:

```
go build .
gh extension install .
```

After that, `gh teacher` is registered (see [Commands](#commands)). Re-run `go build .` after code changes; `gh extension install .` only needs to run once.

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

If that exits 0, CI will pass. `golangci-lint fmt` applies both `gofmt` and `goimports` (configured in [`.golangci.yml`](.golangci.yml)) so import grouping stays consistent across files. The same checks run in [`gh-teacher-ci.yml`](../../.github/workflows/gh-teacher-ci.yml).

VSCode users: install the [Go extension](https://marketplace.visualstudio.com/items?itemName=golang.Go) and add this to `.vscode/settings.json` for format-and-lint on save:

```json
{
  "go.lintTool": "golangci-lint",
  "go.lintOnSave": "package",
  "go.formatTool": "gofmt"
}
```

## Commands

| Command                                  | Description                                                       |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `gh teacher whoami`                      | Print the authenticated GitHub user.                              |
| `gh teacher auth`                        | Refresh the gh token with the `admin:org` scope (required for org invites). Pass `-s` to add other scopes. |
| `gh teacher invite <org> <user>`         | Invite user to an org (use `--admin` for the org admin role). Common API failures (missing scope, not an admin, org not found, already a member, pending invite) surface as actionable messages instead of raw HTTP errors. |
| `gh teacher invite <org>/<repo> <user>`  | Invite user to a specific repository. Default permission is `push`; override with `-p {pull,triage,push,maintain,admin}`. Re-running with a different `-p` updates the existing collaborator. |
| `gh teacher remove <org> <user>`         | Remove user from an org. Revokes access to every repo in the org, removes them from all teams, and cancels any pending invitation. Idempotent: a 404 (already gone) is treated as success. |
| `gh teacher remove <org>/<repo> <user>`  | Remove user from a specific repository. Idempotent (404 treated as success). |
| `gh teacher download <org> <assignment>` | Clone every repo in `<org>` whose name ends in `-<assignment>` (the `gh student accept` convention). Default destination is `<org>_submissions_<YYYY_MM_DD_T_HH_MM_SS>/` (24-hour local time) so each run produces a fresh folder; override with `-d/--dir` (taken literally, no timestamp). Per-repo output is concise (`Cloning <name>... Done`); existing target dirs are skipped so re-runs with `-d` pick up new submissions. |

Run `gh teacher <command> --help` for available flags. Commands that emit informational output accept `--quiet` / `-q` to suppress it; pass `--verbose` / `-v` to see per-step operational details (e.g. raw `git` output during `download`). Errors always go to stderr with a non-zero exit code.

## Layout

`main.go` defines the cobra root command and registers subcommands. Each subcommand lives in its own file (`whoami.go`, `invite.go`, …) exposing a `<name>Cmd()` factory function. To add a new command, copy an existing file and follow the same pattern: factory returns `*cobra.Command`, write to `cmd.OutOrStdout()`, wrap errors with `fmt.Errorf("ctx: %w", err)`.

## Distribution

Currently install-from-source only. Cross-platform binary releases via [`cli/gh-extension-precompile`](https://github.com/cli/gh-extension-precompile) are deferred until this extension lives in its own repository (`gh extension install <owner>/<repo>` resolves the binary by repo name, which only matches once `gh-teacher` is the repo).
