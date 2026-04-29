package main

import (
	"fmt"

	"github.com/cli/go-gh/v2/pkg/api"
	"github.com/spf13/cobra"
)

func whoamiCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "Print the authenticated GitHub user",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			client, err := api.DefaultRESTClient()
			if err != nil {
				return fmt.Errorf("REST client: %w", err)
			}
			var user struct {
				Login string `json:"login"`
			}
			if err := client.Get("user", &user); err != nil {
				return fmt.Errorf("GET /user: %w", err)
			}
			_, _ = fmt.Fprintln(cmd.OutOrStdout(), user.Login)
			return nil
		},
	}
}
