package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
	"net/url"

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
			target := args[0]

			// {org}/{classroom}/{assignment}
			parts := strings.Split(target, "/")

			if len(parts) != 3 {
				return fmt.Errorf("expected target with 3 components separated by /, got %d", len(parts))
			}

			org := parts[0]
			classroom := parts[1]
			assignment := parts[2]

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
				// _, _ = fmt.Fprintf(out, "%s: %s\n", org, status.State)

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
	path := fmt.Sprintf("user/memberships/orgs/%s", org)
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

	path := fmt.Sprintf("/user/memberships/orgs/%s", org)
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

type AcceptAssignmentStatus struct {
	State      string
	StatusCode int
}

/**
 * Main function that drives the flow of accepting an assignment as a student.
 */
func acceptAssignment(client *api.RESTClient, out io.Writer, org, classroom, assignment string) error {
	// grab username, used for other things
	username, usernameErr := getAuthedUsername(client)
	if usernameErr != nil {
		return fmt.Errorf("error retrieving authed username: %w", usernameErr)
	}

	// 1) create private assignment repo
	createRepoURL, createRepoErr := createTemplatedPrivateAssignmentRepoInOrg(client, out, username, assignment, org)
	if createRepoErr != nil {
		return createRepoErr
	}

	// 2) invite username to the repo with `maintain` permission
	inviteMaintainErr := inviteUserToMaintain(client, out, username, assignment, org)
	if inviteMaintainErr != nil {
		return inviteMaintainErr
	}

	// 3) create .classroom50.yml metadata file in repo
	createYamlErr := createYamlMetadata(client, out, username, assignment, org, classroom)
	if createYamlErr != nil {
		return createYamlErr
	}

	// 4) instruct user to clone repo, or do it automatically with --clone
	// temporarily hardcoding to false
	cloneErr := promptToClone(out, createRepoURL, false)
	if cloneErr != nil {
		return cloneErr
	}

	return nil
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

type CreatePrivateRepoStatus struct {
	State      string
	StatusCode int
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
 * Returns a string for the repo itself if successfully created, else an empty string.
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

	createPath := fmt.Sprintf("repos/%s/%s/generate", org, assignment)

	var created GeneratedRepo
	if err := client.Post(createPath, bytes.NewReader(createBody), &created); err != nil {
		return "", fmt.Errorf("POST %s: %w", createPath, err)
	}

	patchBody, err := json.Marshal(map[string]any{
		"has_issues":   false,
		"has_projects": false,
		"has_wiki":     false,
	})
	if err != nil {
		return "", fmt.Errorf("patch body encode error: %w", err)
	}

	patchPath := fmt.Sprintf("repos/%s/%s", org, newRepoName)

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

func inviteUserToMaintain(client *api.RESTClient, out io.Writer, username, assignment, org string) error {
	body, err := json.Marshal(map[string]string{
		"permission": "maintain",
	})
	if err != nil {
		return fmt.Errorf("error creating PUT body: %w", err)
	}

	fullRepoName := fmt.Sprintf("%s-%s", strings.ToLower(username), strings.ToLower(assignment))
	path := fmt.Sprintf("repos/%s/%s/collaborators/%s", org, fullRepoName, username)

	if err := client.Put(path, bytes.NewReader(body), nil); err != nil {
		return fmt.Errorf("PUT %s: %w", path, err)
	}

	_, _ = fmt.Fprintf(out, "invited %s to %s/%s with maintain permission\n", username, org, fullRepoName)

	return nil
}

func escapeContentPath(path string) string {
	parts := strings.Split(path, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}
func createYamlMetadata(client *api.RESTClient, out io.Writer, username, assignment, org, classroom string) error {
	path := ".classroom50.yml"
	repoName := fmt.Sprintf("%s-%s", strings.ToLower(username), strings.ToLower(assignment))

	yamlContent := fmt.Sprintf(
		"classroom_id: %q\n"+
			"assignment_id: %q\n"+
			"source:\n"+
			"  owner: %q\n"+
			"  repo: %q\n"+
			"  branch: %q\n",
		classroom,
		assignment,
		org,
		assignment,
		"main",
	)

	encodedContent := base64.StdEncoding.EncodeToString([]byte(yamlContent))

	apiPath := fmt.Sprintf(
		"repos/%s/%s/contents/%s",
		url.PathEscape(org),
		url.PathEscape(repoName),
		escapeContentPath(path),
	)

	var existing struct {
		SHA string `json:"sha"`
	}

	getPath := fmt.Sprintf("%s?ref=%s", apiPath, "main")
	err := client.Get(getPath, &existing)
	if err != nil {
		// ignore 404 but return an error for other codes
		if httpErr, ok := errors.AsType[*api.HTTPError](err); ok {
			switch httpErr.StatusCode {
			case 404:
			default:
				return fmt.Errorf("error code when checking repo resource: %w", httpErr)
			}
		} else {
			return fmt.Errorf("error checking repo resource: %w", err)
		}
	}

	body := map[string]any{
		"message": fmt.Sprintf("create or update %s", path),
		"content": encodedContent,
		"branch":  "main",
	}

	if err == nil && existing.SHA != "" {
		body["sha"] = existing.SHA
	}

	requestBody, marshalErr := json.Marshal(body)
	if marshalErr != nil {
		return fmt.Errorf("encode upsert %s request: %w", path, marshalErr)
	}

	var putResp struct {
		Content struct {
			Path string `json:"path"`
			SHA  string `json:"sha"`
		} `json:"content"`
		Commit struct {
			SHA string `json:"sha"`
		} `json:"commit"`
	}

	if err := waitForStableBranch(client, org, repoName, "main"); err != nil {
		return err
	}
	if err := client.Put(apiPath, bytes.NewReader(requestBody), &putResp); err != nil {
		return fmt.Errorf("PUT %s: %w", apiPath, err)
	}

	_, _ = fmt.Fprintf(out, "created %s in %s/%s\n", path, org, repoName)

	return nil
}

func waitForStableBranch(client *api.RESTClient, org, repo, branch string) error {
	path := fmt.Sprintf(
		"repos/%s/%s/branches/%s",
		url.PathEscape(org),
		url.PathEscape(repo),
		url.PathEscape(branch),
	)

	var lastSHA string
	stableCount := 0

	for i := range 20 {
		var resp struct {
			Name   string `json:"name"`
			Commit struct {
				SHA string `json:"sha"`
			} `json:"commit"`
		}

		if err := client.Get(path, &resp); err != nil {
			time.Sleep(time.Duration(250*(i+1)) * time.Millisecond)
			continue
		}

		if resp.Commit.SHA != "" && resp.Commit.SHA == lastSHA {
			stableCount++
			if stableCount >= 2 {
				return nil
			}
		} else {
			lastSHA = resp.Commit.SHA
			stableCount = 0
		}

		time.Sleep(500 * time.Millisecond)
	}

	return fmt.Errorf("branch %s/%s:%s did not stabilize", org, repo, branch)
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

func promptToClone(out io.Writer, repo string, clone bool) error {
	// first off, we want to detect whether we're in a git repository first and abort
	// any potential clone if so, instead supplying an instruction on how to clone
	root, insideRepo, err := currentGitRoot()
	if err != nil {
		return err
	}

	if insideRepo {
		_, _ = fmt.Fprintf(out, "Warning: you are currently inside a Git repository:\n\n  %s\n\n", root)
		_, _ = fmt.Fprintf(out, "Clone the repository from a parent/workspace directory to avoid nesting repositories:\n\n")
		_, _ = fmt.Fprintf(out, "  git clone %s.git\n\n", repo)
	}

	// at this point, we can clone it ourselves if they passed the --clone flag
	if clone {
		cmd := exec.Command("git", "clone", repo)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin

		if err := cmd.Run(); err != nil {
			return fmt.Errorf("git clone %s: %w", repo, err)
		}

		fmt.Print("Your assignment repo has been successfully cloned!\n\n")
	} else {
		_, _ = fmt.Fprintf(out, "Your assignment repo is now ready to be cloned:\n\n")
		_, _ = fmt.Fprintf(out, "  git clone %s.git\n\n", repo)
	}

	return nil
}
