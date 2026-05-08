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
		Short: "Refresh gh authentication with student-level scopes",
		Long:  "Wrapper around `gh auth refresh`",
		Example: "  gh student auth\n" +
			"  gh student auth -s repo,read:org\n",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true

			ghArgs := []string{"auth", "refresh", "-s", "read:org", "-s", "repo"}

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
