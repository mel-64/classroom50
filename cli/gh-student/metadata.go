package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/cli/go-gh/v2/pkg/api"
	"gopkg.in/yaml.v3"
)

// ClassroomMetadataPath is the in-repo path of the per-assignment metadata
// file written by `gh student accept` and read back by `gh student submit`.
const ClassroomMetadataPath = ".classroom50.yml"

// ClassroomConfig is the on-disk shape of .classroom50.yml. Add new fields
// here and they'll round-trip through both the writer (marshalQuotedYAML,
// which forces double-quoted scalars on string values) and the reader
// (yaml.Unmarshal in submit.go) without further plumbing.
type ClassroomConfig struct {
	ClassroomID  string          `yaml:"classroom_id"`
	AssignmentID string          `yaml:"assignment_id"`
	Source       ClassroomSource `yaml:"source"`
}

// ClassroomSource records where the assignment's instructor files (.gitignore
// and .github/) come from. `gh student submit` reads these to fetch the
// latest instructor files at submission time.
type ClassroomSource struct {
	Owner  string `yaml:"owner"`
	Repo   string `yaml:"repo"`
	Branch string `yaml:"branch"`
}

// WriteClassroomMetadata serializes cfg as YAML and uploads it to
// <owner>/<repo>:<branch> at .classroom50.yml via the GitHub contents API.
//
// Idempotent: GETs the existing file's SHA first when present so re-runs
// update in place rather than failing. Waits for the branch to be reachable
// before reading, since freshly-generated repos take a moment to stabilize.
//
// This is the single seam between the accept workflow and the metadata
// store. Replacing this with a remote metadata source means swapping the
// body of this function — call sites build a ClassroomConfig and pass it,
// without knowing how it's persisted.
func WriteClassroomMetadata(client *api.RESTClient, owner, repo, branch string, cfg ClassroomConfig) error {
	yamlBytes, err := marshalQuotedYAML(cfg)
	if err != nil {
		return fmt.Errorf("marshal classroom metadata: %w", err)
	}
	encoded := base64.StdEncoding.EncodeToString(yamlBytes)

	apiPath := fmt.Sprintf(
		"repos/%s/%s/contents/%s",
		url.PathEscape(owner),
		url.PathEscape(repo),
		escapeContentPath(ClassroomMetadataPath),
	)

	// Wait for the branch to become reachable BEFORE asking about an existing
	// file: a freshly-generated repo briefly returns 409 "Git Repository is
	// empty" from the contents API while replication completes, and that 409
	// is indistinguishable from a real conflict.
	if err := waitForStableBranch(client, owner, repo, branch); err != nil {
		return err
	}

	sha, err := existingMetadataSHA(client, apiPath, branch)
	if err != nil {
		return err
	}

	body := map[string]any{
		"message": fmt.Sprintf("create or update %s", ClassroomMetadataPath),
		"content": encoded,
		"branch":  branch,
	}
	if sha != "" {
		body["sha"] = sha
	}

	requestBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("encode upsert %s: %w", ClassroomMetadataPath, err)
	}
	if err := client.Put(apiPath, bytes.NewReader(requestBody), nil); err != nil {
		return fmt.Errorf("PUT %s: %w", apiPath, err)
	}
	return nil
}

// existingMetadataSHA returns the SHA of the metadata file at apiPath@branch
// if it exists. A 404 (file not yet created) or 409 (repo still replicating)
// yields an empty SHA with no error so the caller can do a create-as-PUT.
func existingMetadataSHA(client *api.RESTClient, apiPath, branch string) (string, error) {
	getPath := fmt.Sprintf("%s?ref=%s", apiPath, url.QueryEscape(branch))
	var existing struct {
		SHA string `json:"sha"`
	}
	if err := client.Get(getPath, &existing); err != nil {
		if httpErr, ok := errors.AsType[*api.HTTPError](err); ok {
			if httpErr.StatusCode == http.StatusNotFound || httpErr.StatusCode == http.StatusConflict {
				return "", nil
			}
		}
		return "", fmt.Errorf("GET %s: %w", getPath, err)
	}
	return existing.SHA, nil
}

// waitForStableBranch polls the branches API until two consecutive successful
// reads return the same non-empty commit SHA, or returns an error after a
// bounded number of attempts. Used to absorb the brief window after a
// template-generated repo is created during which the contents API can't yet
// find its branch.
func waitForStableBranch(client *api.RESTClient, owner, repo, branch string) error {
	path := fmt.Sprintf(
		"repos/%s/%s/branches/%s",
		url.PathEscape(owner),
		url.PathEscape(repo),
		url.PathEscape(branch),
	)

	var lastSHA string

	for i := range 20 {
		var resp struct {
			Name   string `json:"name"`
			Commit struct {
				SHA string `json:"sha"`
			} `json:"commit"`
		}

		if err := client.Get(path, &resp); err != nil {
			// Transient error breaks the consecutive-reads chain — drop the
			// baseline so we require a fresh pair of successful reads.
			lastSHA = ""
			time.Sleep(time.Duration(250*(i+1)) * time.Millisecond)
			continue
		}

		if resp.Commit.SHA == "" {
			// Branch reachable but no commit reported; treat like a transient
			// error and drop the baseline.
			lastSHA = ""
			time.Sleep(500 * time.Millisecond)
			continue
		}

		if resp.Commit.SHA == lastSHA {
			return nil
		}
		lastSHA = resp.Commit.SHA
		time.Sleep(500 * time.Millisecond)
	}

	return fmt.Errorf("branch %s/%s:%s did not stabilize", owner, repo, branch)
}

// escapeContentPath URL-encodes each segment of a contents-API path
// individually, preserving the slashes between segments. Shared with
// submit.go's fetchRepoPath.
func escapeContentPath(path string) string {
	parts := strings.Split(path, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

// marshalQuotedYAML serializes v as YAML with all string values rendered as
// double-quoted scalars (keys and non-string scalars pass through unchanged)
// and 2-space indentation. Matches the format .classroom50.yml had before
// the helper extraction, and defends against YAML auto-typing — a future
// assignment slug like "yes", "null", or "2026" would otherwise round-trip
// as a boolean, null, or integer.
func marshalQuotedYAML(v any) ([]byte, error) {
	var node yaml.Node
	if err := node.Encode(v); err != nil {
		return nil, err
	}
	quoteStringValues(&node)

	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(&node); err != nil {
		_ = enc.Close()
		return nil, err
	}
	if err := enc.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// quoteStringValues walks the YAML tree and forces DoubleQuotedStyle on every
// string-tagged scalar that isn't a mapping key. Mapping keys, numbers,
// booleans, null, and structural nodes pass through unchanged. Generic over
// the struct shape, so adding a new field to ClassroomConfig requires no
// update here.
func quoteStringValues(n *yaml.Node) {
	if n == nil {
		return
	}
	switch n.Kind {
	case yaml.DocumentNode, yaml.SequenceNode:
		for _, c := range n.Content {
			quoteStringValues(c)
		}
	case yaml.MappingNode:
		// Content alternates [key, value, key, value, ...] — quote values,
		// recurse into them for nested mappings/sequences, leave keys alone.
		for i := 0; i+1 < len(n.Content); i += 2 {
			quoteStringValues(n.Content[i+1])
		}
	case yaml.ScalarNode:
		if n.Tag == "!!str" {
			n.Style = yaml.DoubleQuotedStyle
		}
	}
}
