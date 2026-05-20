# Assignment Templates

An "assignment" in classroom50 is just a normal GitHub repo with the "Template repository" flag turned on. `gh student accept` creates a fresh private copy of the template for each student; `gh student submit` fetches a couple of files back from it on every submit. This page describes the expected layout.

A worked example lives at [`templates/example-assignment/`](https://github.com/foundation50/classroom50/tree/main/templates/example-assignment).

## Required structure

```
.
├── README.md              # student-facing description of the assignment
├── .gitignore             # optional, re-fetched on every gh student submit
├── .github/               # optional, re-fetched on every gh student submit
│   └── workflows/         # CI for student copies (NOT autograde — see below)
└── <starter code>         # whatever files the assignment needs
```

Notes on each piece:

- **`README.md`** — what the student sees when they land on their copy of the repo. Describe the assignment, expected output, evaluation criteria, etc.
- **`.gitignore`** (optional) — if present, `gh student submit` re-fetches this from the template at submit time. Update it once on the template and every student's next submission picks it up.
- **`.github/`** (optional) — same re-fetch behavior. **One caveat from v0.2**: the autograde workflow no longer lives in templates. `gh student accept` and `gh student submit` drop a CLI-embedded `.github/workflows/autograde.yml` and **overwrite any same-named file from the template** on every submit, so the workflow stays in lockstep with the CLI version. Put non-autograde workflows here (linters, formatters, dependabot, etc.); leave autograding to the CLI's own workflow + the teacher's `gh teacher assignment add --tests <path>` payload.
- **Starter code** — any files the student should start from. The template can be a single file or a full project skeleton.

### Upgrading a v0.1 template

If your template still ships a v0.1-style autograde workflow at `.github/workflows/classroom50.yaml` (or any other autograde-flavored YAML), **remove it before students accept against the v0.2 CLI**. Two reasons:

- The v0.2 CLI's `.github/workflows/autograde.yml` runs alongside any template-shipped workflow, so leaving the old one in place produces two autograde runs per push. The old one will trigger on every `main`-branch push (not just `submit/*` tags), grading every typo fix as a submission.
- Autograding tests now live in `assignments.json` (managed by `gh teacher assignment add --tests`), not in each template's workflow YAML. Keep the source of truth in one place.

## Setting it up

1. Create a normal repo in your classroom org with the structure above. The slug you give the repo (e.g. `example-assignment`, `hello`, `dna`) is what students pass as `<assignment>` to `gh student accept`.
2. **Make the repo public** so students can read it under the "No permission" org base setting (private templates would 404 on `gh student accept`). The GitHub Enterprise Cloud "internal" visibility works too, on plans that have it.
3. **Mark it as a template** in `Settings → General → Template repository`.

That's it. Students can now run:

```sh
gh student accept <org> <classroom> <assignment-slug>
```

…which will create `<org>/<classroom>-<assignment-slug>-<username>` from your template, lowercased.

## Why these specific files re-sync

`gh student submit` re-fetches `.gitignore` and `.github/` from the template (recorded in `.classroom50.yml`) on every submission. The intent: instructors should be able to fix autograding or tweak ignored paths on the template after students have already accepted, and have those changes apply on the next submission without student intervention. Starter code and the README are **not** re-fetched — they belong to the student once accepted.
