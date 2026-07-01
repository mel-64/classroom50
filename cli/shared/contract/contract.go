// Package contract holds the cross-binary protocol constants shared by the
// gh-teacher and gh-student CLIs (and, by value, the Python autograde/collect
// scripts). These are the literal wire contract: repo names, schema sentinels,
// assignment modes, and the default autograder name. Keeping them in one place
// replaces the per-module copies that were previously coupled only by
// "keep in lockstep" comments — a drift here silently breaks a cross-binary
// handoff with no compile error.
//
// Values must stay byte-identical to the Python literals in
// cli/gh-teacher/skeleton/dotgithub/scripts/ (runner.py, collect_scores.py,
// materialize_tests.py) and the JSON Schemas under schemas/. There is no
// compile-time link to those: the Python skeleton_tests assert their own
// literals independently and do not import these Go constants, so Go<->Python
// agreement is a convention, not an enforced invariant. The Go half is pinned
// by contract_test.go (a change-detector that fails if any literal here drifts),
// which turns an accidental Go-side edit into a test failure even though the
// cross-language check stays manual.
package contract

const (
	// ConfigRepoName is the per-org classroom config repo. Hardcoded across
	// student repos and the collect-scores workflow — part of the public
	// contract.
	ConfigRepoName = "classroom50"

	// AssignmentsSchemaV1 is the schema sentinel for <classroom>/assignments.json.
	AssignmentsSchemaV1 = "classroom50/assignments/v1"

	// DefaultAutograderName is the universal-shim autograder name; it resolves
	// to the shim embedded in gh-student rather than a per-classroom override.
	DefaultAutograderName = "default"

	// ModeIndividual and ModeGroup are the assignment modes. Individual = one
	// repo per student; group = a shared repo teammates join.
	ModeIndividual = "individual"
	ModeGroup      = "group"

	// ResultFilename and ReleaseBodyFilename are the autograder's output
	// artifacts in the student workspace: the required result.json (the
	// grading payload collect-scores ingests) and the optional
	// release-body.md. The submit/allowed_files paths must never strip
	// them. Mirror runner.py's RESULT_FILENAME / RELEASE_BODY_FILENAME.
	ResultFilename      = "result.json"
	ReleaseBodyFilename = "release-body.md"

	// SecretPattern is the anchored regex a per-classroom capability-URL
	// secret must match: 4-64 lowercase-alphanumeric chars (a single safe URL
	// path segment for `<classroom>/<secret>/...`). Single-sourced here
	// because the rule is a cross-binary AND cross-language contract. Both Go
	// modules compile their regex from this (configrepo.SecretPattern,
	// classroomcfg secretPattern); the non-importable copies (runner.py,
	// autograde-runner.yaml, publish-pages.yaml, both schemas/, the web GUI)
	// must stay byte-identical and are pinned by contract_test.go.
	SecretPattern = "^[a-z0-9]{4,64}$"

	// SecretPatternDescription is the human-readable summary in the "invalid
	// secret" error, kept in lockstep with SecretPattern.
	SecretPatternDescription = "4-64 lowercase letters or digits ([a-z0-9])"

	// CommitPrefix marks every tool-authored commit Classroom 50 makes so a
	// teacher or student can tell them apart from their own commits in the
	// repo history. Prepended (via PrefixCommit) by every CLI commit path;
	// hand-mirrored with NO compile-time link in the web GUI
	// (web/src/util/commit.ts COMMIT_PREFIX) and the skeleton
	// collect-scores.yaml workflow, so keep all three byte-identical.
	CommitPrefix = "[Classroom 50]"
)

// requiredOAuthScopes is the unified OAuth scope set both the gh-teacher and
// gh-student CLIs request on top of gh's defaults. The two binaries request an
// identical set (issue #246) so a user who authenticates for one never has to
// re-auth for the other, and any classroom command lands the same grant.
//   - admin:org: org-membership/invite endpoints (`gh teacher invite`,
//     `gh teacher member list`, pending-invitation reads). Implies read:org.
//   - read:org:  the org-membership lookup in `gh student accept`. Kept
//     explicit for clarity and web-GUI parity even though admin:org implies it.
//   - repo:      assignment-repo creation, contents writes, collaborator
//     management.
//   - workflow:  committing .github/workflows/* via the Git Data API (both
//     `gh teacher init` and `gh student accept`); GitHub 404s that write
//     without it and gh adds it only incidentally.
//
// delete_repo is deliberately NOT here: it stays an opt-in scope for
// `gh teacher teardown` (`gh teacher login -s delete_repo`) so nobody wipes an
// org by accident. The web GUI requests a superset (adds read:user and
// delete_repo); that is intentional and separate from this CLI-parity set.
var requiredOAuthScopes = []string{"admin:org", "read:org", "repo", "workflow"}

// RequiredOAuthScopes returns the unified OAuth scope set (a fresh copy so
// callers can't mutate the shared backing array). Both CLIs' RequiredScopes()
// and their auto-login path resolve to this.
func RequiredOAuthScopes() []string {
	return append([]string(nil), requiredOAuthScopes...)
}

// PrefixCommit prepends CommitPrefix to a commit message, producing the
// canonical "[Classroom 50] <message>" form. The trailing "(gh ... )"
// provenance hint some callers add is preserved verbatim inside message.
func PrefixCommit(message string) string {
	return CommitPrefix + " " + message
}
