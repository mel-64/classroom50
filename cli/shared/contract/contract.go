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

// PrefixCommit prepends CommitPrefix to a commit message, producing the
// canonical "[Classroom 50] <message>" form. The trailing "(gh ... )"
// provenance hint some callers add is preserved verbatim inside message.
func PrefixCommit(message string) string {
	return CommitPrefix + " " + message
}
