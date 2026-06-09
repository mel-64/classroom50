# Installation

`gh teacher` and `gh student` are `gh` CLI extensions written in Go. Until they're published to their own repos, install them from a local checkout of this repo.

## Prerequisites

- [Go](https://go.dev/doc/install) (any recent version)
- [GitHub CLI (`gh`)](https://cli.github.com/)

You do **not** need to run `gh auth login` first — the `gh teacher login` / `gh student login` commands below handle GitHub authentication with the right scopes.

## Install both extensions

```sh
git clone https://github.com/foundation50/classroom50
cd classroom50

# teacher extension
(cd cli/gh-teacher && go build . && gh extension install .)

# student extension
(cd cli/gh-student && go build . && gh extension install .)
```

`gh teacher` and `gh student` are now available in your shell. Verify with:

```sh
gh teacher --help
gh student --help
```

## Updating after a `git pull`

`gh extension install .` only needs to run once per extension. After pulling new commits, just rebuild:

```sh
(cd cli/gh-teacher && go build .)
(cd cli/gh-student && go build .)
```

## Logging in

Each CLI has a `login` command that runs `gh auth login` with the extra OAuth scopes the classroom workflows require.

```sh
gh teacher login   # requests admin:org (org invites) + workflow (init commits the config repo's workflows)
gh student login   # requests read:org and repo (needed to accept assignments)
```

If you skip this step and run another command first, the CLI detects the missing token and runs the login flow for you. The explicit step is just for predictability on a fresh setup.

`gh teacher logout` / `gh student logout` mirror `gh auth logout`.

## What's next

- Teachers: continue to the [Teacher Guide](Teacher-Guide).
- Students: continue to the [Student Guide](Student-Guide).
