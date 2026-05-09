package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"strings"

	"github.com/cli/go-gh/v2/pkg/api"
	"github.com/spf13/cobra"
)

func acceptCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "accept {org}/{classroom}/{assignment}",
		Short:   "Accept an assignment from an organization's classroom",
		Long:    "Accept an assignment from an organization's classroom",
		Example: "  gh student accept cs50/cs50-fall-2026/assignment-0\n",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true
			target := strings.TrimSpace(args[0])

			// {org}/{classroom}/{assignment} — all three components must be present
			// and non-empty so we don't propagate empty strings into API paths or
			// .classroom50.yml metadata.
			parts := strings.Split(target, "/")
			if len(parts) != 3 {
				return fmt.Errorf("expected target {org}/{classroom}/{assignment} with 3 components separated by /, got %d", len(parts))
			}
			org := strings.TrimSpace(parts[0])
			classroom := strings.TrimSpace(parts[1])
			assignment := strings.TrimSpace(parts[2])
			if org == "" || classroom == "" || assignment == "" {
				return fmt.Errorf("invalid target %q: org/classroom/assignment must all be non-empty", target)
			}

			client, err := api.DefaultRESTClient()
			if err != nil {
				return fmt.Errorf("REST client: %w", err)
			}

			out := cmd.OutOrStdout()

			// we want to check whether the user is not part of the org (404),
			// or whether they already are (200) or pending
			status, err := checkOrgStatus(client, org)
			if err != nil {
				return err
			}

			switch status.StatusCode {
			// part of the org or invited (200)
			case http.StatusOK:
				// if pending invite, we want to auto accept; else, carry on to accept assignment
				if status.State == "pending" {
					acceptStatus, err := acceptOrgInvite(client, org)
					if err != nil {
						return err
					}

					switch acceptStatus.StatusCode {
					// accepted without errors (200)
					case http.StatusOK:
						// we're safe to accept the assignment now
						return acceptAssignment(client, out, org, classroom, assignment)
					// invitation not found (404)
					case http.StatusNotFound:
						return fmt.Errorf("%s: no membership found for accept", org)
					// forbidden, blocked (403)
					case http.StatusForbidden:
						return fmt.Errorf("%s: blocked from accepting invite", org)
					// spam block (422)
					case http.StatusUnprocessableEntity:
						return fmt.Errorf("%s: spam detection (422) triggered for accept", org)
					// any codes we haven't considered
					default:
						return fmt.Errorf("%s: unknown accept status received (%d)", org, acceptStatus.StatusCode)
					}
				}

			// not part of the org (404)
			case http.StatusNotFound:
				return fmt.Errorf("%s: no membership found", org)

			// blocked by org (403)
			case http.StatusForbidden:
				return fmt.Errorf("%s: forbidden", org)

			// no other returns documented by API, but just in case
			default:
				return fmt.Errorf("%s: unknown status received (%d)", org, status.StatusCode)
			}

			return acceptAssignment(client, out, org, classroom, assignment)
		},
	}

	return cmd
}

type OrgStatus struct {
	State      string
	StatusCode int
}

/**
 * Returns the status of the authed user's membership of a given organization.
 * Returns { State: string, StatusCode: int } to also carry HTTP result info.
 */
func checkOrgStatus(client *api.RESTClient, org string) (OrgStatus, error) {
	path := fmt.Sprintf("user/memberships/orgs/%s", url.PathEscape(org))
	var resp struct {
		State string `json:"state"`
	}
	if err := client.Get(path, &resp); err != nil {
		if httpErr, ok := errors.AsType[*api.HTTPError](err); ok {
			return OrgStatus{
				StatusCode: httpErr.StatusCode,
			}, nil
		}

		return OrgStatus{}, fmt.Errorf("GET %s: %w", path, err)
	}

	return OrgStatus{
		State:      resp.State,
		StatusCode: http.StatusOK,
	}, nil
}

type AcceptStatus struct {
	State      string
	StatusCode int
}

/**
 * Accepts an invitation to a GitHub organization, assuming the authed user has a
 * pending invite already. Done via a PATCH call to setting "status": "active" on
 * their membership of said org.
 */
func acceptOrgInvite(client *api.RESTClient, org string) (AcceptStatus, error) {
	body, err := json.Marshal(map[string]string{"state": "active"})
	if err != nil {
		return AcceptStatus{}, fmt.Errorf("encode body: %w", err)
	}

	path := fmt.Sprintf("user/memberships/orgs/%s", url.PathEscape(org))
	var resp struct {
		State string `json:"state"`
	}
	if err := client.Patch(path, bytes.NewReader(body), &resp); err != nil {
		if httpErr, ok := errors.AsType[*api.HTTPError](err); ok {
			return AcceptStatus{
				StatusCode: httpErr.StatusCode,
			}, nil
		}

		return AcceptStatus{}, fmt.Errorf("PATCH %s: %w", path, err)
	}

	return AcceptStatus{
		State:      resp.State,
		StatusCode: http.StatusOK,
	}, nil
}

func acceptAssignment(client *api.RESTClient, out io.Writer, org, classroom, assignment string) error {
	// grab username, used for other things
	username, err := getAuthedUsername(client)
	if err != nil {
		return fmt.Errorf("retrieving authed username: %w", err)
	}

	// Look up the template's default branch so .classroom50.yml records the
	// branch the template actually publishes from (templates using master or
	// develop would otherwise silently round-trip "main" through submit).
	sourceBranch, err := lookupRepoDefaultBranch(client, org, assignment)
	if err != nil {
		return err
	}

	// 1) create private assignment repo (idempotent: a 422 already-exists from
	//    a partial prior run is treated as resume, not failure)
	createRepoURL, err := createTemplatedPrivateAssignmentRepoInOrg(client, out, username, assignment, org)
	if err != nil {
		return err
	}

	// 2) invite username to the repo with `maintain` permission. PUT collaborators
	//    is upsert in the GitHub API, so this also serves as the spec's step 4
	//    downgrade from the creator-default `admin` to `maintain` in a single call.
	if err := inviteUserToMaintain(client, out, username, assignment, org); err != nil {
		return err
	}

	// 3) create .classroom50.yml metadata file in repo
	repoName := fmt.Sprintf("%s-%s", strings.ToLower(username), strings.ToLower(assignment))
	cfg := ClassroomConfig{
		ClassroomID:  classroom,
		AssignmentID: assignment,
		Source: ClassroomSource{
			Owner:  org,
			Repo:   assignment,
			Branch: sourceBranch,
		},
	}
	if err := WriteClassroomMetadata(client, org, repoName, sourceBranch, cfg); err != nil {
		return err
	}
	// "wrote" instead of "created": WriteClassroomMetadata upserts via
	// GET-for-SHA → PUT, so re-runs update an existing file in place.
	_, _ = fmt.Fprintf(out, "wrote %s in %s/%s\n", ClassroomMetadataPath, org, repoName)

	// 4) tell the user how to clone their new repo (and warn them off if they're
	//    currently inside a git repo, to avoid accidental nesting)
	if err := promptToClone(out, createRepoURL); err != nil {
		return err
	}

	return nil
}

/**
 * Returns the default branch of a repo (e.g. "main", "master", "develop"), used
 * to record source.branch in .classroom50.yml so the round-trip through `gh
 * student submit` fetches from the right place regardless of template defaults.
 */
func lookupRepoDefaultBranch(client *api.RESTClient, org, repo string) (string, error) {
	path := fmt.Sprintf("repos/%s/%s", url.PathEscape(org), url.PathEscape(repo))
	var info struct {
		DefaultBranch string `json:"default_branch"`
	}
	if err := client.Get(path, &info); err != nil {
		return "", fmt.Errorf("GET %s: %w", path, err)
	}
	if info.DefaultBranch == "" {
		// API contract guarantees a default_branch; defend anyway so a malformed
		// response doesn't propagate an empty string into the YAML.
		return "main", nil
	}
	return info.DefaultBranch, nil
}

type AuthenticatedUser struct {
	Login string `json:"login"`
}

func getAuthedUsername(client *api.RESTClient) (string, error) {
	var user AuthenticatedUser

	if err := client.Get("user", &user); err != nil {
		return "", fmt.Errorf("GET /user: %w", err)
	}

	return user.Login, nil
}

type GeneratedRepo struct {
	Name     string `json:"name"`
	FullName string `json:"full_name"`
	HTMLURL  string `json:"html_url"`
	Private  bool   `json:"private"`

	HasIssues   bool `json:"has_issues"`
	HasProjects bool `json:"has_projects"`
	HasWiki     bool `json:"has_wiki"`
}

/**
 * Creates private repo called {username}-{assignment}, canonicalized as lowercase, in {org}
 * using the assignment's repo template, per
 * https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10#create-a-repository-using-a-template
 * Disable issues, projects, and wiki by default.
 *
 * Idempotent on retry: if the repo already exists from a partial prior run
 * (HTTP 422 on /generate), GET it instead and continue. The PATCH that disables
 * issues/projects/wiki is itself idempotent.
 *
 * Returns the new repo's HTMLURL on success.
 */
func createTemplatedPrivateAssignmentRepoInOrg(client *api.RESTClient, out io.Writer, username, assignment, org string) (string, error) {
	newRepoName := fmt.Sprintf("%s-%s", strings.ToLower(username), strings.ToLower(assignment))
	createBody, err := json.Marshal(map[string]any{
		"owner":   org,
		"name":    newRepoName,
		"private": true,
	})

	if err != nil {
		return "", fmt.Errorf("error encoding json for template: %w", err)
	}

	createPath := fmt.Sprintf("repos/%s/%s/generate", url.PathEscape(org), url.PathEscape(assignment))

	var created GeneratedRepo
	if err := client.Post(createPath, bytes.NewReader(createBody), &created); err != nil {
		// 422 means the target repo already exists (typically from a previous
		// partial run that failed before step 2/3 completed). GET it so re-runs
		// can resume from the next step rather than aborting.
		if httpErr, ok := errors.AsType[*api.HTTPError](err); ok && httpErr.StatusCode == http.StatusUnprocessableEntity {
			getPath := fmt.Sprintf("repos/%s/%s", url.PathEscape(org), url.PathEscape(newRepoName))
			if getErr := client.Get(getPath, &created); getErr != nil {
				return "", fmt.Errorf("POST %s returned 422 and follow-up GET %s failed: %w", createPath, getPath, getErr)
			}
			_, _ = fmt.Fprintf(out, "private repo %s already exists, resuming setup\n", created.FullName)
		} else {
			return "", fmt.Errorf("POST %s: %w", createPath, err)
		}
	}

	patchBody, err := json.Marshal(map[string]any{
		"has_issues":   false,
		"has_projects": false,
		"has_wiki":     false,
	})
	if err != nil {
		return "", fmt.Errorf("patch body encode error: %w", err)
	}

	patchPath := fmt.Sprintf("repos/%s/%s", url.PathEscape(org), url.PathEscape(newRepoName))

	var updated GeneratedRepo
	if err := client.Patch(patchPath, bytes.NewReader(patchBody), &updated); err != nil {
		return "", fmt.Errorf("created %s/%s, but failed to disable issues/projects/wiki: %w", org, newRepoName, err)
	}

	_, _ = fmt.Fprintf(
		out,
		"created private repo %s, with issues/projects/wiki disabled: %s\n",
		updated.FullName,
		updated.HTMLURL,
	)

	return updated.HTMLURL, nil
}

/**
 * Invites the user to their own assignment repo with `maintain` permission.
 *
 * GitHub treats PUT /repos/{owner}/{repo}/collaborators/{username} as upsert,
 * so a single call also satisfies the spec's step 4 (downgrade from the
 * creator-default `admin` to `maintain`) without a separate re-add.
 */
func inviteUserToMaintain(client *api.RESTClient, out io.Writer, username, assignment, org string) error {
	body, err := json.Marshal(map[string]string{
		"permission": "maintain",
	})
	if err != nil {
		return fmt.Errorf("error creating PUT body: %w", err)
	}

	fullRepoName := fmt.Sprintf("%s-%s", strings.ToLower(username), strings.ToLower(assignment))
	path := fmt.Sprintf("repos/%s/%s/collaborators/%s",
		url.PathEscape(org), url.PathEscape(fullRepoName), url.PathEscape(username))

	if err := client.Put(path, bytes.NewReader(body), nil); err != nil {
		return fmt.Errorf("PUT %s: %w", path, err)
	}

	_, _ = fmt.Fprintf(out, "invited %s to %s/%s with maintain permission\n", username, org, fullRepoName)

	return nil
}

func currentGitRoot() (string, bool, error) {
	cmd := exec.Command("git", "rev-parse", "--show-toplevel")

	out, err := cmd.Output()
	if err != nil {
		if _, ok := errors.AsType[*exec.ExitError](err); ok {
			// not inside a git tree
			return "", false, nil
		}

		// something else went wrong, like git not being installed
		return "", false, fmt.Errorf("check git repository: %w", err)
	}

	return strings.TrimSpace(string(out)), true, nil
}

/**
 * Tells the user how to clone the just-created assignment repo. If the user is
 * already inside a git repo, warns them so they don't accidentally nest one
 * checkout inside another. Cloning is intentionally not done in-process: the
 * student picks where it lives on their disk.
 */
func promptToClone(out io.Writer, repo string) error {
	root, insideRepo, err := currentGitRoot()
	if err != nil {
		return err
	}

	if insideRepo {
		_, _ = fmt.Fprintf(out, "Warning: you are currently inside a Git repository:\n\n  %s\n\n", root)
		_, _ = fmt.Fprintf(out, "Clone the repository from a parent/workspace directory to avoid nesting repositories:\n\n")
	} else {
		_, _ = fmt.Fprintf(out, "Your assignment repo is now ready to be cloned:\n\n")
	}
	_, _ = fmt.Fprintf(out, "  git clone %s.git\n\n", repo)

	return nil
}
