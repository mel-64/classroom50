package auth

import (
	"errors"

	"github.com/spf13/cobra"

	"github.com/foundation50/classroom50-cli-shared/ghauth"
	"github.com/foundation50/gh-student/internal/githubapi"
)

func NewLoginCmd() *cobra.Command {
	var scopes []string

	cmd := &cobra.Command{
		Use:   "login",
		Short: "Log in to GitHub with the scopes gh-student needs",
		Long: "Wrapper around `gh auth login` that requests the unified\n" +
			"Classroom 50 scope set on top of the gh defaults:\n" +
			"admin:org, read:org, repo, and workflow. gh-student and\n" +
			"gh-teacher request the same set so a single sign-in covers\n" +
			"both CLIs. read:org backs the org-membership lookup in\n" +
			"`gh student accept`, repo covers assignment-repo creation and\n" +
			"collaborator management, and workflow lets accept commit\n" +
			".github/workflows/autograde.yaml into the new repo.\n\n" +
			"Additional scopes can be added with -s; they are appended to the\n" +
			"login request the same way `gh auth login -s` accepts them.",
		Example: "  gh student login\n" +
			"  gh student login -s gist",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true
			if !isInteractiveTTY() {
				return errors.New("gh student login requires an interactive terminal (it shells out to gh auth login, which opens a browser)")
			}
			return ghauth.RunLogin(cmd.OutOrStdout(), cmd.ErrOrStderr(),
				ghauth.DefaultHost(), githubapi.RequiredScopes(), scopes)
		},
	}

	cmd.Flags().StringSliceVarP(&scopes, "scopes", "s", nil, "Additional scopes to request (repeatable, or comma-separated)")

	return cmd
}
