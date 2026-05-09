package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"

	"github.com/cli/go-gh/v2/pkg/api"
	"github.com/spf13/cobra"
)

func inviteCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "invite {org}/{repo} {username}",
		Short:   "Invite a user by username to be able to push to a repository.",
		Long:    "Invite a user by username to be able to push to a repository.",
		Example: "  gh student invite cs50/bob-assignment-0 cs50-duck\n",
		Args:    cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true
			target := strings.TrimSpace(args[0])
			username := strings.TrimSpace(args[1])
			if target == "" {
				return errors.New("target must not be empty")
			}
			if username == "" {
				return errors.New("username must not be empty")
			}

			// {org}/{repo}: exactly two non-empty components.
			parts := strings.SplitN(target, "/", 3)
			if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
				return fmt.Errorf("invalid target %q: expected {org}/{repo}", target)
			}
			org, repo := parts[0], parts[1]

			client, err := api.DefaultRESTClient()
			if err != nil {
				return fmt.Errorf("REST client: %w", err)
			}

			out := cmd.OutOrStdout()

			return inviteUserToPush(client, out, org, repo, username)
		},
	}

	return cmd
}

// inviteUserToPush adds username as a push-level collaborator on org/repo.
func inviteUserToPush(client *api.RESTClient, out io.Writer, org, repo, username string) error {
	body, err := json.Marshal(map[string]string{
		"permission": "push",
	})
	if err != nil {
		return fmt.Errorf("error creating PUT body: %w", err)
	}

	path := fmt.Sprintf("repos/%s/%s/collaborators/%s",
		url.PathEscape(org), url.PathEscape(repo), url.PathEscape(username))

	if err := client.Put(path, bytes.NewReader(body), nil); err != nil {
		return fmt.Errorf("PUT %s: %w", path, err)
	}

	_, _ = fmt.Fprintf(out, "invited %s to %s/%s with push permission\n", username, org, repo)

	return nil
}
