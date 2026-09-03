#!/usr/bin/env bash
# Install (or update) gstack with telemetry disabled.
#
#   .claude/scripts/install-gstack.sh [extra ./setup args]
#
# gstack (https://github.com/garrytan/gstack) ships opt-in usage telemetry:
# the default is off, but a skill run asks once whether to turn it on. This
# script writes `telemetry: off` into ~/.gstack/config.yaml and drops the
# `.telemetry-prompted` marker BEFORE running ./setup, so nothing is ever
# sent and the question is never asked.
#
# Re-runnable: an existing install is fast-forwarded instead of re-cloned.
set -euo pipefail

REPO_URL="${GSTACK_REPO_URL:-https://github.com/garrytan/gstack.git}"
INSTALL_DIR="${GSTACK_INSTALL_DIR:-$HOME/.claude/skills/gstack}"
STATE_DIR="${GSTACK_HOME:-$HOME/.gstack}"

log() { printf '==> %s\n' "$*"; }

# ── 1. Clone or fast-forward ────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch origin main
  git -C "$INSTALL_DIR" pull --ff-only --autostash origin main
else
  log "Cloning gstack into $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --single-branch --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

# ── 2. Telemetry off, before any skill or setup step can log ────────────────
mkdir -p "$STATE_DIR"
"$INSTALL_DIR/bin/gstack-config" set telemetry off
touch "$STATE_DIR/.telemetry-prompted"   # suppresses the first-run opt-in prompt
log "telemetry: $("$INSTALL_DIR/bin/gstack-config" get telemetry)"

# ── 3. Playwright fallback for sandboxes without CDN access ─────────────────
# setup hard-fails if Playwright cannot launch Chromium, and some sandboxes
# (Claude Code on the web) block cdn.playwright.dev while shipping a Chromium
# under PLAYWRIGHT_BROWSERS_PATH. Point the build revision Playwright expects
# at the browser that is already there.
shim_preinstalled_chromium() {
  local root="${PLAYWRIGHT_BROWSERS_PATH:-}"
  [ "$(uname -s)" = "Linux" ] || return 1
  [ -n "$root" ] && [ -d "$root" ] || return 1

  local rev src_browser src_shell
  rev=$(read_expected_revision) || return 1
  [ -n "$rev" ] || return 1
  src_browser=$(find_binary "$root"/chromium-[0-9]* chrome) || return 1
  src_shell=$(find_binary "$root"/chromium_headless_shell-[0-9]* headless_shell chrome-headless-shell) || return 1

  log "Linking pre-installed Chromium as Playwright build $rev"
  link_build "$root/chromium-$rev" "$src_browser" chrome-linux/chrome chrome-linux64/chrome
  link_build "$root/chromium_headless_shell-$rev" "$src_shell" \
    chrome-linux/headless_shell chrome-headless-shell-linux64/chrome-headless-shell
}

read_expected_revision() {
  local js='const b=require(process.argv[1]).browsers.find(x=>x.name==="chromium");if(!b)process.exit(1);console.log(b.revision)'
  local json="$INSTALL_DIR/node_modules/playwright-core/browsers.json"
  [ -f "$json" ] || return 1
  if command -v node >/dev/null 2>&1; then node -e "$js" "$json"; else bun -e "$js" "$json"; fi
}

# find_binary <dir glob…> <binary name…> — first match wins.
find_binary() {
  local dirs=() names=() arg
  for arg in "$@"; do
    if [ -d "$arg" ]; then dirs+=("$arg"); else names+=("$arg"); fi
  done
  local dir name hit
  for dir in "${dirs[@]:-}"; do
    for name in "${names[@]}"; do
      hit=$(find "$dir" -maxdepth 3 -type f -name "$name" 2>/dev/null | head -1)
      [ -n "$hit" ] && { printf '%s\n' "$hit"; return 0; }
    done
  done
  return 1
}

# link_build <build dir> <real binary> <relative path…>
link_build() {
  local build="$1" binary="$2"; shift 2
  local rel
  for rel in "$@"; do
    mkdir -p "$build/$(dirname "$rel")"
    ln -sfn "$binary" "$build/$rel"
  done
  touch "$build/INSTALLATION_COMPLETE" "$build/DEPENDENCIES_VALIDATED"
}

# ── 4. Setup ────────────────────────────────────────────────────────────────
log "Running ./setup ${*:-}"
if ! (cd "$INSTALL_DIR" && ./setup "$@"); then
  shim_preinstalled_chromium || {
    echo "gstack setup failed and no pre-installed Chromium was found to fall back on." >&2
    exit 1
  }
  log "Retrying ./setup"
  (cd "$INSTALL_DIR" && ./setup "$@")
fi

# ── 5. Verify ───────────────────────────────────────────────────────────────
TELEMETRY=$("$INSTALL_DIR/bin/gstack-config" get telemetry)
[ "$TELEMETRY" = "off" ] || { echo "telemetry is '$TELEMETRY', expected 'off'" >&2; exit 1; }
log "gstack $(cat "$INSTALL_DIR/VERSION") installed at $INSTALL_DIR — telemetry off"
