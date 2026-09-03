package smoke

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"wox/test/automationdriver"
)

// CaptureDirectoryEnvironment names the directory that receives opt-in smoke screenshots.
const CaptureDirectoryEnvironment = "WOX_SMOKE_CAPTURE_DIR"

// CaptureDirectory reports the configured screenshot directory, empty when visual evidence is off.
func CaptureDirectory() string {
	return strings.TrimSpace(os.Getenv(CaptureDirectoryEnvironment))
}

// Capture writes one PNG of the current native window and returns its path.
// Screenshots stay opt-in through CaptureDirectoryEnvironment so ordinary suite runs keep
// producing no artifacts; headless environments set it to inspect real rendered output.
func Capture(t *testing.T, ctx context.Context, client *automationdriver.Client, name string) string {
	t.Helper()
	directory := CaptureDirectory()
	if directory == "" {
		return ""
	}
	absoluteDirectory, err := filepath.Abs(directory)
	if err != nil {
		t.Fatalf("resolve %s: %v", CaptureDirectoryEnvironment, err)
	}
	if err := os.MkdirAll(absoluteDirectory, 0o755); err != nil {
		t.Fatalf("create smoke capture directory: %v", err)
	}
	waitForPresentedFrame(t, ctx, client)
	path := filepath.Join(absoluteDirectory, name+".png")
	if err := client.Capture(ctx, path); err != nil {
		t.Fatalf("capture %s: %v", name, err)
	}
	return path
}

// waitForPresentedFrame invalidates the surface and waits until a new frame reaches the compositor.
// Capturing right after the window appears otherwise races the first paint and stores blank pixels,
// because the semantics snapshot settles before the native surface has presented anything.
func waitForPresentedFrame(t *testing.T, ctx context.Context, client *automationdriver.Client) {
	t.Helper()
	before, err := client.FrameMetrics(ctx)
	if err != nil {
		t.Fatalf("read frame metrics before capture: %v", err)
	}
	if err := client.RequestFrame(ctx); err != nil {
		t.Fatalf("request capture frame: %v", err)
	}
	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()
	for {
		metrics, err := client.FrameMetrics(ctx)
		if err != nil {
			t.Fatalf("read frame metrics while waiting for capture frame: %v", err)
		}
		if metrics.PresentedFrameCount > before.PresentedFrameCount {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatalf("wait for presented capture frame: %v", ctx.Err())
		case <-ticker.C:
		}
	}
}
