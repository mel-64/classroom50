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

## Local checks

Install Go and `golangci-lint` once:

```
brew install go golangci-lint
```

Run all CI checks locally before pushing:

```
gofmt -w . && go mod tidy && golangci-lint run && go build ./...
```

If that exits 0, CI will pass. The same checks run in [`gh-teacher-ci.yml`](../../.github/workflows/gh-teacher-ci.yml).

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
| `gh teacher invite <org> <user>`         | Invite user to an org (use `--admin` for the org admin role).     |
| `gh teacher invite <org>/<repo> <user>`  | Invite user to a specific repository as a push-permission collaborator. |

Run `gh teacher <command> --help` for available flags. Commands that emit informational output accept `--quiet` / `-q` to suppress it; errors always go to stderr with a non-zero exit code.

## Layout

`main.go` defines the cobra root command and registers subcommands. Each subcommand lives in its own file (`whoami.go`, `invite.go`, …) exposing a `<name>Cmd()` factory function. To add a new command, copy an existing file and follow the same pattern: factory returns `*cobra.Command`, write to `cmd.OutOrStdout()`, wrap errors with `fmt.Errorf("ctx: %w", err)`.

## Distribution

Currently install-from-source only. Cross-platform binary releases via [`cli/gh-extension-precompile`](https://github.com/cli/gh-extension-precompile) are deferred until this extension lives in its own repository (`gh extension install <owner>/<repo>` resolves the binary by repo name, which only matches once `gh-teacher` is the repo).
