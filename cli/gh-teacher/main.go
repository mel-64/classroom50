package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var version = "dev"

func main() {
	root := &cobra.Command{
		Use:           "gh-teacher",
		Short:         "Instructor-facing GitHub CLI extension",
		Version:       version,
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	root.AddCommand(whoamiCmd())
	root.AddCommand(inviteCmd())

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "gh-teacher:", err)
		os.Exit(1)
	}
}
