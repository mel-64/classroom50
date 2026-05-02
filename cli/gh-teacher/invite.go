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
			"and the user is invited as a direct member, or as an admin when --admin is set.\n\n" +
			"Repository invitations are idempotent. Organization invitations are not: GitHub\n" +
			"rejects re-invites to a pending or existing member.",
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

			role := "direct_member"
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
	userID, err := lookupUserID(client, username)
	if err != nil {
		return err
	}

	body, err := json.Marshal(map[string]any{
		"invitee_id": userID,
		"role":       role,
	})
	if err != nil {
		return fmt.Errorf("encode body: %w", err)
	}

	path := fmt.Sprintf("orgs/%s/invitations", org)
	if err := client.Post(path, bytes.NewReader(body), nil); err != nil {
		return fmt.Errorf("POST %s: %w", path, err)
	}

	if !quiet {
		_, _ = fmt.Fprintf(out, "%s: invited %s as %s\n", org, username, role)
		_, _ = fmt.Fprintf(out, "%s must visit https://github.com/%s to accept the invitation.\n", username, org)
	}
	return nil
}

func lookupUserID(client *api.RESTClient, username string) (int64, error) {
	path := fmt.Sprintf("users/%s", username)
	var user struct {
		ID int64 `json:"id"`
	}
	if err := client.Get(path, &user); err != nil {
		return 0, fmt.Errorf("GET %s: %w", path, err)
	}
	return user.ID, nil
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
