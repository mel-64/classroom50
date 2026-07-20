//go:build !unix

package download

import "testing"

// mkfifoOrSkip: no FIFOs off Unix; the FIFO-hang vector doesn't apply there.
func mkfifoOrSkip(t *testing.T, path string) {
	t.Helper()
	t.Skip("FIFOs unsupported on this platform")
}
