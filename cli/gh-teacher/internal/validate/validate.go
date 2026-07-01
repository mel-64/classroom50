// Package validate holds gh-teacher's identifier validators — the
// shape rules for org logins, classroom short-names, and assignment
// slugs. They are pure functions shared across nearly every command,
// with no GitHub client or domain-type dependency, so they live in
// their own seam that command and config-repo packages can import.
package validate

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// ShortNamePattern: classroom short-names and assignment slugs both
// flow into student-repo names and the contents/tree API, so both are
// validated against this rule. Exposed for the few call sites that
// match directly (e.g. slug derivation); most callers should use
// ShortName for the standard error shape.
var ShortNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,38}$`)

// ShortNamePatternDescription: human-readable summary of
// ShortNamePattern, embedded in every "invalid <thing>" error (and in
// the bespoke slug-derivation error in migrate_translate).
const ShortNamePatternDescription = "^[a-z0-9][a-z0-9-]{1,38}$ (2-39 chars, lowercase letters/digits/hyphens, starting with a letter or digit)"

// ShortName checks name against ShortNamePattern with a label-prefixed
// error (e.g. "slug", "short-name"). Same rule for classroom
// short-names and assignment slugs because both flow into student-repo
// names; also keeps traversal-style values out of the contents/tree API.
func ShortName(name, label string) error {
	if !ShortNamePattern.MatchString(name) {
		return fmt.Errorf("invalid %s %q: must match %s", label, name, ShortNamePatternDescription)
	}
	return nil
}

// orgNamePattern matches a GitHub organization login: alphanumeric
// segments joined by single hyphens, 1-39 chars, case-insensitive
// (GitHub preserves case but treats logins case-insensitively). This
// is intentionally laxer than ShortNamePattern — org names allow
// uppercase and a single leading character — so a real org like
// "CS50" or "Foundation50" validates, while traversal/garbage values
// (slashes, dots, spaces) are rejected before they reach a
// url.PathEscape'd API call and surface as a confusing mid-call 404.
var orgNamePattern = regexp.MustCompile(`^[a-zA-Z0-9](-?[a-zA-Z0-9])*$`)

const orgNamePatternDescription = "1-39 alphanumeric characters with non-consecutive internal hyphens (a GitHub organization login)"

// OrgName checks org against orgNamePattern. Catches typos upfront with
// a clear message rather than a 404 partway through a command.
func OrgName(org string) error {
	if len(org) > 39 || !orgNamePattern.MatchString(org) {
		return fmt.Errorf("invalid org %q: must be %s", org, orgNamePatternDescription)
	}
	return nil
}

// OrgClassroom trims and validates the common `<org> <classroom>`
// argument pair: both must be non-empty, the org must satisfy OrgName,
// and the classroom must satisfy ShortName. Returns the trimmed values
// or the first error.
func OrgClassroom(args []string) (org, classroom string, err error) {
	org = strings.TrimSpace(args[0])
	classroom = strings.TrimSpace(args[1])
	if org == "" {
		return "", "", errors.New("org must not be empty")
	}
	if err := OrgName(org); err != nil {
		return "", "", err
	}
	if classroom == "" {
		return "", "", errors.New("classroom short-name must not be empty")
	}
	if err := ShortName(classroom, "classroom"); err != nil {
		return "", "", err
	}
	return org, classroom, nil
}

// ScopeListContains reports whether the comma-separated OAuth scope
// list (an X-OAuth-Scopes header value) includes want.
func ScopeListContains(scopes, want string) bool {
	for _, s := range strings.Split(scopes, ",") {
		if strings.TrimSpace(s) == want {
			return true
		}
	}
	return false
}

// scopeImpliedBy maps an OAuth scope to the broader scopes that include
// it. GitHub normalizes a token's granted scopes, discarding any scope
// implicitly covered by a broader one it was granted alongside — so a
// token requested with `admin:org` and `read:org` comes back reporting
// only `admin:org` in X-OAuth-Scopes. A whole-token match for the
// narrower scope would then wrongly report it missing. Only the org
// hierarchy is listed because it's the only implication in the scopes
// gh-teacher requests; extend this if a new required scope has implied
// parents. Mirrors GitHub's documented scope hierarchy
// (admin:org -> write:org -> read:org).
var scopeImpliedBy = map[string][]string{
	"read:org":  {"admin:org", "write:org"},
	"write:org": {"admin:org"},
}

// ScopeListSatisfies reports whether the X-OAuth-Scopes list satisfies
// want, treating a broader granted scope as covering the narrower one it
// implies (per GitHub's scope normalization). Use this — not
// ScopeListContains — when checking whether a token can perform an
// operation, so a normalized header that dropped an implied scope isn't
// mistaken for a missing grant.
func ScopeListSatisfies(scopes, want string) bool {
	if ScopeListContains(scopes, want) {
		return true
	}
	for _, broader := range scopeImpliedBy[want] {
		if ScopeListContains(scopes, broader) {
			return true
		}
	}
	return false
}
