// Commit-message prefix for every tool-authored commit the GUI makes, so a
// teacher or student can tell them apart from their own commits in the repo
// history. Kept byte-identical with the CLI's cli/shared/contract
// (contract.CommitPrefix / contract.PrefixCommit) and the skeleton
// collect-scores.yaml workflow — there is no compile-time link across the
// three, so update every copy in lockstep on change.

export const COMMIT_PREFIX = "[Classroom 50]"

// prefixCommit prepends COMMIT_PREFIX to a commit message, producing the
// canonical "[Classroom 50] <message>" form. Any trailing "(gh ... )"
// provenance hint a caller includes is preserved verbatim inside message.
export function prefixCommit(message: string): string {
  return `${COMMIT_PREFIX} ${message}`
}
