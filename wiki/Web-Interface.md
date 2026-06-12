# Web Interface (Preview)

**The Classroom 50 web interface is in active development and is not yet publicly available.** This page is a sneak peek at where the teacher UI is headed. It will ship alongside the [CLI](Installation) on July 1; the feature set below mirrors the CLI commands documented in the [Teacher Guide](Teacher-Guide), so anything you can do from `gh teacher` you'll also be able to do from a browser.

## My Classes

The landing page for teachers. Lists every classroom the signed-in user has access to, with a card per classroom showing the term, student count, and underlying `classroom50` config repo. **+ New Class** kicks off the same flow as `gh teacher classroom add`.

![My Classes view](images/classrooms_view.png)

## Students

The roster view for a single classroom. Add students one at a time by GitHub username, or bulk-upload a `.csv` / `.txt` file with one username per line — the equivalent of `gh teacher roster add`. Each entry shows the student's display name, avatar, and GitHub handle; the trash icon removes them from the roster.

![Students roster view](images/classroom_roster_view.png)

## Assignments

The assignment list for a single classroom. Each row shows the assignment slug, mode (individual or group), due date, and a submission-progress bar. **+ Assignment** registers a new assignment against a template repo — the same operation as `gh teacher assignment add`. **View >** opens the submissions detail page below.

![Assignments view](images/assignments_view.png)

## Submissions

The per-assignment detail view. Headline stats summarise the cohort (how many submitted, class average); the table below lists each enrolled student with their submission count, latest autograded score, and last-submitted timestamp. The per-row actions jump to the student's repo (**Commit**), open the full diff of the student's work since the starter code (**Review**), or drill into the full grade breakdown (**Details**). **Download Scores (CSV)** exports the same data the CLI prints from `gh teacher download`.

![Assignment submissions view](images/assignment_single_view.png)

## Status and feedback

The screens above reflect the current prototype and may change before launch. Until the web interface ships, use the CLI documented in the [Teacher Guide](Teacher-Guide) and [Student Guide](Student-Guide), and send web-interface feedback to [GitHub Discussions](https://github.com/foundation50/classroom50/discussions).
