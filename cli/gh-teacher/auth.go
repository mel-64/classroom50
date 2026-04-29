package main

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/spf13/cobra"
)

func authCmd() *cobra.Command {
	var scopes []string

	cmd := &cobra.Command{
		Use:   "auth",
		Short: "Refresh gh authentication with teacher-level scopes",
		Long: "Wrapper around `gh auth refresh` that always requests the admin:org scope.\n\n" +
			"The admin:org scope is required by GitHub's organization-membership endpoints\n" +
			"(used by `gh teacher invite ORG USER`) and is not part of the default scope set\n" +
			"granted by `gh auth login`.\n\n" +
			"Additional scopes can be added with -s; they are appended to the request the\n" +
			"same way `gh auth refresh -s` accepts them.",
		Example: "  gh teacher auth\n" +
			"  gh teacher auth -s read:user\n" +
			"  gh teacher auth -s read:user,delete_repo",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			ghArgs := []string{"auth", "refresh", "-s", "admin:org"}
			for _, s := range scopes {
				ghArgs = append(ghArgs, "-s", s)
			}

			sub := exec.Command("gh", ghArgs...)
			sub.Stdin = os.Stdin
			sub.Stdout = cmd.OutOrStdout()
			sub.Stderr = cmd.ErrOrStderr()

			if err := sub.Run(); err != nil {
				return fmt.Errorf("gh %v: %w", ghArgs, err)
			}
			return nil
		},
	}

	cmd.Flags().StringSliceVarP(&scopes, "scopes", "s", nil, "Additional scopes to request (repeatable, or comma-separated)")

	return cmd
}
