package main

import (
	"os"

	"github.com/spf13/cobra"
)

var version = "dev"

func main() {
	root := &cobra.Command{
		Use:     "gh-student",
		Short:   "Student-facing GitHub CLI extension",
		Version: version,
	}
	root.SetErrPrefix("gh-student:")

	root.AddCommand(whoamiCmd())
	root.AddCommand(authCmd())
	root.AddCommand(acceptCmd())
	root.AddCommand(inviteCmd())
	root.AddCommand(submitCmd())

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}
