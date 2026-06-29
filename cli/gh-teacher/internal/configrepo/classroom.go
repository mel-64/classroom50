package configrepo

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/foundation50/gh-teacher/internal/githubapi"
)

// ClassroomJSON is the typed shape of a classroom's classroom.json
// metadata record. assignments.json's typed shape lives elsewhere (the
// assignment domain). MigratedFrom omits cleanly when absent.
type ClassroomJSON struct {
	Schema    string `json:"schema"`
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
	Term      string `json:"term"`
	Org       string `json:"org"`
	// Secret is the optional capability-URL path segment. When set,
	// publish-pages serves this classroom's resources under
	// `<classroom>/<secret>/...` (every consumer inserts it); empty = the
	// plain path. Opt-in per classroom, so omitted on unprotected classrooms.
	Secret string `json:"secret,omitempty"`
	// Team is the per-classroom GitHub team that grants rostered
	// students read on private, org-owned assignment templates.
	// Populated by `classroom add`; omitted on classrooms created
	// before this feature.
	Team *TeamRef `json:"team,omitempty"`
	// Active is the classroom/v1 lifecycle flag: `false` = archived,
	// `true` or ABSENT = active. A *pointer so "archived" stays distinct
	// from "legacy classroom that never wrote the key" (both nil/true =
	// active), and omitempty so it's stamped only when a teacher toggles
	// archive/unarchive. Mirrors the web's `active === false` archival check.
	Active       *bool            `json:"active,omitempty"`
	MigratedFrom *MigratedFromRef `json:"migrated_from,omitempty"`

	// Extra holds unknown top-level keys, re-emitted verbatim so the
	// archive/unarchive/edit read-modify-write never drops a field a newer
	// binary/web GUI added ("tolerate AND preserve", mirroring
	// AssignmentEntry.Extra). Merged in/out by the custom (Un)MarshalJSON
	// below, so it never appears as a literal "extra" key on the wire.
	Extra map[string]json.RawMessage `json:"-"`
}

// knownClassroomKeys is the top-level classroom.json keys this binary
// understands; any other key is diverted to Extra. Keep in lockstep with
// the json tags on ClassroomJSON above.
var knownClassroomKeys = map[string]struct{}{
	"schema": {}, "name": {}, "short_name": {}, "term": {}, "org": {},
	"secret": {}, "team": {}, "active": {}, "migrated_from": {},
}

// UnmarshalJSON captures unknown top-level keys into Extra, then decodes
// the known subset into the typed fields.
func (c *ClassroomJSON) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	known := make(map[string]json.RawMessage, len(raw))
	var extra map[string]json.RawMessage
	for k, v := range raw {
		if _, ok := knownClassroomKeys[k]; ok {
			known[k] = v
			continue
		}
		if extra == nil {
			extra = make(map[string]json.RawMessage)
		}
		extra[k] = v
	}

	knownBytes, err := json.Marshal(known)
	if err != nil {
		return err
	}
	type classroomAlias ClassroomJSON // avoid recursion into this method
	var typed classroomAlias
	if err := json.Unmarshal(knownBytes, &typed); err != nil {
		return err
	}
	*c = ClassroomJSON(typed)
	c.Extra = extra
	return nil
}

// MarshalJSON emits the known fields via the alias, then byte-splices any
// sorted Extra keys in before the closing brace. The splice (vs a map
// round-trip) preserves the known fields' struct order so adding Extra
// doesn't reorder existing classroom.json on the next write.
func (c ClassroomJSON) MarshalJSON() ([]byte, error) {
	type classroomAlias ClassroomJSON
	known, err := json.Marshal(classroomAlias(c))
	if err != nil {
		return nil, err
	}
	if len(c.Extra) == 0 {
		return known, nil
	}
	keys := make([]string, 0, len(c.Extra))
	for k := range c.Extra {
		if _, isKnown := knownClassroomKeys[k]; isKnown {
			continue // defensive: never let Extra override a known field
		}
		keys = append(keys, k)
	}
	if len(keys) == 0 {
		return known, nil
	}
	sort.Strings(keys) // deterministic output

	// Splice the Extra members in before `known`'s closing brace. The alias
	// always emits schema/name/short_name/term/org (no omitempty), so
	// `known` is never "{}" and the leading comma is always correct.
	var buf bytes.Buffer
	trimmed := bytes.TrimSpace(known)
	buf.Write(trimmed[:len(trimmed)-1]) // everything up to the final '}'
	for _, k := range keys {
		buf.WriteByte(',')
		keyJSON, err := json.Marshal(k)
		if err != nil {
			return nil, err
		}
		buf.Write(keyJSON)
		buf.WriteByte(':')
		buf.Write(c.Extra[k])
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// IsArchived reports whether a classroom is archived: `active` present and
// false. Absent (legacy) or explicit true both read as active. Mirrors the
// web's `isClassroomArchived(cl) = cl.active === false`.
func (c *ClassroomJSON) IsArchived() bool {
	return c != nil && c.Active != nil && !*c.Active
}

// MigratedFromRef records where a classroom originated when it was
// imported by `gh teacher classroom migrate`. Hand-authored classrooms
// never carry this block.
type MigratedFromRef struct {
	Source           string `json:"source"`
	ClassroomID      int64  `json:"classroom_id"`
	OriginalName     string `json:"original_name"`
	OriginalOrgLogin string `json:"original_org_login"`
	URL              string `json:"url,omitempty"`
	MigratedAt       string `json:"migrated_at"`
}

// ClassroomFilePath: on-repo path to a classroom's classroom.json.
func ClassroomFilePath(shortName string) string {
	return shortName + "/classroom.json"
}

// LoadClassroom reads + parses <short-name>/classroom.json at ref.
// Missing file → (nil, false, nil) so callers shape their own
// "not found" message.
func LoadClassroom(client githubapi.Client, org, shortName, ref string) (*ClassroomJSON, bool, error) {
	path := ClassroomFilePath(shortName)
	data, ok, err := ReadFileContents(client, org, ConfigRepoName, path, ref)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}
	var c ClassroomJSON
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, false, fmt.Errorf("%s/%s/%s: %w", org, ConfigRepoName, path, err)
	}
	return &c, true, nil
}
