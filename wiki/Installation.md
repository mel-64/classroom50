# Installation

`gh teacher` and `gh student` are `gh` CLI extensions written in Go. The
quickest way to install them is from their published releases; if you're
hacking on the extensions themselves, build from a local checkout instead.

## Prerequisites

- [GitHub CLI (`gh`)](https://cli.github.com/)
- [Go](https://go.dev/doc/install) (any recent version) — only needed for the build-from-source path below.

You do **not** need to run `gh auth login` first — the `gh teacher login` / `gh student login` commands below handle GitHub authentication with the right scopes.

## Install both extensions (recommended)

Installs precompiled binaries for your platform from each extension's releases:

```sh
gh extension install foundation50/gh-teacher
gh extension install foundation50/gh-student
```

`gh teacher` and `gh student` are now available in your shell. Verify with:

```sh
gh teacher --help
gh student --help
```

Update to the latest release at any time with:

```sh
gh extension upgrade gh-teacher
gh extension upgrade gh-student
```

Or update every installed extension in one go:

```sh
gh extension upgrade --all
```

`gh` also checks for new releases in the background and prints a hint when either extension is out of date, so you'll usually be told when an upgrade is available.

To pin a specific version, pass `--pin` (the version is the release tag, e.g. `v1.0.0`):

```sh
gh extension install foundation50/gh-teacher --pin v1.0.0
```

### Verifying a download (optional)

Each release ships a `checksums.txt` and build provenance attestations. To
confirm a binary was produced by the official release pipeline:

```sh
# Build provenance (gh 2.49+). The binaries are published on the extension
# repos, but the provenance attestations are recorded against the source
# monorepo, so point --repo at where the attestation lives:
gh attestation verify <path-to-binary> --repo foundation50/classroom50

# Or check the SHA-256 against the release's checksums.txt:
sha256sum <path-to-binary>
```

> If `gh attestation verify` reports "no attestations found", confirm your `gh`
> is 2.49+ and that you passed `--repo foundation50/classroom50` (the source
> repo that produced the build), not the extension repo the binary was
> downloaded from.

## Build from source (for development)

If you're working on the extensions, install them from a local checkout so your
changes take effect:

```sh
git clone https://github.com/foundation50/classroom50
cd classroom50

# teacher extension
(cd cli/gh-teacher && go build . && gh extension install .)

# student extension
(cd cli/gh-student && go build . && gh extension install .)
```

### Updating after a `git pull`

`gh extension install .` only needs to run once per extension. After pulling new commits, just rebuild:

```sh
(cd cli/gh-teacher && go build .)
(cd cli/gh-student && go build .)
```

## Logging in

Each CLI has a `login` command that runs `gh auth login` with the extra OAuth scopes the classroom workflows require.

```sh
gh teacher login   # requests admin:org (org invites) + workflow (init commits the config repo's workflows)
gh student login   # requests read:org, repo, and workflow (needed to accept assignments)
```

If you skip this step and run another command first, the CLI detects the missing token and runs the login flow for you. The explicit step is just for predictability on a fresh setup.

`gh teacher logout` / `gh student logout` mirror `gh auth logout`.

## What's next

- Teachers: continue to the [CLI Teacher Guide](CLI-Teacher-Guide).
- Students: continue to the [CLI Student Guide](CLI-Student-Guide).
