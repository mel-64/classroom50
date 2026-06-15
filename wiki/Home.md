# Classroom 50

Classroom 50 is an open-source [GitHub Classroom](https://classroom.github.com/) alternative developed by the [Fifty Foundation](https://fifty.foundation/), GitHub's official open-source partner for educational software tools. Classroom 50 includes both a command-line interface and a web interface that enable teachers to distribute programming assignments in repositories, configure auto-grading via GitHub Actions, and review student submissions.

Classroom 50 will be available starting on July 1. Until then, you can [sign up for email updates](https://fifty.foundation/) or [try the pre-release version](#try-the-pre-release) of the tool.

**Starting July 1, this page will host the full setup guide for a new GitHub classroom.**

## Features

Classroom 50 supports:

- Creating assignments with starter code
- Defining correctness tests
- Distributing individual and group assignments
- Collecting and auto-grading submissions
- Providing inline qualitative feedback on submissions
- Managing course rosters and scores

Classroom 50 is entirely GitHub-based and does not have any servers of its own: all data lives in GitHub repositories and all auto-grading runs in GitHub Actions.

Teachers and students can use Classroom 50 through the web interface at https://classroom50.org or via the command-line interface (CLI), which is available as `gh teacher` and `gh student` GitHub CLI extensions.

To use Classroom 50, you'll need:

- A GitHub account
- A GitHub organization with at least the Team plan (free via GitHub Education for verified teachers).

## Try the Pre-Release

**Note that this is a pre-release version of Classroom 50. Starting July 1, you may need to re-create any classrooms configured during the pre-release period.**

The command-line interface is feature-complete enough to run a class with today; the web interface is still in development. To kick the tires:

1. Follow the [Installation](Installation) guide. Go and the [GitHub CLI (`gh`)](https://cli.github.com/) are the only prerequisites.
2. Walk through the [CLI Teacher Guide](CLI-Teacher-Guide) to set up your org, scaffold a classroom, add a roster, register assignments, and collect scores.
3. Students can follow the steps in the [CLI Student Guide](CLI-Student-Guide) to accept and submit assignments.

## Get Help

- **Questions, ideas, feature requests:** open a thread on our [Discussions page](https://github.com/foundation50/classroom50/discussions).
- **Bug reports:** file an [issue](https://github.com/foundation50/classroom50/issues).
- **Email updates:** subscribe at [fifty.foundation](https://fifty.foundation).
