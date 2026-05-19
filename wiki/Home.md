# classroom50

Tools for running a GitHub-backed classroom: a teacher CLI, a student CLI, reusable GitHub Actions workflows, and starter assignment templates. Everything is installable from a single repo clone.

## Where to start

- **New here?** Read [Installation](Installation) — install Go, `gh`, and the two CLI extensions in a few commands.
- **Teaching a class?** Walk through the [Teacher Guide](Teacher-Guide): set up the org, run `gh teacher init`, add a classroom, manage the roster, invite students, download submissions.
- **Taking a class?** Walk through the [Student Guide](Student-Guide): accept an assignment, submit your work.
- **Looking up a flag?** Skim the per-command references for [`gh teacher`](gh-teacher) and [`gh student`](gh-student).
- **Building an assignment template?** See [Assignment Templates](Assignment-Templates).
- **Something broken?** See [Troubleshooting](Troubleshooting).

## What the CLIs do

`gh teacher` and `gh student` are [`gh` CLI extensions](https://docs.github.com/en/github-cli/github-cli/creating-github-cli-extensions) that wrap the GitHub REST API and `git` to automate the classroom lifecycle:

- A teacher bootstraps a per-org `classroom50` config repo (`gh teacher init`), scaffolds one or more classrooms inside it (`gh teacher classroom add`), invites students to a GitHub org, and downloads their submissions in bulk.
- A student accepts an assignment (which provisions a private repo from a template) and submits work as commits.

There is no separate server. All state lives in GitHub: org membership, per-student private repos, and a small `.classroom50.yml` metadata file inside each student repo.

## Editing this wiki

This wiki is auto-synced from the [`wiki/`](https://github.com/foundation50/classroom50-dev/tree/v1/wiki) folder of the development repo on every merge to `v1`. **Edit pages there**, not here — direct edits will be overwritten on the next sync. Add a page by dropping a new `.md` file into `wiki/`; the filename (without extension, dashes shown as spaces) becomes the page name.
