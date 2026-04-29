package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/cli/go-gh/v2/pkg/api"
	"github.com/spf13/cobra"
)

func inviteCmd() *cobra.Command {
	var (
		admin bool
		quiet bool
	)

	cmd := &cobra.Command{
		Use:   "invite <target> <username>",
		Short: "Invite a user to an organization or repository",
		Long: "Invite a GitHub user to an organization or to a specific repository.\n\n" +
			"If TARGET contains a slash it is treated as OWNER/REPO and the user is added as a\n" +
			"repository collaborator with push permission. Otherwise TARGET is an organization\n" +
			"and the user is invited as a member, or as an admin when --admin is set.\n\n" +
			"Both endpoints are idempotent: re-inviting an existing member or collaborator\n" +
			"is a no-op.",
		Example: "  gh teacher invite cs50-fall-2026 alice\n" +
			"  gh teacher invite --admin cs50-fall-2026 alice\n" +
			"  gh teacher invite cs50-fall-2026/hello alice",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true
			target, username := args[0], args[1]

			client, err := api.DefaultRESTClient()
			if err != nil {
				return fmt.Errorf("REST client: %w", err)
			}

			out := cmd.OutOrStdout()

			if strings.Contains(target, "/") {
				if admin {
					return errors.New("--admin is only valid for organization invitations")
				}
				return inviteToRepo(client, out, target, username, quiet)
			}

			role := "member"
			if admin {
				role = "admin"
			}
			return inviteToOrg(client, out, target, username, role, quiet)
		},
	}

	cmd.Flags().BoolVar(&admin, "admin", false, "Invite as organization admin (org targets only)")
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Suppress success output (errors still go to stderr)")

	return cmd
}

func inviteToOrg(client *api.RESTClient, out io.Writer, org, username, role string, quiet bool) error {
	body, err := json.Marshal(map[string]string{"role": role})
	if err != nil {
		return fmt.Errorf("encode body: %w", err)
	}

	path := fmt.Sprintf("orgs/%s/memberships/%s", org, username)
	var resp struct {
		State string `json:"state"`
		Role  string `json:"role"`
	}
	if err := client.Put(path, bytes.NewReader(body), &resp); err != nil {
		return fmt.Errorf("PUT %s: %w", path, err)
	}

	if !quiet {
		_, _ = fmt.Fprintf(out, "%s: invited %s as %s (%s)\n", org, username, resp.Role, resp.State)
	}
	return nil
}

func inviteToRepo(client *api.RESTClient, out io.Writer, repo, username string, quiet bool) error {
	body, err := json.Marshal(map[string]string{"permission": "push"})
	if err != nil {
		return fmt.Errorf("encode body: %w", err)
	}

	path := fmt.Sprintf("repos/%s/collaborators/%s", repo, username)
	if err := client.Put(path, bytes.NewReader(body), nil); err != nil {
		return fmt.Errorf("PUT %s: %w", path, err)
	}

	if !quiet {
		_, _ = fmt.Fprintf(out, "%s: invited %s\n", repo, username)
	}
	return nil
}
