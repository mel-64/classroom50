package githubapi

import (
	"github.com/spf13/cobra"

	"github.com/foundation50/classroom50-cli-shared/contract"
	"github.com/foundation50/classroom50-cli-shared/ghauth"
)

// requiredScopes is the unified OAuth scope set shared with gh-student
// (contract.RequiredOAuthScopes, issue #246) so authenticating for one CLI
// covers the other. gh-teacher itself only needs admin:org + workflow, but the
// two binaries deliberately request an identical set. delete_repo stays opt-in
// for `gh teacher teardown`. Single source of truth for the login command and
// RequireAuthClient's auto-login.
var requiredScopes = contract.RequiredOAuthScopes()

// RequiredScopes returns the OAuth scopes gh-teacher requests beyond
// gh's defaults. Exposed for the login command, which requests the same
// set when it triggers an interactive `gh auth login`.
func RequiredScopes() []string { return append([]string(nil), requiredScopes...) }

// authOptions binds gh-teacher's scopes + command name to the shared
// auth scaffolding.
var authOptions = ghauth.Options{RequiredScopes: requiredScopes, CommandName: "gh teacher"}

// RequireAuthClient returns a REST client, auto-running `gh auth login`
// when no token is set for the default host. Thin wrapper over the
// shared auth helper, owned by githubapi because it constructs a
// go-gh client; returned as the Client seam so domain code never names
// the concrete go-gh type.
func RequireAuthClient(cmd *cobra.Command) (Client, error) {
	return ghauth.RequireClient(cmd.OutOrStdout(), cmd.ErrOrStderr(), authOptions)
}
