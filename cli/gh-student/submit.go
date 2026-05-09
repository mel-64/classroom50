package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/cli/go-gh/v2/pkg/api"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

func submitCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "submit",
		Short:   "Uses Git to add, commit, push contents of current branch to remote, after fetching parent repo's latest .gitignore and .github",
		Long:    "Uses Git to add, commit, push contents of current branch to remote, after fetching parent repo's latest .gitignore and .github",
		Example: "  gh student submit",
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true

			client, err := api.DefaultRESTClient()
			if err != nil {
				return fmt.Errorf("REST client: %w", err)
			}

			out := cmd.OutOrStdout()
			errOut := cmd.ErrOrStderr()

			var opts SubmitOptions
			return submitAssignment(client, out, errOut, opts)
		},
	}

	return cmd
}

type SubmitOptions struct {
	Message string
	Remote  string
	Branch  string
}

func submitAssignment(client *api.RESTClient, out io.Writer, errOut io.Writer, opts SubmitOptions) error {
	if opts.Remote == "" {
		opts.Remote = "origin"
	}
	if opts.Branch == "" {
		opts.Branch = "main"
	}

	root, inside, err := currentGitRoot()
	if err != nil {
		return err
	}
	if !inside {
		return fmt.Errorf("not inside a Git repository")
	}

	config, err := readClassroomConfig(filepath.Join(root, ClassroomMetadataPath))
	if err != nil {
		return err
	}

	if opts.Message == "" {
		opts.Message = fmt.Sprintf("Submit %s", config.AssignmentID)
	}

	remoteURL, err := gitOutput(root, "config", "--get", "remote."+opts.Remote+".url")
	if err != nil {
		return fmt.Errorf("read remote %q URL: %w", opts.Remote, err)
	}
	remoteURL = strings.TrimSpace(remoteURL)

	tmp, err := os.MkdirTemp("", "classroom50-submit-*")
	if err != nil {
		return fmt.Errorf("create temp submit repo: %w", err)
	}
	defer func() {
		_ = os.RemoveAll(tmp)
	}()

	if verbose {
		_, _ = fmt.Fprintf(out, "Preparing submission snapshot from %s\n", root)
	}

	if err := copySubmittableFiles(root, tmp); err != nil {
		return err
	}

	if verbose {
		_, _ = fmt.Fprintf(out, "Fetching latest instructor .gitignore and .github from %s/%s@%s\n",
			config.Source.Owner,
			config.Source.Repo,
			config.Source.Branch,
		)
	}

	// .gitignore and .github/ are required template artifacts; a 404 means
	// a misconfigured template, so fail loudly.
	if err := fetchRepoPath(client, tmp, config.Source.Owner, config.Source.Repo, config.Source.Branch, ".gitignore"); err != nil {
		return fmt.Errorf("fetch instructor .gitignore: %w", err)
	}
	if err := fetchRepoPath(client, tmp, config.Source.Owner, config.Source.Repo, config.Source.Branch, ".github"); err != nil {
		return fmt.Errorf("fetch instructor .github: %w", err)
	}

	if verbose {
		_, _ = fmt.Fprintf(out, "Pushing submission to %s %s\n", opts.Remote, opts.Branch)
	}

	if err := pushSnapshot(tmp, remoteURL, opts.Branch, opts.Message, out, errOut); err != nil {
		return err
	}

	_, _ = fmt.Fprintf(out, "Submitted %s to %s\n", config.AssignmentID, remoteURL)

	return nil
}

func gitOutput(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir

	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := errors.AsType[*exec.ExitError](err); ok {
			return "", fmt.Errorf("%s: %s", strings.Join(cmd.Args, " "), strings.TrimSpace(string(exitErr.Stderr)))
		}
		return "", fmt.Errorf("%s: %w", strings.Join(cmd.Args, " "), err)
	}

	return string(out), nil
}

type contentsEntry struct {
	Type string `json:"type"`
	Name string `json:"name"`
	Path string `json:"path"`
}
type contentsFile struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	Path     string `json:"path"`
	Encoding string `json:"encoding"`
	Content  string `json:"content"`
}

func fetchRepoPath(
	client *api.RESTClient,
	dstRoot string,
	owner string,
	repo string,
	ref string,
	path string,
) error {
	apiPath := fmt.Sprintf("repos/%s/%s/contents/%s?ref=%s",
		url.PathEscape(owner),
		url.PathEscape(repo),
		escapeContentPath(path),
		url.QueryEscape(ref),
	)

	var raw json.RawMessage
	if err := client.Get(apiPath, &raw); err != nil {
		return fmt.Errorf("GET %s: %w", apiPath, err)
	}

	trimmed := bytes.TrimSpace(raw)

	if len(trimmed) == 0 {
		return fmt.Errorf("empty contents response for %s", path)
	}

	switch trimmed[0] {
	case '[':
		var entries []contentsEntry
		if err := json.Unmarshal(raw, &entries); err != nil {
			return fmt.Errorf("parse directory response for %s: %w", path, err)
		}

		for _, entry := range entries {
			if entry.Type == "dir" || entry.Type == "file" {
				if err := fetchRepoPath(client, dstRoot, owner, repo, ref, entry.Path); err != nil {
					return err
				}
			}
		}

		return nil
	case '{':
		var file contentsFile
		if err := json.Unmarshal(raw, &file); err != nil {
			return fmt.Errorf("parse file response for %s: %w", path, err)
		}

		if file.Type != "file" {
			return nil
		}

		if file.Encoding != "base64" {
			return fmt.Errorf("unsupported encoding %q for %s", file.Encoding, path)
		}

		content := strings.ReplaceAll(file.Content, "\n", "")
		decoded, err := base64.StdEncoding.DecodeString(content)
		if err != nil {
			return fmt.Errorf("decode base64 content for %s: %w", path, err)
		}

		dst := filepath.Join(dstRoot, file.Path)
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return fmt.Errorf("create parent dir for %s: %w", dst, err)
		}

		if err := os.WriteFile(dst, decoded, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", dst, err)
		}

		return nil
	default:
		return fmt.Errorf("unexpected contents response for %s", path)
	}
}

func pushSnapshot(tmp string, remoteURL string, branch string, message string, out io.Writer, errOut io.Writer) error {
	if err := runGit(tmp, out, errOut, "init"); err != nil {
		return err
	}

	if err := runGit(tmp, out, errOut, "checkout", "-B", branch); err != nil {
		return err
	}

	if err := runGit(tmp, out, errOut, "add", "-A"); err != nil {
		return err
	}

	if err := runGit(tmp, out, errOut, "commit", "--allow-empty", "-m", message); err != nil {
		return err
	}

	if err := runGit(tmp, out, errOut, "remote", "add", "origin", remoteURL); err != nil {
		return err
	}

	// fetch is best-effort; log so --force-with-lease's degraded behavior is visible.
	if err := runGit(tmp, out, errOut, "fetch", "origin", branch+":refs/remotes/origin/"+branch); err != nil {
		_, _ = fmt.Fprintf(errOut, "fetch origin %s failed; pushing without remote-tracking ref: %v\n", branch, err)
	}

	if err := runGit(tmp, out, errOut, "push", "--force-with-lease", "origin", "HEAD:refs/heads/"+branch); err != nil {
		return fmt.Errorf("push submission snapshot: %w", err)
	}

	return nil
}

func runGit(dir string, out io.Writer, errOut io.Writer, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Stdout = out
	cmd.Stderr = errOut
	// no stdin + GIT_TERMINAL_PROMPT=0: fail fast on auth prompt instead of hanging.
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s: %w", strings.Join(cmd.Args, " "), err)
	}

	return nil
}

func copySubmittableFiles(srcRoot string, dstRoot string) error {
	cmd := exec.Command("git", "ls-files", "-co", "--exclude-standard", "-z")
	cmd.Dir = srcRoot

	out, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("list submittable files: %w", err)
	}

	entries := bytes.Split(out, []byte{0})
	for _, entry := range entries {
		if len(entry) == 0 {
			continue
		}

		rel := string(entry)

		if rel == ".git" || strings.HasPrefix(rel, ".git/") {
			continue
		}

		src := filepath.Join(srcRoot, rel)
		dst := filepath.Join(dstRoot, rel)

		info, err := os.Lstat(src)
		if err != nil {
			return fmt.Errorf("stat %s: %w", src, err)
		}

		if info.IsDir() {
			continue
		}

		if err := copyFilePreservingMode(src, dst, info.Mode()); err != nil {
			return err
		}
	}

	return nil
}

func copyFilePreservingMode(src string, dst string, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return fmt.Errorf("create parent dir for %s: %w", dst, err)
	}

	in, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("open %s: %w", src, err)
	}
	defer func() {
		_ = in.Close()
	}()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return fmt.Errorf("create %s: %w", dst, err)
	}
	defer func() {
		_ = out.Close()
	}()

	if _, err := io.Copy(out, in); err != nil {
		return fmt.Errorf("copy %s to %s: %w", src, dst, err)
	}

	return nil
}

func readClassroomConfig(path string) (*ClassroomConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	var config ClassroomConfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}

	if config.ClassroomID == "" {
		return nil, fmt.Errorf("missing classroom_id in %s", path)
	}
	if config.AssignmentID == "" {
		return nil, fmt.Errorf("missing assignment_id in %s", path)
	}
	if config.Source.Owner == "" || config.Source.Repo == "" || config.Source.Branch == "" {
		return nil, fmt.Errorf("missing source.owner/source.repo/source.branch: %s", path)
	}

	return &config, nil
}
