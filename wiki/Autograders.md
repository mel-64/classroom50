# Autograders

How Classroom 50 grades student submissions, and how teachers write tests.

## Architecture in one paragraph

When a student pushes a `submit/*` tag (typically via `gh student submit`), GitHub Actions runs the **shim workflow** at `.github/workflows/autograde.yaml` in their assignment repo. The shim is ~20 lines and does exactly one thing: it `uses:` the **autograde-runner** reusable workflow in your config repo (`<org>/classroom50/.github/workflows/autograde-runner.yaml@main`). The runner contains all the substantive logic — it fetches the **orchestrator** (`autograde.py`) and the **per-assignment tests** (a `<slug>.tar.gz` bundle) from your config repo via GitHub Pages, runs pytest, emits a `result.json` matching the `classroom50/result/v1` schema, posts a commit status, and publishes a GitHub Release at the submit tag with `result.json` attached. The **`collect-scores.yaml`** workflow on the config repo downloads each release's `result.json` and aggregates them into `<classroom>/scores.json`.

The student repo carries only the shim + `.classroom50.yaml` metadata. The runner, the orchestrator, the tests, and any per-classroom configuration all live in the config repo and are evaluated live on every workflow run — `@main` in the shim's `uses:` resolves at workflow-call time — so teacher edits propagate to every existing student repo on the next submission with zero per-student-repo maintenance.

## Writing tests

Per-assignment tests live in the config repo at:

```
<classroom>/autograders/tests/<slug>/
```

Any pytest-discoverable files work — name them `test_*.py`, drop a `conftest.py` for fixtures, organize into subdirectories if you want. Pytest's default discovery applies.

### Minimal example

For an assignment slug `hello` with a template repo that ships `hello.py` containing a `greet(name)` function:

```python
# cs-principles/autograders/tests/hello/test_hello.py

import pytest


@pytest.mark.score(4)
def test_says_hello():
    from hello import greet
    assert greet("alice") == "Hello, alice!"


@pytest.mark.score(1)
def test_handles_empty():
    from hello import greet
    assert greet("") == "Hello, stranger!"
```

Push that file and commit, wait for `publish-pages.yaml` to deploy (~30 seconds), and the next submission grades against it. The student sees a `4/5` (or `5/5` if they handled the edge case) in their commit status and on the release page.

### `@pytest.mark.score(N)` for weighting

Tests without the marker count as **1 point**. Tests with `@pytest.mark.score(N)` count as **N points** (any non-negative integer). The total assignment score is the sum of passed-test weights; `max-score` is the sum of all weights. The student sees both in `result.json`'s `score` / `max-score` fields.

If the marker is misspelled (`@pytest.mark.scor(5)`) pytest emits an unknown-marker warning and the test silently falls back to 1 point — there's no hard failure, just unexpected weighting. If `@pytest.mark.score("5")` is used with a non-int argument, same thing.

### Adding dependencies your tests need

The orchestrator installs `pytest` and `pytest-json-report` automatically. If your tests need more (e.g., `numpy`, `requests`, a course-specific package), open `<classroom>/autograders/autograde.py` in the config repo and edit the `pip_install(...)` line near the top of `main()`:

```python
pip_install("pytest", "pytest-json-report", "numpy", "requests")
```

Push the edit and every subsequent submission picks it up — no student-side updates needed.

### Different runtimes (Node, Java, Rust, etc.)

If your tests need a non-Python runtime, edit the **reusable runner** at `.github/workflows/autograde-runner.yaml` in your config repo. The "Runtime setup" section has dedicated comments calling out the customization point:

```yaml
      # === Runtime setup (edit to add languages, system packages, etc.) ===
      - uses: actions/setup-python@v6
        with:
          python-version: "3.12"
      - name: Ensure PyYAML
        run: python3 -m pip install --quiet --user pyyaml
      # Add `setup-node@v4`, `apt-get install`, etc. here.
```

Edits propagate to every student's next submission since the shim's `uses:` resolves the runner at `@main` on every workflow call — no student-repo updates needed. The runner is a single file owned by the teacher; the student-repo shim never changes for runtime tweaks.

**Note on scope:** editing this file changes the runtime for **every assignment in every classroom in your config repo**, since the default shim in every classroom calls this same runner. If you need a different runtime for just *one* assignment (e.g., a C-makefile assignment in an otherwise-Python classroom), see "Worked example: per-assignment runtime environment" below — you'll create a sibling runner file and a sibling shim that points at it.

## The `result.json` contract

This is the **only** contract custom autograders must satisfy. A teacher writing a JUnit autograder, a Rust autograder, or anything else need only emit a `classroom50/result/v1` payload at `result.json` in the workflow workspace.

```json
{
  "schema":     "classroom50/result/v1",
  "classroom":  "cs-principles",
  "assignment": "hello",
  "usernames":  ["alice"],
  "submission": "submit/2026-06-01T14-32-05Z",
  "commit":     "https://github.com/.../commit/<sha>",
  "release":    "https://github.com/.../releases/tag/submit%2F2026-06-01T14-32-05Z",
  "review":     "https://github.com/.../commit/<sha>",
  "datetime":   "2026-06-01T14:33:11Z",
  "score":      4,
  "max-score":  5,
  "tests": [
    { "test-name": "test_hello.py::test_says_hello",   "passed": true,  "score": 4, "max-score": 4 },
    { "test-name": "test_hello.py::test_handles_empty","passed": false, "score": 0, "max-score": 1 }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `schema` | string | Must be `classroom50/result/v1` exactly |
| `classroom` | string | Must match `<classroom>` in the repo name |
| `assignment` | string | Must match `<assignment>` in the repo name |
| `usernames` | `[string]` | Exactly one element (individual assignments) |
| `submission` | string | The submit-tag name (e.g. `submit/2026-06-01T14-32-05Z`) |
| `commit` | string | URL to the submission commit |
| `release` | string | URL to the release (URL-encoded submit tag) |
| `review` | string | URL teachers click to review (commit view) |
| `datetime` | string | UTC ISO 8601 (`YYYY-MM-DDTHH:MM:SSZ`) |
| `score` | int | Sum of test scores (0 ≤ score ≤ max-score) |
| `max-score` | int | Sum of test max-scores |
| `tests` | `[object]` | Per-test breakdown (optional content — `[]` is valid) |

`collect-scores.yaml` validates this payload (via `collect_scores.py::validate_result`) before merging into `scores.json`. Mismatches against the source repo's identity (classroom/assignment/username triple) are rejected with a warning.

## Customization patterns

### The four customization layers

| What you want to change | Where to edit it | Propagation |
|---|---|---|
| **Grading logic for one assignment** | `<classroom>/autograders/tests/<slug>/test_*.py` in the config repo (just write pytest tests) | Next student submission |
| **Grading logic shared across assignments** | `<classroom>/autograders/autograde.py` (e.g. add `apt-get install` of a system package, branch on `CLASSROOM50_ASSIGNMENT`) | Next student submission |
| **Runtime environment for the whole classroom** (Python version, additional language runtimes, `pip install` lines, etc.) | `.github/workflows/autograde-runner.yaml` at the config repo root (the reusable runner) | Next student submission (runner is resolved at `@main` on every workflow call) |
| **Runtime environment for one assignment only** (e.g. C-makefile assignments need gcc, Python assignments don't) | A *new* runner file at `.github/workflows/autograde-runner-<name>.yaml` plus a sibling shim at `<classroom>/autograders/<name>.yaml` that `uses:` it; pick it with `gh teacher assignment add --autograder <name>` | Next student `gh student submit` (re-fetches the shim from Pages) + next workflow run (runner resolved at `@main`) |

All four layers live in the config repo. None of them require any change in any student repo.

### Worked example: per-assignment runtime environment

If you need a *different runtime* for a specific assignment (e.g., one assignment needs `gcc` + `make` and the others don't, or one needs Python 3.11 instead of 3.12), you need **two new files** plus an `--autograder` flag. Editing the shim alone won't help — the shim is just a `uses:` indirection. Editing the default runner would affect every assignment in the classroom. The flow:

**Step 1** — copy the runner and customize it. Runtime setup lives in the runner, not the shim.

```bash
cd <your config repo clone>
cp .github/workflows/autograde-runner.yaml .github/workflows/autograde-runner-c.yaml
# Edit the new file's "Runtime setup" block to add the C toolchain
# (apt-get install -y build-essential, etc.). The bootstrap / autograde /
# post-status / publish-release steps below stay identical.
```

**Step 2** — copy the shim and point it at the new runner.

```bash
cp cs-principles/autograders/default.yaml cs-principles/autograders/c-makefile.yaml
# Edit the new shim's `uses:` line:
#   uses: "<org>/classroom50/.github/workflows/autograde-runner-c.yaml@main"
```

**Step 3** — push both files; wait for `publish-pages.yaml` to deploy the new shim (~30-60 seconds).

```bash
git add .github/workflows/autograde-runner-c.yaml \
        cs-principles/autograders/c-makefile.yaml
git commit -m "Add C-toolchain runner + shim"
git push
```

**Step 4** — register the assignment against the new shim:

```bash
gh teacher assignment add cs50-fall-2026 cs-principles greet \
    --autograder c-makefile \
    --name "Greet" --template cs50/greet-template
```

`gh teacher assignment add --autograder c-makefile` validates that `cs-principles/autograders/c-makefile.yaml` exists at write time — a typo will be rejected before the assignment lands.

Why four steps? Because `--autograder` picks the **shim YAML**, not the runner. The shim YAML decides which runner to call (via its `uses:`). The runner is where runtime setup actually happens. Editing only the shim, or only the runner, won't give you per-assignment runtime customization on its own.

### Monolithic autograder (one .py for all assignments)

If your grading logic is similar across all assignments and you'd rather centralize it, the default `autograde.py` reads the assignment slug from `CLASSROOM50_ASSIGNMENT` and uses it to fetch the right tests bundle. You can extend it to branch on the slug for per-assignment setup logic:

```python
# Inside autograde.py, before pip_install():
assignment = os.environ["CLASSROOM50_ASSIGNMENT"]
if assignment.startswith("ml-"):
    pip_install("pytest", "pytest-json-report", "numpy", "scikit-learn")
else:
    pip_install("pytest", "pytest-json-report")
```

### Completely custom orchestrator

Replace `autograde.py` with anything that:
1. Reads `CLASSROOM50_BASE_URL`, `CLASSROOM50_CLASSROOM`, `CLASSROOM50_ASSIGNMENT` env vars.
2. Writes a valid `classroom50/result/v1` payload to `./result.json`.
3. Writes a Markdown release body to `./release-body.md`.
4. Appends `status=<state>` and `summary=<line>` to `$GITHUB_OUTPUT` (where `<state>` ∈ `success`, `failure`, `error`).

The runner's downstream steps (post commit status, publish release) consume those outputs. The runner invokes `python3 autograde.py` directly; if you want a non-Python orchestrator, edit the runner's "Run autograder" step in `.github/workflows/autograde-runner.yaml` to invoke whatever interpreter you want.

## Failure paths

The runner writes a result via `autograde.py` on every successful bootstrap. Failure paths:

| What failed | What surfaces |
|---|---|
| Shim's `uses:` fails to resolve (reusable-workflow access disabled, or the runner file 404s) | GitHub marks the run failed at workflow-load time with "This run likely failed because of a workflow file issue"; no jobs execute. Fix at the config-repo side; the student's repo is fine. |
| `.classroom50.yaml` is missing or corrupt | Runner bootstrap exits with `::error::`; commit status = `error`; **no release published** (debug from Actions UI) |
| `assignments.json` returns 404 | Same — `::error::` from runner bootstrap with the missing URL |
| `autograde.py` returns 404 | Same — `::error::` naming the missing URL |
| `pip install` fails inside `autograde.py` (orchestrator exits 1) | No `result.json` emitted; commit status = `error` (fallback); **no release published**. Debug from Actions UI. |
| Test tarball returns 404 (no tests configured for this assignment) | Orchestrator emits `result.json` with `tests: []`, `score: 0`, `max-score: 0`, status `success`. **Release publishes.** Collect-scores ingests as "submitted, 0/0". |
| Test tarball download fails (network, corruption) | Orchestrator emits `result.json` with `tests: []`, status `error`. **No release published** (commit status carries the failure). |
| Pytest crashes before producing a report | Same as above. |
| Pytest collection fails (syntax error in tests) | Same as above. |
| Tests run, some fail | Normal case. Release publishes with per-test breakdown; status = `failure` if any failed. |

Broken-bootstrap cases (the early rows above) do **not** show up in `scores.json`. Collect-scores' per-assignment "X of Y submitted" summary reports the student as not-yet-submitted, and the teacher debugs from the student's Actions tab. The runner failures show up *in the student's Actions tab* as a nested job — GitHub's reusable-workflow runs are visible to the calling repo's Actions UI.

## No credentials required

Students never configure any tokens, secrets, or env vars. The full grading flow runs entirely on:

1. **The workflow's auto-provisioned `GITHUB_TOKEN`** — scoped to `contents: write` (publish release) and `statuses: write` (post commit status), confined to the student's own repo. The reusable runner inherits the caller's token, so the same scoping applies inside the runner.
2. **Unauthenticated GitHub Pages fetches** — the publish-pages allow-list keeps `assignments.json`, `autograders/*.yaml`, `autograders/*.py`, and the test tarballs public even when the config repo is private.
3. **Reusable-workflow access** between the student repo and the `classroom50` config repo — both live in the teacher's org. `gh teacher init` configures this access automatically; teachers in orgs with restrictive Actions policies may need to enable it manually at Settings → Actions → General → Access on the `classroom50` repo.

The only personal access token in the entire system is `CLASSROOM50_COLLECT_TOKEN`, which is teacher-side, stored as an Actions secret on the config repo, used only by `collect-scores.yaml`. Students never see it.

## Submitting without `gh student submit`

The shim triggers on `push.tags: ["submit/*"]` — any push of a matching tag runs the full grading flow. `gh student submit` is the recommended path (it refreshes the shim file and `.classroom50.yaml` metadata from Pages), but pure-git workflows work too:

```bash
git add .
git commit -m "Submit hello"
git push origin main
git tag submit/2026-06-01T14-32-05Z
git push origin --tags
```

The student's local shim may be slightly out of date (if the teacher pushed a shim edit since the student last ran `gh student submit`), but the orchestrator and tests are always fetched live from Pages, so a stale shim still grades against the latest teacher-side logic.

## Pinning pytest versions

The default `autograde.py` installs the latest pytest and pytest-json-report on every run. If you've battle-tested your tests against a specific version and want to lock it down, edit the `pip_install(...)` line:

```python
pip_install("pytest==8.3.4", "pytest-json-report==1.5.0")
```

Push the edit and every classroom run uses that version.

## Operational notes

- **CDN propagation:** GitHub Pages can take up to ~10 minutes to serve updated content after a push. If a student submits during that window, their workflow may fetch the previous version of the orchestrator or test tarball.
- **Shim refresh:** `gh student submit` refreshes the workflow shim from Pages on every run. Manual git submits skip the refresh (the shim is intentionally stable; manual submitters who don't run `gh student submit` use whatever shim was last fetched).
- **Re-runs:** Re-triggering a failed workflow run from the Actions UI updates the existing submit-tag release in place (`gh release upload --clobber`) rather than failing on "release already exists".
- **Tag immutability:** Submit tags shouldn't be force-pushed or deleted — `collect-scores.yaml` keys submissions by `(assignment, [usernames])` and would re-ingest the same key with new data on the next collect.
