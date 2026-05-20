# Reusable Workflows

Reusable GitHub Actions workflows that other repos (student copies, templates, or any classroom-adjacent project) can consume via `uses:` live under [`.github/workflows/`](https://github.com/foundation50/classroom50/tree/main/.github/workflows). GitHub requires that location for `uses:` references to resolve.

## Consuming a workflow

```yaml
jobs:
  example:
    uses: foundation50/classroom50/.github/workflows/<workflow>.yml@main
```

See GitHub's [Reusing workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows) docs for the full mechanics: how `inputs:` and `secrets:` map across boundaries, how versions are pinned, and what reusable vs. composite workflows can and can't do.

## What lives here

| Workflow | Purpose |
| --- | --- |
| [`.github/workflows/autograde-library.yml`](https://github.com/foundation50/classroom50/blob/main/.github/workflows/autograde-library.yml) | The classroom50 autograde library. Consumed by per-classroom autograder workflows (e.g. `<classroom>/autograders/default.yml` in each teaching org's `classroom50` config repo) via `uses:`. Runs the `load → run matrix → report` pipeline: parses `.classroom50.yml` from the student repo, fetches `assignments.json` from Pages, dispatches each test through GitHub's `classroom-resources/autograding-*-grader@v1` actions, aggregates results, posts a `classroom50/autograde` commit status, and publishes a submit-tag GitHub Release carrying `result.json`. |

### Autograder contract

Any workflow consuming `autograde-library.yml` MUST:

1. Trigger on `push.tags: ["submit/*"]` from a student repo created by `gh student accept`. The student repo's root must contain `.classroom50.yml` with `classroom`, `assignment`, and `config.{owner,repo,path}` populated.
2. Declare `permissions: contents: write` (so the library can publish the release) and `statuses: write` (so it can post the commit status), or `permissions: inherit`.

The default classroom autograder (`<classroom>/autograders/default.yml`, scaffolded by `gh teacher classroom add`) is a thin wrapper:

```yaml
# classroom50-autograde-version: 0.2.0
name: Autograde

on:
  push:
    tags: ["submit/*"]

permissions:
  contents: write
  statuses: write

jobs:
  grade:
    uses: foundation50/classroom50/.github/workflows/autograde-library.yml@main
```

Teachers can hand-edit the wrapper, replace the `uses:` block with their own pipeline, or drop sibling `<name>.yml` files for per-assignment graders (reference them by name from `assignments.json`'s `autograder` field).
