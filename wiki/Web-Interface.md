# Web Interface (Preview)

The Classroom 50 web interface is available at [classroom50.org](https://classroom50.org). It covers the same operations as the CLI tools documented in the [CLI Teacher Guide](CLI-Teacher-Guide) and [CLI Student Guide](CLI-Student-Guide) -- if you can do it from `gh teacher` or `gh student`, you can do it from a browser.

## Sign in

The web interface authenticates via GitHub OAuth2. Two flows are available:

- **Sign in with GitHub** -- standard redirect-based flow. You are sent to GitHub's authorization page and redirected back to classroom50.org once you approve access.
- **Use a device code instead** -- for environments where opening a browser tab is not practical. GitHub issues a device code you enter at github.com/login/device.

Both flows request the scopes `read:user read:org repo workflow admin:org`. All token exchange requests are routed through a Cloudflare Worker rather than hitting GitHub's OAuth endpoints directly. The Worker serves two purposes:

- **CORS proxy.** GitHub's OAuth endpoints (`github.com/login/oauth/access_token`, `github.com/login/device/code`) do not send `Access-Control-Allow-Origin` headers, so a browser `fetch()` to them is blocked by the same-origin policy. The Worker adds CORS headers to every response so the browser can reach them.
- **Secret injection.** For the web flow token exchange, the Worker holds `GITHUB_CLIENT_SECRET` in its own environment and injects it into the forwarded request. The client secret never reaches the browser. Device flow routes do not carry the secret -- the device code is the credential.

The Worker also validates that every request comes from an allowed origin (`classroom50.org`, `fifty.foundation`, or `localhost`) and matches the configured `GITHUB_CLIENT_ID`, preventing other apps from using it as a proxy.

**PKCE and CSRF protection.** The web flow uses PKCE (Proof Key for Code Exchange): a random `code_verifier` is generated in the browser, its SHA-256 `code_challenge` is sent to GitHub, and the verifier is sent to the Worker at exchange time. A random `state` parameter guards against CSRF. Both values are stored in `sessionStorage` under the keys `gh_pkce_verifier` and `gh_oauth_state` and are deleted immediately after the callback is processed.

**Token storage.** Once the Worker returns a token, it is written to `localStorage`:

| Key | Value |
|-----|-------|
| `gh_access_token` | The GitHub OAuth2 access token |
| `gh_scope_granted` | The scopes GitHub confirmed were granted |

The token persists across browser sessions -- closing and reopening the tab does not require signing in again. **Sign out** removes both keys from `localStorage` and clears all cached GitHub API data.

The post-login panel shows a preview of the stored token (`gh_access_token -> <first 8 chars>...`) and the granted scopes so you can confirm the correct account is signed in.

## Organizations

The landing page after sign-in. Lists every GitHub organization the signed-in user belongs to. Selecting an organization takes you to its dashboard, from which you can run first-time setup (`gh teacher init` equivalent), manage org settings, and navigate to classrooms.

## My Classes

Lists every classroom in the selected organization, with a card per classroom showing the term and student count. **+ New Class** kicks off the same flow as `gh teacher classroom add`.

![My Classes view](images/classrooms_view.png)

## Students

The roster view for a single classroom. Add students one at a time by GitHub username, or bulk-upload a `.csv` / `.txt` file with one username per line -- the equivalent of `gh teacher roster add`. Each entry shows the student's display name, avatar, and GitHub handle; the trash icon removes them from the roster.

![Students roster view](images/classroom_roster_view.png)

## Assignments

The assignment list for a single classroom. Each row shows the assignment slug, mode (individual or group), due date, and a submission-progress bar. **+ Assignment** registers a new assignment against a template repo -- the same operation as `gh teacher assignment add`. **View >** opens the submissions detail page below.

![Assignments view](images/assignments_view.png)

## Submissions

The per-assignment detail view. Headline stats summarise the cohort (how many submitted, class average); the table below lists each enrolled student with their submission count, latest autograded score, and last-submitted timestamp. The per-row actions jump to the student's repo (**Commit**), open the full diff of the student's work since the starter code (**Review**), or open the full grade breakdown on GitHub (**Details**). **Download Scores (CSV)** exports the same data the CLI prints from `gh teacher download`.

![Assignment submissions view](images/assignment_single_view.png)

## Accept Assignment (student)

Students navigate to a per-assignment acceptance page to claim their starter repo -- the browser-side equivalent of `gh student accept`. The page confirms the assignment name and template, then provisions the student's private repo under the org.

## Status and feedback

The screens above reflect the current prototype and may change before launch. Send web-interface feedback to [GitHub Discussions](https://github.com/foundation50/classroom50/discussions).
