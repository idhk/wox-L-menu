//go:build wox_ui_smoke

package query

import (
	"context"
	"testing"

	"wox/test/automationdriver"
	"wox/test/smoke"
)

// Test018LauncherVisualCapture writes launcher screenshots for environments without a physical display.
// Flow: show the launcher -> capture the empty query state -> run a calculator query -> capture the result state.
// Evidence: two PNG files under WOX_SMOKE_CAPTURE_DIR showing real rendered pixels rather than semantics only.
// The case skips unless that directory is configured so ordinary suite runs stay artifact free.
func Test018LauncherVisualCapture(t *testing.T) {
	if smoke.CaptureDirectory() == "" {
		t.Skipf("set %s to capture launcher screenshots", smoke.CaptureDirectoryEnvironment)
	}
	smoke.Case(t, func(ctx context.Context, client *automationdriver.Client) {
		smoke.ShowLauncher(t, ctx, client)
		t.Logf("captured empty launcher: %s", smoke.Capture(t, ctx, client, "018_launcher_empty"))

		snapshot := smoke.SetLauncherQueryAndWaitComplete(t, ctx, client, "1+1")
		smoke.AssertNoDiagnostics(t, snapshot)
		if !smoke.HasLauncherResultLabel(snapshot, "2") {
			t.Fatal("calculator result is missing before capture")
		}
		t.Logf("captured launcher result: %s", smoke.Capture(t, ctx, client, "018_launcher_result"))
	})
}
