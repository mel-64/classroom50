# Autograders

How Classroom 50 grades student submissions, and how teachers customize.

## Architecture in one paragraph

Every push to a student's `main` branch triggers the **shim workflow** at `.github/workflows/autograde.yaml` in their assignment repo. The shim is ~20 lines and does one thing: it `uses:` the **autograde-runner** reusable workflow in your config repo (`<org>/classroom50/.github/workflows/autograde-runner.yaml@main`). The runner workflow's `setup` job creates a `submit/<UTC-timestamp>-<short-sha>` tag at the pushed commit, reads `assignments.json` from Pages, and emits the assignment's runtime block as job outputs. The `grade` job runs on the chosen runner (or container), conditionally sets up language toolchains and apt packages, fetches the **runner script** (`runner.py`) from Pages, and executes it. `runner.py` downloads the per-assignment bundle (also from Pages), resolves the **entrypoint** (the bundled `autograder.py` if present, otherwise the classroom default at `<classroom>/autograder.py`), and execs it with helper env vars and `cwd` at the student's repo checkout. When neither exists, the runner synthesizes a vacuous-pass `result.json` so the workflow still publishes the submit-tag release with a clear "no autograder configured" status. The autograder writes `./result.json` (and optionally `./release-body.md` + `status=`/`summary=` to `$GITHUB_OUTPUT`); `runner.py` validates and synthesizes anything missing. The workflow then posts a commit status and publishes a GitHub Release at the submit tag with `result.json` attached. A small follow-up `set-latest` job, serialized via a per-repo concurrency group, flips the "latest" release pointer forward exactly once at a time. The **`collect-scores.yaml`** workflow on the config repo aggregates each release's `result.json` into `<classroom>/scores.json`.

Everything substantive (runner workflow, `runner.py`, classroom-default and per-assignment `autograder.py`, runtime configuration, per-assignment bundle) lives in the config repo and is fetched at workflow runtime, so teacher edits propagate to every existing student repo on the next submission with zero per-student-repo maintenance.

## Submission triggers

The shim listens on two events:

- **`push` to `main`** — every commit grades. The runner creates the `submit/<UTC-timestamp>-<short-sha>` tag at the pushed SHA. This is what `gh student submit` and a plain `git push origin main` both end up using.
- **`push` of a `submit/*` tag** — manual or web-UI tag pushes work too. The runner detects the tag-trigger and reuses `github.ref_name` instead of creating a new tag.

Tags pushed by the runner with the workflow's `GITHUB_TOKEN` don't fire workflows (GitHub's anti-recursion rule), so the auto-tag step never causes a second run.

## The `result.json` contract

This is the **only** contract every autograder must satisfy. Whatever produces it — pytest, check50, JUnit, a shell script, a Rust binary — is up to the teacher. The runner reads `result.json` from the workflow workspace after the autograder exits.

```json
{
  "schema":     "classroom50/result/v1",
  "classroom":  "cs-principles",
  "assignment": "hello",
  "usernames":  ["alice"],
  "submission": "submit/2026-06-01T14-32-05Z-a1b2c3d",
  "commit":     "https://github.com/.../commit/<sha>",
  "release":    "https://github.com/.../releases/tag/submit%2F...",
  "review":     "https://github.com/.../commit/<sha>",
  "datetime":   "2026-06-01T14:33:11Z",
  "score":      4,
  "max-score":  5,
  "tests": [
    { "test-name": "compiles",       "passed": true,  "score": 4, "max-score": 4 },
    { "test-name": "outputs_correct","passed": false, "score": 0, "max-score": 1 }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `schema` | string | Must be `classroom50/result/v1` exactly |
| `classroom` | string | Must match `<classroom>` in the repo name |
| `assignment` | string | Must match `<assignment>` in the repo name |
| `usernames` | `[string]` | Exactly one element (individual assignments) |
| `submission` | string | The submit-tag name |
| `commit` | string | URL to the submission commit |
| `release` | string | URL to the release |
| `review` | string | URL teachers click to review (commit view) |
| `datetime` | string | UTC ISO 8601 (`YYYY-MM-DDTHH:MM:SSZ`) |
| `score` | int | Sum of test scores (0 ≤ score ≤ max-score) |
| `max-score` | int | Sum of test max-scores |
| `tests` | `[object]` | Per-test breakdown (optional content — `[]` is valid for the "vacuous pass / no tests configured" case) |

`collect-scores.yaml` validates this payload before merging into `scores.json`. Mismatches against the source repo's identity (classroom/assignment/username triple) are rejected with a warning.

## Writing an `autograder.py`

The autograder is a Python script the runner invokes once per submission. There are two scopes:

| Path | Scope | Resolution |
|---|---|---|
| `<classroom>/autograders/<slug>/autograder.py` | One assignment | Used if present in the bundle |
| `<classroom>/autograder.py` | One classroom | Falls back to this when no per-assignment override exists |

If neither exists, the runner synthesizes a vacuous-pass result (status=`success`, score 0/0, summary "submitted — no autograder configured for `<slug>`") and the submission still lands as a tagged release. "No autograder configured" is a valid mid-setup state — classrooms work end-to-end before any grading code is written.

Replace the classroom default to grade every assignment in the classroom with one script (e.g., a slug-driven dispatcher that calls a third-party grader like `check50`); add per-assignment overrides only where individual assignments diverge from the classroom default.

### Contract

The runner provides:

- **Environment variables**:
  - `CLASSROOM`, `ASSIGNMENT`, `SUBMISSION_TAG`, `PAGES_BASE_URL`
  - `USERNAME` (derived from the repo name)
  - `COMMIT_URL`, `RELEASE_URL`
  - All standard `GITHUB_*` (REPOSITORY, SHA, ACTOR, OUTPUT, etc.)
- **Working directory**: the student's repo checkout (relative paths resolve to student code).
- **Sibling files**: anything else under `<classroom>/autograders/<slug>/` is bundled with the autograder and lives at `Path(__file__).parent` after extraction. Use `Path(__file__).parent` to find fixtures, helpers, framework configs, etc.

The autograder must produce:

- **`./result.json`** — `classroom50/result/v1` payload (REQUIRED).
- **`./release-body.md`** — Markdown body for the GitHub Release (optional; the runner synthesizes one from `result.json` if absent).
- **`status=` and `summary=` lines in `$GITHUB_OUTPUT`** (optional; the runner derives them from `result.json` if absent — `success` when all tests pass or `tests` is empty, `failure` when any test failed).

Exit code:

- **0** — autograder ran end-to-end (test pass/fail captured in `result.json`).
- **non-zero** — infrastructure failure. The runner synthesizes a `status=error` result.

### Classroom default (diagnostic stub)

`gh teacher autograder set-default <org> <classroom>` (with no `--from`) drops a diagnostic stub at `<classroom>/autograder.py`. The stub echoes every env var to stdout, writes a vacuous-pass `result.json` (empty `tests` array → "submitted, no autograder configured"), and exits 0. This lets you verify the runner wires up correctly before writing real grading logic. Replace it via `set-default --from <path>` once you're ready to grade.

If you skip `set-default` entirely, the runner produces the same vacuous-pass result on its own — submissions still tag and publish releases, just with status=`success` 0/0. The stub is only useful if you want diagnostic stdout in the workflow log.

### Template: pytest

Drop this at `<classroom>/autograders/<slug>/autograder.py` alongside your `test_*.py` files:

```python
"""Pytest-based autograder. Runs sibling test_*.py files against
the student's code, parses pytest's JSON report, emits result.json."""

import datetime, json, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
REPORT = HERE / "pytest-report.json"

# Per-test weights. Anything not listed here gets DEFAULT_WEIGHT.
WEIGHTS = {}
DEFAULT_WEIGHT = 1

subprocess.run(
    [sys.executable, "-m", "pip", "install", "--quiet", "--user",
     "pytest", "pytest-json-report"],
    check=True,
)
subprocess.run(
    [sys.executable, "-m", "pytest", str(HERE),
     "--json-report", f"--json-report-file={REPORT}", "-q", "--no-header"],
    cwd=os.getcwd(),
    check=False,
)

if not REPORT.is_file():
    print("::error::pytest did not produce a JSON report", file=sys.stderr)
    sys.exit(1)

data = json.loads(REPORT.read_text())
tests = []
for t in data.get("tests", []):
    nodeid = t.get("nodeid", "")
    passed = t.get("outcome") == "passed"
    max_score = WEIGHTS.get(nodeid.split("::")[-1], DEFAULT_WEIGHT)
    tests.append({
        "test-name": nodeid,
        "passed": passed,
        "score": max_score if passed else 0,
        "max-score": max_score,
    })

result = {
    "schema":     "classroom50/result/v1",
    "classroom":  os.environ["CLASSROOM"],
    "assignment": os.environ["ASSIGNMENT"],
    "usernames":  [os.environ["USERNAME"]],
    "submission": os.environ["SUBMISSION_TAG"],
    "commit":     os.environ["COMMIT_URL"],
    "release":    os.environ["RELEASE_URL"],
    "review":     os.environ["COMMIT_URL"],
    "datetime":   datetime.datetime.now(datetime.timezone.utc)
                  .strftime("%Y-%m-%dT%H:%M:%SZ"),
    "score":      sum(t["score"] for t in tests),
    "max-score":  sum(t["max-score"] for t in tests),
    "tests":      tests,
}
Path("result.json").write_text(json.dumps(result, indent=2))

# Let the runner synthesize release-body.md and status/summary
# from result.json (which it does whenever they're absent).
```

Test files are still ordinary pytest — `test_*.py` next to `autograder.py`, optional `conftest.py` for fixtures.

### Template: minimal custom

Anything that produces `result.json` works. Compile-and-diff, image-similarity scoring, web-scraping the student's deployed app — write it however you like:

```python
import datetime, json, os, subprocess
from pathlib import Path

# Compile, run, compare output.
subprocess.run(["gcc", "-o", "hello", "hello.c"], check=True)
proc = subprocess.run(["./hello"], capture_output=True, text=True, check=False)
passed = proc.stdout.strip() == "Hello, world!"

result = {
    "schema":     "classroom50/result/v1",
    "classroom":  os.environ["CLASSROOM"],
    "assignment": os.environ["ASSIGNMENT"],
    "usernames":  [os.environ["USERNAME"]],
    "submission": os.environ["SUBMISSION_TAG"],
    "commit":     os.environ["COMMIT_URL"],
    "release":    os.environ["RELEASE_URL"],
    "review":     os.environ["COMMIT_URL"],
    "datetime":   datetime.datetime.now(datetime.timezone.utc)
                  .strftime("%Y-%m-%dT%H:%M:%SZ"),
    "score":      1 if passed else 0,
    "max-score":  1,
    "tests": [
        {"test-name": "prints_hello_world", "passed": passed,
         "score": 1 if passed else 0, "max-score": 1},
    ],
}
Path("result.json").write_text(json.dumps(result, indent=2))
```

## The `runtime` block in `assignments.json`

Per-assignment runtime customization (runner OS, language toolchains, system packages, container image) lives in `assignments.json` as an optional `runtime:` field on each entry. The autograde-runner workflow's setup job reads it on every submission, so changes propagate without any student-repo edit and without changing the workflow file.

Pass a JSON file to `gh teacher assignment add --runtime`:

```json
{
  "runs-on": "ubuntu-latest",
  "python":  "3.12",
  "node":    "20",
  "java":    "21",
  "go":      "1.23",
  "apt":     ["build-essential", "valgrind"]
}
```

```sh
gh teacher assignment add cs50-fall-2026 cs-principles greet \
    --name "Greet" --template cs50/greet-template \
    --runtime ./runtime-greet.json
```

When `runtime` is omitted, the workflow defaults to `ubuntu-latest` with Python 3.12 set up via `actions/setup-python` so most autograders work without any per-assignment runtime config. No other toolchains are set up and no apt install runs. Inside a custom `container`, the image owns the toolchain — `python` is left alone unless explicitly set.

### Fields

| Field | Type | Notes |
|---|---|---|
| `runs-on` | string | One of `ubuntu-latest`, `ubuntu-24.04`, `ubuntu-22.04`, `ubuntu-20.04`, `macos-latest`, `macos-14`, `macos-13`, `windows-latest`, `windows-2022`, `windows-2019`. Self-hosted labels are rejected at write and runtime. |
| `python` / `node` / `java` / `go` | string | Version strings passed to `actions/setup-python` / `setup-node` / `setup-java` (with `distribution: temurin`) / `setup-go`. `node`, `java`, `go` steps are skipped when their field is unset. `python` defaults to `3.12` on the host path; inside a `container` the image owns Python unless `python` is set explicitly. |
| `apt` | `[string]` | Each package name must match `^[a-z0-9][a-z0-9.+-]{0,63}$` (Debian/Ubuntu source-package grammar, length-capped). Linux runners only. |
| `container` | object | Escape hatch — see below. Mutually exclusive with `apt`. |

### Custom container

Anything beyond apt + setup-X actions reaches for `runtime.container`. The image runs on Linux hosts; `runs-on` may be omitted or set to an `ubuntu-*` label.

```json
{
  "container": {
    "image": "cs50/cli:latest",
    "user": "root"
  }
}
```

`user` is recommended for any image that doesn't run as root by default (cs50/cli, most maintained Docker Hub images). Without it, `actions/checkout` fails with `EACCES: permission denied` when writing to GitHub Actions' temp directory at `/__w/_temp/`. Accepts `docker run --user` syntax: a name (`root`, `appuser`), a numeric uid (`0`, `1000`), or `uid:gid` (`1000:1000`). Internally translated to `container.options: --user <value>` because GitHub Actions doesn't accept `container.user` directly.

For a private image, supply pull credentials. Passwords must be `${{ secrets.NAME }}` references — raw token strings are rejected so a teacher can't accidentally paste a token into git history.

```json
{
  "container": {
    "image": "ghcr.io/private/grader:latest",
    "user": "root",
    "credentials": {
      "username": "cs50-bot",
      "password": "${{ secrets.GHCR_TOKEN }}"
    }
  }
}
```

> **Known limitation: private-image pulls are currently unverified end-to-end.** The runner workflow ships the container block to the grade job via `container: ${{ fromJSON(needs.setup.outputs.container) }}`, and GitHub Actions does **not** re-evaluate `${{ }}` expressions inside `fromJSON`-derived data — the literal text `${{ secrets.GHCR_TOKEN }}` flows through to docker login as the password instead of the secret value. Public images (no `credentials` block) work as designed; private images need a follow-up architectural change that splits credentials out of the JSON path. Until then, prefer public registry images or pre-pull private images via a separate workflow before grading.

| Field | Type | Notes |
|---|---|---|
| `image` | string | Required. Validated against an injection-safe character set. |
| `user` | string | Optional but recommended for non-root images. `^[A-Za-z0-9_][A-Za-z0-9_.-]{0,31}(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,31})?$`. |
| `credentials` | object | Optional. `username` + `password`; password must be a `${{ secrets.NAME }}` reference. |

## Customization layers

| What you want to change | Where to edit it | Propagation |
|---|---|---|
| **Grading logic for one assignment** | `<classroom>/autograders/<slug>/autograder.py` | Next submission |
| **Grading logic shared across one classroom** | `<classroom>/autograder.py` (set via `gh teacher autograder set-default`; can branch on `ASSIGNMENT` to handle slug differences) | Next submission |
| **Runtime environment for one assignment** | `runtime:` block in the matching `assignments.json` entry | Next submission |
| **Runtime environment shared across many assignments** | Repeat the `runtime:` block on each entry, or pick a container image that covers everyone | Next submission |

All four layers live in the config repo. None require any change in any student repo.

The runner workflow file itself (`autograde-runner.yaml`) is the right place to edit only when you need to add a language toolchain GitHub doesn't ship a setup-X action for, or change the post-grade publish steps. For everything else, `autograder.py` + the `runtime:` block cover the cases.

## Custom runner workflow (rare)

The `--autograder <name>` flag on `gh teacher assignment add` exists for the rare case where you want an assignment to call a fundamentally different *reusable workflow* — not just a different `autograder.py`, but a different runner entirely. To opt in:

1. Drop a sibling shim at `<classroom>/autograders/<name>.yaml` in the config repo. Its `uses:` line points at your custom reusable workflow.
2. `gh teacher assignment add ... --autograder <name>`. The CLI verifies the file exists at write time.

`gh student accept` fetches the named shim from Pages instead of using the embedded default, so the student repo gets your custom shim. Most teachers never need this.

## Failure paths

The runner synthesizes a v1-shaped `result.json` on every error path so the workflow's downstream steps always have something to publish. Failure modes:

| What failed | What surfaces |
|---|---|
| Shim's `uses:` fails to resolve (reusable-workflow access disabled, or the runner file 404s) | GitHub marks the run failed at workflow-load time with "This run likely failed because of a workflow file issue"; no jobs execute. Fix at the config-repo side; the student's repo is fine. |
| `.classroom50.yaml` is missing or corrupt | Runner setup exits with `::error::`; commit status = `error`; **no release published** (debug from Actions UI) |
| `assignments.json` returns 404 | Same — `::error::` from runner setup with the missing URL |
| `runtime` block contains a disallowed value | Same — `::error::` naming the offending field |
| Auto-tag step fails | Setup job fails before grading starts; no commit status, no release |
| `runner.py` returns 404 | Setup succeeds but the grade job's curl exits non-zero; commit status = `error`; **no release published** |
| Bundle fetch fails (network, corruption) | Runner synthesizes `result.json` with empty tests + `status=error`; **release publishes** with the failure summary so collect-scores still ingests as "submitted, error" |
| Bundle has no `autograder.py` AND default `autograder.py` returns 404 | Same — `status=error`; release publishes with diagnostic summary |
| `autograder.py` exits non-zero | Same — runner captures the rc, synthesizes `status=error` |
| `autograder.py` exits 0 but doesn't write `result.json` | Same — runner synthesizes `status=error` |
| `result.json` is malformed (bad schema, identity mismatch, non-list `tests`) | Same — runner rejects with a specific error message |
| Tests run, some fail | Normal case. Release publishes with per-test breakdown; `status=failure` if any failed. |
| All tests pass (or `tests: []` in `result.json`) | Normal case. Release publishes with `status=success`. |

Workflow-load failures (the early rows above, where the runner workflow itself doesn't even start) do **not** show up in `scores.json`. Collect-scores' per-assignment "X of Y submitted" summary reports the student as not-yet-submitted, and the teacher debugs from the student's Actions tab. The runner-workflow failures show up *in the student's Actions tab* as a nested job — GitHub's reusable-workflow runs are visible to the calling repo's Actions UI.

## No credentials required

Students never configure any tokens, secrets, or env vars. The full grading flow runs entirely on:

1. **The workflow's auto-provisioned `GITHUB_TOKEN`** — scoped to `contents: write` (publish release, push the auto-tag) and `statuses: write` (post commit status), confined to the student's own repo. The reusable runner inherits the caller's token, so the same scoping applies inside the runner.
2. **Unauthenticated GitHub Pages fetches** — the publish-pages allow-list keeps `assignments.json`, `autograder.py`, `autograders/*.yaml`, and the per-assignment bundles public even when the config repo is private.
3. **Reusable-workflow access** between the student repo and the `classroom50` config repo — both live in the teacher's org. `gh teacher init` configures this access automatically; teachers in orgs with restrictive Actions policies may need to enable it manually at Settings → Actions → General → Access on the `classroom50` repo.

The only personal access token in the entire system is `CLASSROOM50_COLLECT_TOKEN`, which is teacher-side, stored as an Actions secret on the config repo, used only by `collect-scores.yaml`. Students never see it.

## Operational notes

- **Every push grades, every push gets its own release.** Pushing 5 commits in 10 minutes produces 5 graded runs and 5 releases — `cancel-in-progress: false` on purpose. (See [Submission triggers](#submission-triggers) for the trigger contract.)
- **"Latest" pointer is chronological.** When concurrent runs land out-of-order, the `set-latest` job (serialized via a per-repo concurrency group) compares the new tag's lexical (UTC-timestamp) order against the current latest release and only flips the `latest` pointer forward, so older completions don't make older submissions look newest.
- **CDN propagation:** GitHub Pages can take up to ~10 minutes to serve updated content after a push. If a student submits during that window, their workflow may fetch the previous version of `runner.py`, the default autograder, or the bundle.
- **Re-runs:** Re-triggering a failed workflow run from the Actions UI updates the existing submit-tag release in place (`gh release upload --clobber`) rather than failing on "release already exists".
- **Tag immutability:** Submit tags shouldn't be force-pushed or deleted -- in `scores.json` rows are bucketed by assignment slug and keyed within a bucket by `[usernames]`, so `collect-scores.yaml` would re-ingest the same key with new data on the next collect.
