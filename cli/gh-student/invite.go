package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
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
			target := args[0]
			username := args[1]

			org, repo, ok := strings.Cut(target, "/")
			if !ok || org == "" || repo == "" {
				return fmt.Errorf("invalid target %q: expected {org}/{repo}", target)
			}

			client, err := api.DefaultRESTClient()
			if err != nil {
				return fmt.Errorf("REST client: %w", err)
			}

			out := cmd.OutOrStdout()

			return inviteUserToPush(client, out, username, repo, org)
		},
	}

	return cmd
}

func inviteUserToPush(client *api.RESTClient, out io.Writer, username, repo, org string) error {
	body, err := json.Marshal(map[string]string{
		"permission": "push",
	})
	if err != nil {
		return fmt.Errorf("error creating PUT body: %w", err)
	}

	path := fmt.Sprintf("repos/%s/%s/collaborators/%s", org, repo, username)

	if err := client.Put(path, bytes.NewReader(body), nil); err != nil {
		return fmt.Errorf("PUT %s: %w", path, err)
	}

	_, _ = fmt.Fprintf(out, "invited %s to %s/%s with push permission\n", username, org, repo)

	return nil
}
