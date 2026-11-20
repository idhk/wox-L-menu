#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Cloud sessions get a fresh container, so the native UI toolchain has to be
# reinstalled every time. Without it `make smoke`, `make test-go-ui-unit` and any
# build of ./ui/... fail: the Go UI links against GTK3/X11 through cgo.
#
# The package list mirrors .github/workflows/ui.yml so cloud sessions and CI
# resolve the same libraries. Keep the two in sync when either changes.
set -euo pipefail

# Local machines already have their own toolchain; only prepare remote containers.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PACKAGES=(
  pkg-config
  libgtk-3-dev
  libsecret-1-dev
  libx11-dev
  libxfixes-dev
  libxi-dev
  libxrandr-dev
  libxkbcommon-dev
  libxkbcommon-x11-dev
  libxtst-dev
  libkeybinder-3.0-dev
  libpipewire-0.3-dev
  xclip
  xvfb
)

# pkg-config resolving gtk+-3.0 means a previous run already installed the set,
# so repeat sessions skip the slowest step instead of re-running apt.
if ! pkg-config --exists gtk+-3.0; then
  export DEBIAN_FRONTEND=noninteractive
  sudo apt-get update -qq
  sudo apt-get install -y -qq "${PACKAGES[@]}"
fi

# go:embed rejects an empty directory, and resource/hosts is gitignored, so a
# fresh clone cannot build wox/resource until the placeholder exists.
mkdir -p "$CLAUDE_PROJECT_DIR/wox.core/resource/hosts"
touch "$CLAUDE_PROJECT_DIR/wox.core/resource/hosts/placeholder"

# Containers have no display and no GPU. Exporting both defaults lets `make smoke`
# run unchanged instead of requiring the caller to remember the headless prefix.
# SessionStart also fires on resume, clear and compact, so skip lines already
# written rather than appending a duplicate export on every event.
append_environment() {
  if ! grep -qxF "$1" "$CLAUDE_ENV_FILE" 2>/dev/null; then
    echo "$1" >> "$CLAUDE_ENV_FILE"
  fi
}

append_environment 'export GO_UI_SMOKE_RUNNER="xvfb-run -a"'
append_environment 'export LIBGL_ALWAYS_SOFTWARE=1'
