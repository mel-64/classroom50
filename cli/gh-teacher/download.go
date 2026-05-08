package main

import (
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
)

func downloadCmd() *cobra.Command {
	var (
		dir   string
		quiet bool
	)

	cmd := &cobra.Command{
		Use:   "download <org> <assignment>",
		Short: "Clone every student submission repo for an assignment",
		Long: "Clone every repo in <org> whose name ends in -<assignment>, the convention\n" +
			"established by `gh student accept` (which creates <username>-<assignment>).\n\n" +
			"Repos are cloned via `gh repo clone`, so authentication is inherited from the\n" +
			"current gh session. Default destination is <org>_submissions/ in the current\n" +
			"directory; override with -d/--dir. Existing target directories are skipped, so\n" +
			"re-running picks up new submissions without aborting on the ones already on disk.",
		Example: "  gh teacher download cs50-fall-2026 hello                  # clones into cs50-fall-2026_submissions/\n" +
			"  gh teacher download -d submissions cs50-fall-2026 hello   # clones into submissions/",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true
			org := strings.TrimSpace(args[0])
			assignment := strings.TrimSpace(args[1])
			if org == "" {
				return errors.New("org must not be empty")
			}
			if assignment == "" {
				return errors.New("assignment must not be empty")
			}
			if !cmd.Flags().Changed("dir") {
				dir = org + "_submissions"
			}

			client, err := api.DefaultRESTClient()
			if err != nil {
				return fmt.Errorf("REST client: %w", err)
			}

			return downloadAssignment(client, cmd.OutOrStdout(), cmd.ErrOrStderr(), org, assignment, dir, quiet)
		},
	}

	cmd.Flags().StringVarP(&dir, "dir", "d", "", "Directory to clone repos into (default: <org>_submissions)")
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Suppress informational output and pass --quiet to git clone (errors still go to stderr)")
	return cmd
}

func downloadAssignment(client *api.RESTClient, out, errOut io.Writer, org, assignment, dir string, quiet bool) error {
	suffix := "-" + assignment

	repos, err := listOrgRepoNames(client, org)
	if err != nil {
		return err
	}

	var matched []string
	for _, name := range repos {
		if len(name) > len(suffix) && strings.HasSuffix(name, suffix) {
			matched = append(matched, name)
		}
	}

	if len(matched) == 0 {
		if !quiet {
			_, _ = fmt.Fprintf(out, "%s: no repos matching *%s\n", org, suffix)
		}
		return nil
	}

	if dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create %s: %w", dir, err)
		}
	}

	var failed []string
	for _, name := range matched {
		target := filepath.Join(dir, name)
		if _, err := os.Stat(target); err == nil {
			if !quiet {
				_, _ = fmt.Fprintf(out, "%s/%s: already exists, skipped\n", org, name)
			}
			continue
		} else if !os.IsNotExist(err) {
			_, _ = fmt.Fprintf(errOut, "%s/%s: stat %s: %v\n", org, name, target, err)
			failed = append(failed, name)
			continue
		}

		if err := cloneOrgRepo(out, errOut, org, name, target, quiet); err != nil {
			_, _ = fmt.Fprintf(errOut, "%s/%s: clone failed: %v\n", org, name, err)
			failed = append(failed, name)
			continue
		}
		if !quiet {
			_, _ = fmt.Fprintf(out, "%s/%s: cloned\n", org, name)
		}
	}

	if !quiet {
		_, _ = fmt.Fprintf(out, "%s: %d/%d cloned\n", org, len(matched)-len(failed), len(matched))
	}

	if len(failed) > 0 {
		return fmt.Errorf("%d of %d repo(s) failed to clone: %s", len(failed), len(matched), strings.Join(failed, ", "))
	}
	return nil
}

func listOrgRepoNames(client *api.RESTClient, org string) ([]string, error) {
	var names []string
	for page := 1; ; page++ {
		var batch []struct {
			Name string `json:"name"`
		}
		path := fmt.Sprintf("orgs/%s/repos?per_page=100&page=%d", url.PathEscape(org), page)
		if err := client.Get(path, &batch); err != nil {
			return nil, fmt.Errorf("GET %s: %w", path, err)
		}
		if len(batch) == 0 {
			break
		}
		for _, r := range batch {
			names = append(names, r.Name)
		}
		if len(batch) < 100 {
			break
		}
	}
	return names, nil
}

func cloneOrgRepo(out, errOut io.Writer, org, repo, target string, quiet bool) error {
	args := []string{"repo", "clone", fmt.Sprintf("%s/%s", org, repo), target}
	if quiet {
		args = append(args, "--", "--quiet")
	}
	cmd := exec.Command("gh", args...)
	cmd.Stdout = out
	cmd.Stderr = errOut
	return cmd.Run()
}
