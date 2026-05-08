package main

import (
	"os"

	"github.com/spf13/cobra"
)

var version = "dev"

func main() {
	root := &cobra.Command{
		Use:     "gh-teacher",
		Short:   "Instructor-facing GitHub CLI extension",
		Version: version,
	}
	root.SetErrPrefix("gh-teacher:")

	root.AddCommand(whoamiCmd())
	root.AddCommand(authCmd())
	root.AddCommand(inviteCmd())
	root.AddCommand(removeCmd())
	root.AddCommand(downloadCmd())

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}
