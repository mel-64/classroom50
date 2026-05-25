# Classroom 50

Classroom 50 is an open-source [GitHub Classroom](https://classroom.github.com/) alternative developed by the [Fifty Foundation](https://fifty.foundation/), GitHub's official open-source partner for educational software tools. Classroom 50 includes both a command-line interface and a web interface that enable teachers to distribute programming assignments in repositories, configure auto-grading via GitHub Actions, and review student submissions. Classroom 50 will be available starting on July 1. Until then, you can [sign up for email updates](https://fifty.foundation/) or [try the pre-release version](#try-the-pre-release) of the tool.

**Starting July 1, this page will host the full setup guide for a new GitHub classroom.** Each classroom will live inside your GitHub organization: the tooling handles repo creation, roster management, and score collection, and GitHub holds the state. Students accept an assignment, get a private repo from a template, push commits to submit, and get scored automatically.

## Try the pre-release

The command-line interface is feature-complete enough to run a class with today; the web interface is still in development. To kick the tires:

1. Follow the [Installation](Installation) guide. Go and the [GitHub CLI (`gh`)](https://cli.github.com/) are the only prerequisites.
2. Walk through the [Teacher Guide](Teacher-Guide) to set up your org, scaffold a classroom, add a roster, register assignments, and collect scores.
3. Point students at the [Student Guide](Student-Guide) for accept-and-submit instructions.

Reference docs:

- [`gh teacher`](gh-teacher) — every teacher command and flag.
- [`gh student`](gh-student) — every student command and flag.
- [Assignment Templates](Assignment-Templates) — what an assignment template repo should look like.
- [Autograders](Autograders) — the shim/runner/autograder autograding stack.
- [GitHub Integration](GitHub-Integration) — manual GitHub setup, REST API reference, Actions workflows.
- [Troubleshooting](Troubleshooting) — common errors and debug flags.
- [examples/autograders/](https://github.com/foundation50/classroom50/tree/main/examples/autograders) — drop-in autograder configurations.

## Get help

- **Questions, ideas, feature requests:** open a thread in [GitHub Discussions](https://github.com/foundation50/classroom50/discussions) on the `classroom50` repo.
- **Bug reports:** file an [issue](https://github.com/foundation50/classroom50/issues).
- **Email updates:** subscribe at [fifty.foundation](https://fifty.foundation).
