# classroom50-schemas

File-state prototype for the CLI-only, GitHub-native classroom design (no central DB).
Models the JSON state files that would live in each kind of repo, and how those files
map back to the existing GitHub Classroom MySQL schema.

## Three repo types

```
teacher-classroom-repo/   ← one per org/semester (e.g. cs50-fall-2026/classroom)
teacher-template-repo/    ← one per assignment   (e.g. cs50-fall-2026/hello)
student-repo/             ← one per student per assignment
                            (e.g. cs50-fall-2026/jharvard-hello)
```

Mapping to the existing GitHub Classroom schema:

| schema table                  | where it lives now (file)                                     |
| ----------------------------- | ------------------------------------------------------------- |
| `organizations`               | `teacher-classroom-repo/classroom.json`                       |
| `rosters`, `roster_entries`   | `teacher-classroom-repo/roster.json`                          |
| `assignments`                 | `teacher-template-repo/.classroom/assignment.json` (canonical) + `teacher-classroom-repo/assignments/{slug}/manifest.json` (pointer + status) |
| `assignment_tests`            | `teacher-template-repo/.classroom/tests.json`                 |
| `tamper_sealed_paths`         | `teacher-template-repo/.classroom/sealed-paths.json`          |
| `deadlines`                   | inline in `assignment.json` (`deadline` block)                |
| `assignment_invitations`      | implicit — invites are GitHub org/repo invites via API        |
| `invite_statuses`             | derived — query GitHub for repo creation events               |
| `assignment_repos`            | derived — list repos in org matching `*-{slug}`               |
| `assignment_repo_push_events` | derived — `git log` / GitHub API                              |
| `assignment_statuses`         | git tags + GitHub Releases on student repo (canonical); cached snapshot in `teacher-classroom-repo/assignments/{slug}/submissions.json` |
| `groupings`, `groups`         | `teacher-classroom-repo/groups/{slug}.json` (not shown — individual assignment in this prototype) |

## Sources of truth

- **Classroom-level config + roster** → classroom repo (one place, edited by teacher).
- **Assignment definition + tests + sealed paths + workflow** → template repo (frozen
  per-assignment; propagates to every student repo on `gh student accept`).
- **Per-student submission history** → tags + releases on the student repo. The
  classroom repo's `submissions.json` is a *cached snapshot* the teacher refreshes
  with a sync command — not authoritative.

## Open questions still to resolve

- Concurrency: two teachers editing `roster.json` at once → rely on git rebase/merge?
- Semester rollover: `previous_classroom` pointer + `gh teacher copy` command?
- Sealed-path enforcement: server-side via Actions check, client-side via pre-push
  hook installed by `gh student accept`, or both?
