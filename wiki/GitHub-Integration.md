# GitHub Integration

This page documents every place where Classroom 50 touches GitHub's API or authentication infrastructure — what you have to do manually in a browser, what the CLI handles for you, and the complete list of REST API calls the tooling makes.

## Manual steps

### 1. Org setup (one-time, github.com web UI)

The CLI never creates or modifies orgs. Do the following once before running any CLI commands:

1. **Create the organization** at <https://github.com/account/organizations/new>. Free orgs work for public template repos; Team or Enterprise Cloud is required for GitHub Pages from a private repo (the `classroom50` config repo is private).

2. **Set the base permission to "No permission"** at `https://github.com/organizations/<org>/settings/member_privileges`. This ensures students only see repos they've been explicitly invited to — without it, students can read every repo in the org.

3. **Flag your template repos as templates** under each repo's `Settings → General → Template repository`. Templates must also be **public** on Free and Team plans so students can read them (the "No permission" baseline prevents org members from reading private repos they aren't direct collaborators on). GitHub Enterprise Cloud's "internal" visibility is the exception — see [GitHub's docs on internal repositories](https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/about-repositories#about-internal-repositories).

### 2. Teacher authentication (`gh teacher login`)

Run once per machine or after a token rotation:

```sh
gh teacher login
```

This shells out to `gh auth login -s admin:org` and opens a browser to complete GitHub's OAuth device flow (a one-time code you enter at <https://github.com/login/device>). The `admin:org` scope is required for org-level invitations; it is **not** granted by a plain `gh auth login`. If you skip this step and have no token at all, the CLI detects the missing token and runs the login flow automatically. If a token exists but lacks `admin:org`, commands will fail with an error instructing you to run `gh teacher login` to grant the scope.

OAuth scopes requested by the teacher CLI:

| Scope | Required for |
|-------|--------------|
| `admin:org` | Sending org invitations, reading and removing org memberships |

### 3. Student authentication (`gh student login`)

Run once per student machine:

```sh
gh student login
```

Same device flow as above, but with student-appropriate scopes:

| Scope | Required for |
|-------|--------------|
| `read:org` | Checking and accepting org membership |
| `repo` | Generating private assignment repos from templates, disabling repo features, adding collaborators |

### 4. Fine-grained PAT for score collection

`gh teacher init` uploads a PAT into the `CLASSROOM50_COLLECT_TOKEN` Actions secret of your `classroom50` config repo. That PAT is what the `collect-scores.yaml` workflow uses to read releases from student repos across the org.

**Create the PAT at <https://github.com/settings/personal-access-tokens/new>** (or the equivalent page for your org-owned service account — a service account is strongly recommended so the token isn't tied to a personal account):

| Setting | Value |
|---------|-------|
| Resource owner | your teaching org |
| Repository access | All repositories, or "Only select repositories" filtered to repos matching `<classroom>-*` |
| Contents | **Read** |
| Expiry | 1–366 days (fine-grained PATs support up to 1 year); set a calendar reminder to rotate before it expires |

Supply the PAT to `gh teacher init` via the environment variable (never a flag — command-line PATs leak via shell history):

```sh
CLASSROOM50_COLLECT_TOKEN=github_pat_... gh teacher init <org>
```

Or omit it and the CLI prompts for it with hidden TTY input. The token is encrypted with libsodium sealbox before being uploaded to GitHub and is never written to disk.

To rotate an expiring token, create a new one with the same settings and run:

```sh
CLASSROOM50_COLLECT_TOKEN=github_pat_... gh teacher rotate-collect-token <org>
```

### 5. GitHub Pages (automatic, but requires Actions to run)

`gh teacher init` enables Pages programmatically via [`POST https://api.github.com/repos/{owner}/{repo}/pages`](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site) and sets visibility to public via [`PUT https://api.github.com/repos/{owner}/{repo}/pages`](https://docs.github.com/en/rest/pages/pages#update-information-about-a-github-pages-site). The Pages site is built by the `publish-pages.yaml` workflow that `init` commits into the config repo. **The first Pages deployment requires the workflow to run at least once** — either push a commit to the default branch or trigger it manually from the Actions tab. The CLI prints the expected Pages URL (`https://<org>.github.io/classroom50/`) after `init` finishes; it may take a minute to go live.

If `init` warns that the org-level workflow token policy is too restrictive (the endpoint is org-scoped and requires an org owner to change it), you can apply it yourself:

```sh
gh api -X PUT /orgs/<org>/actions/permissions/workflow \
  -f default_workflow_permissions=write \
  -f can_approve_pull_request_reviews=false
```

Similarly, if the reusable workflow access warning fires:

```sh
gh api -X PUT /repos/<org>/classroom50/actions/permissions/access \
  -f access_level=organization
```

### 6. Score collection

Scores are collected by the `collect-scores.yaml` Actions workflow in your `classroom50` config repo. It runs on a nightly cron (`17 4 * * *` UTC) automatically once `init` is done. To trigger it manually:

```sh
gh workflow run collect-scores.yaml --repo <org>/classroom50
gh workflow run collect-scores.yaml --repo <org>/classroom50 -f classroom=<short-name>   # single classroom
```

Or use the **Actions** tab on `<org>/classroom50` → `collect-scores.yaml` → **Run workflow**.

---

## GitHub REST API reference

The CLIs call the GitHub REST API through [`go-gh`](https://github.com/cli/go-gh) (`RESTClient`), which resolves paths relative to `https://api.github.com` on github.com or `https://<host>/api/v3` on GitHub Enterprise Server. The `collect_scores.py` script uses Python's `urllib` with a `Bearer` token. No Octokit, no axios, no raw `fetch()`.

### `gh teacher` CLI

| Method | URL | Purpose |
|--------|-----|---------|
| GET | [`https://api.github.com/user`](https://docs.github.com/en/rest/users/users#get-the-authenticated-user) | Verify authenticated identity (whoami) |
| GET | [`https://api.github.com/orgs/{org}`](https://docs.github.com/en/rest/orgs/orgs#get-an-organization) | Check org plan (warn if Pages from a private repo requires Team or Enterprise Cloud) |
| POST | [`https://api.github.com/orgs/{org}/repos`](https://docs.github.com/en/rest/repos/repos#create-an-organization-repository) | Create the `classroom50` config repo |
| GET | [`https://api.github.com/repos/{owner}/{repo}`](https://docs.github.com/en/rest/repos/repos#get-a-repository) | Check whether the config repo already exists |
| POST | [`https://api.github.com/repos/{owner}/{repo}/pages`](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site) | Enable GitHub Pages (workflow build source) |
| PUT | [`https://api.github.com/repos/{owner}/{repo}/pages`](https://docs.github.com/en/rest/pages/pages#update-information-about-a-github-pages-site) | Set Pages visibility to public |
| PUT | [`https://api.github.com/repos/{owner}/{repo}/branches/{branch}/protection`](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection) | Branch protection on the config repo (no force-push, no delete) |
| GET | [`https://api.github.com/repos/{owner}/{repo}/actions/permissions/workflow`](https://docs.github.com/en/rest/actions/permissions#get-default-workflow-permissions-for-a-repository) | Read current workflow token policy (detect org-enforced override) |
| PUT | [`https://api.github.com/repos/{owner}/{repo}/actions/permissions/workflow`](https://docs.github.com/en/rest/actions/permissions#set-default-workflow-permissions-for-a-repository) | Set default `GITHUB_TOKEN` to write permissions |
| PUT | [`https://api.github.com/repos/{owner}/{repo}/actions/permissions/access`](https://docs.github.com/en/rest/actions/permissions#set-the-level-of-access-for-workflows-outside-of-the-repository) | Allow reusable workflows from the same org |
| GET | [`https://api.github.com/repos/{owner}/{repo}/actions/secrets/public-key`](https://docs.github.com/en/rest/actions/secrets#get-a-repository-public-key) | Retrieve sealbox public key for encrypting the collect PAT |
| PUT | [`https://api.github.com/repos/{owner}/{repo}/actions/secrets/CLASSROOM50_COLLECT_TOKEN`](https://docs.github.com/en/rest/actions/secrets#create-or-update-a-repository-secret) | Upload the encrypted collect PAT as an Actions secret |
| GET | [`https://api.github.com/repos/{owner}/{repo}/contents/{path}`](https://docs.github.com/en/rest/repos/contents#get-repository-content) | Read existing files in the config repo (idempotency checks, skeleton probing) |
| GET | [`https://api.github.com/repos/{owner}/{repo}/git/refs/heads/{branch}`](https://docs.github.com/en/rest/git/refs#get-a-reference) | Resolve branch tip SHA before a tree commit |
| GET | [`https://api.github.com/repos/{owner}/{repo}/git/commits/{commit_sha}`](https://docs.github.com/en/rest/git/commits#get-a-commit-object) | Read parent commit metadata |
| POST | [`https://api.github.com/repos/{owner}/{repo}/git/blobs`](https://docs.github.com/en/rest/git/blobs#create-a-blob) | Upload file content as a blob (for tree commits) |
| POST | [`https://api.github.com/repos/{owner}/{repo}/git/trees`](https://docs.github.com/en/rest/git/trees#create-a-tree) | Create a new git tree |
| POST | [`https://api.github.com/repos/{owner}/{repo}/git/commits`](https://docs.github.com/en/rest/git/commits#create-a-commit) | Create a commit object |
| PATCH | [`https://api.github.com/repos/{owner}/{repo}/git/refs/heads/{branch}`](https://docs.github.com/en/rest/git/refs#update-a-reference) | Fast-forward the branch to the new commit (with rebase retry on conflict) |
| GET | [`https://api.github.com/repos/{owner}/{repo}`](https://docs.github.com/en/rest/repos/repos#get-a-repository) | Validate a template repo and read its default branch |
| GET | [`https://api.github.com/users/{username}`](https://docs.github.com/en/rest/users/users#get-a-user) | Resolve a GitHub login to its numeric account ID |
| POST | [`https://api.github.com/orgs/{org}/invitations`](https://docs.github.com/en/rest/orgs/members#create-an-organization-invitation) | Send an org membership invitation |
| GET | [`https://api.github.com/orgs/{org}/memberships/{username}`](https://docs.github.com/en/rest/orgs/members#get-an-organization-membership-for-a-user) | Check a user's org membership state |
| DELETE | [`https://api.github.com/orgs/{org}/memberships/{username}`](https://docs.github.com/en/rest/orgs/members#remove-an-organization-membership-for-a-user) | Remove a user from the org |
| PUT | [`https://api.github.com/repos/{owner}/{repo}/collaborators/{username}`](https://docs.github.com/en/rest/collaborators/collaborators#add-a-repository-collaborator) | Add a repo collaborator (direct invite) |
| DELETE | [`https://api.github.com/repos/{owner}/{repo}/collaborators/{username}`](https://docs.github.com/en/rest/collaborators/collaborators#remove-a-repository-collaborator) | Remove a repo collaborator |
| GET | [`https://api.github.com/repos/{owner}/{repo}/releases/latest`](https://docs.github.com/en/rest/releases/releases#get-the-latest-release) | Fetch the latest release for score collection or download |
| GET | [`https://api.github.com/repos/{owner}/{repo}/releases`](https://docs.github.com/en/rest/releases/releases#list-releases) | List recent releases (fallback when latest isn't a `submit/*` tag) |
| GET | [`https://api.github.com/orgs/{org}/repos`](https://docs.github.com/en/rest/repos/repos#list-organization-repositories) | Page through org repos for `--by-pattern` download mode |
| GET | [`https://api.github.com/repos/{owner}/{repo}/releases/assets/{asset_id}`](https://docs.github.com/en/rest/releases/assets#get-a-release-asset) | Download a `result.json` release asset (`Accept: application/octet-stream`) |

### `gh student` CLI

| Method | URL | Purpose |
|--------|-----|---------|
| GET | [`https://api.github.com/user`](https://docs.github.com/en/rest/users/users#get-the-authenticated-user) | Verify authenticated identity (whoami, git identity) |
| GET | [`https://api.github.com/user/memberships/orgs/{org}`](https://docs.github.com/en/rest/orgs/members#get-an-organization-membership-for-the-authenticated-user) | Check whether the student is already an org member |
| PATCH | [`https://api.github.com/user/memberships/orgs/{org}`](https://docs.github.com/en/rest/orgs/members#update-an-organization-membership-for-the-authenticated-user) | Accept a pending org invitation |
| POST | [`https://api.github.com/repos/{template_owner}/{template_repo}/generate`](https://docs.github.com/en/rest/repos/repos#create-a-repository-using-a-template) | Generate the student's assignment repo from the template |
| GET | [`https://api.github.com/repos/{owner}/{repo}`](https://docs.github.com/en/rest/repos/repos#get-a-repository) | Recover from a 422 "repository already exists" during generate |
| PATCH | [`https://api.github.com/repos/{owner}/{repo}`](https://docs.github.com/en/rest/repos/repos#update-a-repository) | Disable issues, projects, and wiki on the new repo (visibility is set to private at generation time) |
| PUT | [`https://api.github.com/repos/{owner}/{repo}/collaborators/{username}`](https://docs.github.com/en/rest/collaborators/collaborators#add-a-repository-collaborator) | Add the student as a `maintain` collaborator on their assignment repo |
| GET | [`https://api.github.com/repos/{owner}/{repo}/branches/{branch}`](https://docs.github.com/en/rest/branches/branches#get-a-branch) | Wait for the template's default branch to stabilize after generate |
| GET | [`https://api.github.com/repos/{owner}/{repo}/git/refs/heads/{branch}`](https://docs.github.com/en/rest/git/refs#get-a-reference) | Resolve branch tip SHA before a tree commit |
| GET | [`https://api.github.com/repos/{owner}/{repo}/git/commits/{commit_sha}`](https://docs.github.com/en/rest/git/commits#get-a-commit-object) | Read parent commit metadata |
| POST | [`https://api.github.com/repos/{owner}/{repo}/git/blobs`](https://docs.github.com/en/rest/git/blobs#create-a-blob) | Upload file content as blobs (used by both `accept` and `submit`) |
| POST | [`https://api.github.com/repos/{owner}/{repo}/git/trees`](https://docs.github.com/en/rest/git/trees#create-a-tree) | Create a new git tree |
| POST | [`https://api.github.com/repos/{owner}/{repo}/git/commits`](https://docs.github.com/en/rest/git/commits#create-a-commit) | Create a commit object |
| PATCH | [`https://api.github.com/repos/{owner}/{repo}/git/refs/heads/{branch}`](https://docs.github.com/en/rest/git/refs#update-a-reference) | Fast-forward the branch to the new commit |
| GET | [`https://api.github.com/repos/{owner}/{repo}/contents/{path}`](https://docs.github.com/en/rest/repos/contents#get-repository-content) | Fetch `.gitignore` and `.github/` from the template repo (`gh student submit` only) |

### `collect_scores.py` (runs inside GitHub Actions, uses `CLASSROOM50_COLLECT_TOKEN`)

| Method | URL | Purpose |
|--------|-----|---------|
| GET | [`https://api.github.com/repos/{owner}/{repo}/releases/latest`](https://docs.github.com/en/rest/releases/releases#get-the-latest-release) | Fetch the latest release for a student's assignment repo |
| GET | [`https://api.github.com/repos/{owner}/{repo}/releases`](https://docs.github.com/en/rest/releases/releases#list-releases) | List recent releases (fallback when latest isn't a `submit/*` tag) |
| GET | [`https://api.github.com/repos/{owner}/{repo}/releases/assets/{asset_id}`](https://docs.github.com/en/rest/releases/assets#get-a-release-asset) | Download the `result.json` asset from a release |

### `autograde-runner.yaml` (reusable workflow, runs in student repos)

These calls happen inside the autograde workflow on every student submission. `GH_TOKEN` is set to `${{ github.token }}` (the student repo's `GITHUB_TOKEN`).

| Method | URL | Purpose |
|--------|-----|---------|
| POST | [`https://api.github.com/repos/{owner}/{repo}/statuses/{sha}`](https://docs.github.com/en/rest/commits/statuses#create-a-commit-status) | Post a `classroom50/autograde` commit status (pending → success/failure) |

The workflow also uses `gh release` subcommands (`view`, `edit`, `upload`, `create`) against the student's repo to publish the `result.json` asset on the submission tag release.

The runner bootstrap also fetches from GitHub Pages without authentication (public by design):

| Method | URL | Purpose |
|--------|-----|---------|
| GET | `https://{org}.github.io/classroom50/{classroom}/assignments.json` | Load the classroom's assignment manifest (to look up the autograder name for this assignment) |
| GET | `https://{org}.github.io/classroom50/{classroom}/autograders/autograde.py` | Fetch the orchestrator script (fixed path; one per classroom) |
| GET | `https://{org}.github.io/classroom50/{classroom}/autograders/tests/{slug}.tar.gz` | Download the per-assignment test bundle (fetched by `autograde.py` at runtime) |

---

## GitHub Actions workflows

### Scaffolded by `gh teacher init` into each `<org>/classroom50` config repo

| File | Triggers | Purpose |
|------|----------|---------|
| `publish-pages.yaml` | Push to default branch, `workflow_dispatch` | Deploy `assignments.json`, autograder YAMLs, and test tarballs to GitHub Pages |
| `collect-scores.yaml` | `workflow_dispatch`, cron `17 4 * * *` UTC | Run `collect_scores.py`, aggregate `result.json` assets into `*/scores.json` |
| `autograde-runner.yaml` (reusable) | Called from each student's `autograde.yaml` | Bootstrap from Pages, run `autograde.py`, publish commit status and release |

---

## Environment variables and secrets summary

| Variable / Secret | Where set | Used by | Purpose |
|-------------------|-----------|---------|---------|
| `CLASSROOM50_COLLECT_TOKEN` | `gh teacher init` (Actions secret on `classroom50`) | `collect-scores.yaml`, `collect_scores.py` | Fine-grained PAT for reading student repo releases |
| `GITHUB_TOKEN` / `github.token` | Automatically injected by Actions | `autograde-runner.yaml` | Student-repo Actions token (`contents: write`, `statuses: write`) |
| `GH_TOKEN` | Set from `github.token` in runner steps | `gh api`, `gh release` inside the runner | `gh` CLI auth inside the autograde workflow |
| `GH_DEBUG=api` | Developer shell | `go-gh` (teacher & student CLIs) | Log all REST request/response traffic |
| `GITHUB_REPOSITORY_OWNER` | Actions context | `collect_scores.py` | Org name inside the collect workflow |
| `GITHUB_API_URL` | Actions context | `collect_scores.py` | API base URL (supports GitHub Enterprise Server) |
| `GH_API_URL` | Test override | `collect_scores.py` tests | Override API base in unit tests |

The teacher and student CLIs do not use `GITHUB_TOKEN` or `GH_TOKEN`. They read credentials from the `gh` auth store (typically `~/.config/gh/hosts.yml`), populated by `gh teacher login` / `gh student login`.
