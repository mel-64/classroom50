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
	"time"

	"github.com/cli/go-gh/v2/pkg/api"
	"github.com/spf13/cobra"
)

// dirTimestampFormat is the suffix appended to the default submissions
// directory so each run produces a fresh folder. Underscores keep the name
// filesystem-safe across platforms; the loose ISO-8601 shape (`T` between
// date and time) makes it sortable lexicographically.
const dirTimestampFormat = "2006_01_02_T_15_04_05"

func downloadCmd() *cobra.Command {
	var (
		dir     string
		quiet   bool
		verbose bool
	)

	cmd := &cobra.Command{
		Use:   "download <org> <assignment>",
		Short: "Clone every student submission repo for an assignment",
		Long: "Clone every repo in <org> whose name ends in -<assignment>, the convention\n" +
			"established by `gh student accept` (which creates <username>-<assignment>).\n\n" +
			"Repos are cloned via `gh repo clone`, so authentication is inherited from the\n" +
			"current gh session. The default destination is <org>_submissions_<timestamp>/\n" +
			"in the current directory so each run produces a fresh folder, preserving\n" +
			"prior downloads. Pass -d/--dir to override the destination — the value is\n" +
			"used literally (no timestamp). When the target directory already exists,\n" +
			"individual repos already on disk are skipped, so re-runs with -d pick up\n" +
			"new submissions without aborting on the ones already cloned.",
		Example: "  gh teacher download cs50-fall-2026 hello                  # clones into cs50-fall-2026_submissions_2026_05_09_T_14_30_45/\n" +
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
			// Both `-d` not passed and `-d ""` should resolve to the per-org
			// default so we don't end up creating clones at the cwd root.
			// Default gets a timestamp suffix; explicit -d is taken literally.
			dir = strings.TrimSpace(dir)
			if dir == "" {
				dir = fmt.Sprintf("%s_submissions_%s", org, time.Now().Format(dirTimestampFormat))
			}

			client, err := api.DefaultRESTClient()
			if err != nil {
				return fmt.Errorf("REST client: %w", err)
			}

			return downloadAssignment(client, cmd.OutOrStdout(), cmd.ErrOrStderr(), org, assignment, dir, quiet, verbose)
		},
	}

	cmd.Flags().StringVarP(&dir, "dir", "d", "", "Directory to clone repos into (default: <org>_submissions_<timestamp>)")
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Suppress informational output and pass --quiet to git clone (errors still go to stderr)")
	cmd.Flags().BoolVarP(&verbose, "verbose", "v", false, "Stream raw git output for each clone instead of the concise per-repo summary")
	return cmd
}

func downloadAssignment(client *api.RESTClient, out, errOut io.Writer, org, assignment, dir string, quiet, verbose bool) error {
	// `gh student accept` lowercases assignment when forming repo names, so the
	// stored names are always lowercase regardless of how the teacher typed the
	// arg. Lowercase here too so a `gh teacher download cs50 PSet1` invocation
	// still matches `alice-pset1` etc.
	suffix := "-" + strings.ToLower(assignment)

	repos, err := listOrgRepoNames(client, org)
	if err != nil {
		return err
	}

	// Match by `gh student accept`'s naming convention: <username>-<assignment>.
	// `len(name) > len(suffix)` guarantees a non-empty username prefix; the
	// HasSuffix check anchors the assignment slug at end-of-name. This match is
	// intentionally per-spec — see cli/README.md. It can over-match when the
	// org also contains unrelated repos that happen to end in -<assignment>
	// (e.g., a `<org>-<assignment>` template fork). Teachers running download
	// against a noisy org should keep classroom orgs focused.
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

		// Skip-existing reported as its own line so the verb matches what
		// happened — "Cloning X... Skipped" reads wrong since we didn't
		// actually start a clone.
		if _, err := os.Stat(target); err == nil {
			if !quiet {
				_, _ = fmt.Fprintf(out, "Skipped %s (already exists)\n", name)
			}
			continue
		} else if !os.IsNotExist(err) {
			_, _ = fmt.Fprintf(errOut, "%s: stat %s: %v\n", name, target, err)
			failed = append(failed, name)
			continue
		}

		if !quiet {
			// In verbose mode we print a full line so git's output starts
			// cleanly on the next line; otherwise leave the line open and
			// append "Done" / "Failed: ..." after the clone returns.
			if verbose {
				_, _ = fmt.Fprintf(out, "Cloning %s\n", name)
			} else {
				_, _ = fmt.Fprintf(out, "Cloning %s... ", name)
			}
		}

		if err := cloneOrgRepo(out, errOut, org, name, target, quiet, verbose); err != nil {
			if quiet {
				_, _ = fmt.Fprintf(errOut, "%s: clone failed: %v\n", name, err)
			} else if verbose {
				_, _ = fmt.Fprintf(out, "%s: failed: %v\n", name, err)
			} else {
				_, _ = fmt.Fprintf(out, "Failed: %v\n", err)
			}
			failed = append(failed, name)
			continue
		}

		if !quiet {
			if verbose {
				_, _ = fmt.Fprintf(out, "%s: done\n", name)
			} else {
				_, _ = fmt.Fprintln(out, "Done")
			}
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

// stderrTailCap bounds the stderr capture in non-verbose clones. Eight KiB
// holds far more than git's actual error message (typically a handful of
// lines); progress output that flows through stderr earlier in the run is
// allowed to overflow because we only surface the trailing diagnostic.
const stderrTailCap = 8 * 1024

// cloneOrgRepo shells out to `gh repo clone`. In verbose mode git's stdout
// and stderr stream to the user's terminal; otherwise stdout is discarded
// and the last <stderrTailCap> bytes of stderr are captured so the per-repo
// "Failed: …" line carries git's actual diagnostic instead of just
// "exit status 1".
func cloneOrgRepo(out, errOut io.Writer, org, repo, target string, quiet, verbose bool) error {
	args := []string{"repo", "clone", fmt.Sprintf("%s/%s", org, repo), target}
	if quiet {
		args = append(args, "--", "--quiet")
	}
	cmd := exec.Command("gh", args...)

	var stderrTail *tailWriter
	if verbose {
		cmd.Stdout = out
		cmd.Stderr = errOut
	} else {
		cmd.Stdout = io.Discard
		stderrTail = newTailWriter(stderrTailCap)
		cmd.Stderr = stderrTail
	}

	if err := cmd.Run(); err != nil {
		if stderrTail != nil {
			// Distill multi-line stderr (`Cloning into …`, progress, then the
			// actual `fatal: …`) down to the trailing actionable line so the
			// per-repo "Failed: …" output stays one line.
			if msg := lastNonEmptyLine(stderrTail.String()); msg != "" {
				return fmt.Errorf("%w: %s", err, msg)
			}
		}
		return err
	}
	return nil
}

// tailWriter is an io.Writer that retains only the last cap bytes written to
// it. Used to capture git's stderr without unbounded memory growth on chatty
// clones — git's actionable error message is at the end of stderr (after any
// progress output), so a bounded tail is sufficient for diagnostic purposes.
type tailWriter struct {
	buf []byte
	cap int
}

func newTailWriter(cap int) *tailWriter {
	return &tailWriter{cap: cap}
}

func (w *tailWriter) Write(p []byte) (int, error) {
	n := len(p)
	switch {
	case n >= w.cap:
		// p alone fills or overflows the window — keep its last cap bytes.
		w.buf = append(w.buf[:0], p[n-w.cap:]...)
	case len(w.buf)+n <= w.cap:
		// fits in current window
		w.buf = append(w.buf, p...)
	default:
		// drop oldest before appending so the total stays at cap
		drop := len(w.buf) + n - w.cap
		w.buf = append(w.buf[:0], w.buf[drop:]...)
		w.buf = append(w.buf, p...)
	}
	return n, nil
}

func (w *tailWriter) String() string {
	return string(w.buf)
}

// lastNonEmptyLine returns the last non-empty, whitespace-trimmed line of s.
// Falls back to the entire trimmed string if no line breaks are present.
func lastNonEmptyLine(s string) string {
	for i := len(s); i > 0; {
		j := strings.LastIndexByte(s[:i], '\n')
		line := strings.TrimSpace(s[j+1 : i])
		if line != "" {
			return line
		}
		if j < 0 {
			return ""
		}
		i = j
	}
	return ""
}
