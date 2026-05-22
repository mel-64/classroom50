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
- **`.github/`** (optional) — same re-fetch behavior. **The autograde workflow does not live in the template.** `gh student accept` fetches the assignment's autograder workflow YAML from your `classroom50` config repo's Pages site (`<org>.github.io/classroom50/<classroom>/autograders/<name>.yaml`) and writes it to `.github/workflows/autograde.yaml`; `gh student submit` re-fetches and **overwrites `.github/workflows/autograde.yaml`** on every submit, so the workflow always tracks whatever your config repo publishes. Put non-autograde workflows here (linters, formatters, dependabot, etc.); leave autograding to your config repo's `<classroom>/autograders/` directory (workflow shims, `autograde.py`, and pytest files under `<classroom>/autograders/tests/<slug>/`).
- **Starter code** — any files the student should start from. The template can be a single file or a full project skeleton.

## Setting it up

1. Create a normal repo in your classroom org with the structure above. Register it with `gh teacher assignment add ... --template <owner>/<repo>` — the **assignment slug** you choose there (e.g. `hello`, `dna`) is what students pass as `<assignment>` to `gh student accept`, and it does not have to match the template repo's name.
2. **Make the repo public** so students can read it under the "No permission" org base setting (private templates would 404 on `gh student accept`). The GitHub Enterprise Cloud "internal" visibility works too, on plans that have it.
3. **Mark it as a template** in `Settings → General → Template repository`.

That's it. Students can now run:

```sh
gh student accept <org> <classroom> <assignment-slug>
```

…which will create `<org>/<classroom>-<assignment-slug>-<username>` from your template, lowercased.

## Why these specific files re-sync

`gh student submit` re-fetches `.gitignore` and `.github/` from the template (recorded in `.classroom50.yaml`) on every submission. It also re-fetches the assignment's autograder workflow from your `classroom50` config repo's Pages site (`<org>.github.io/classroom50/<classroom>/autograders/<name>.yaml`) and writes it on top of `.github/workflows/autograde.yaml`, so an instructor's edit to the autograder workflow propagates immediately. Starter code and the README are **not** re-fetched — they belong to the student once accepted.
