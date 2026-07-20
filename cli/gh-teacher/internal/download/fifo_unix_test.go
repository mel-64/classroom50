//go:build unix

package download

import (
	"syscall"
	"testing"
)

// mkfifoOrSkip creates a FIFO at path, skipping when the platform/filesystem
// can't. A student-committed FIFO at a sink name must not hang the write.
func mkfifoOrSkip(t *testing.T, path string) {
	t.Helper()
	if err := syscall.Mkfifo(path, 0o644); err != nil {
		t.Skipf("mkfifo unsupported: %v", err)
	}
}
