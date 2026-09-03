# CLAUDE.md

Project conventions live in [AGENTS.md](AGENTS.md) — read it first; everything there applies here.

## gstack (optional, telemetry off)

This repo carries a bootstrap for [gstack](https://github.com/garrytan/gstack), a suite of
Claude Code skills (`/review`, `/qa`, `/investigate`, `/ship`, `/browse`, …). It is optional —
nothing in the build or CI depends on it.

```bash
.claude/scripts/install-gstack.sh          # clone/update ~/.claude/skills/gstack, then ./setup
.claude/scripts/install-gstack.sh --team   # same, plus gstack team mode
```

The script disables telemetry before any gstack code runs: it writes `telemetry: off` to
`~/.gstack/config.yaml` and drops the `~/.gstack/.telemetry-prompted` marker, so gstack neither
sends usage data nor asks about it on first run. Verify or revisit at any time:

```bash
~/.claude/skills/gstack/bin/gstack-config get telemetry   # -> off
~/.claude/skills/gstack/bin/gstack-egress list            # off-machine sends, receipted
```

Note that `update_check` stays on: gstack asks GitHub for the latest version tag (no usage data).
Turn it off with `gstack-config set update_check false`.

`/browse` and `/qa` need Playwright Chromium. Where the browser CDN is unreachable but a Chromium
already ships under `PLAYWRIGHT_BROWSERS_PATH` (Claude Code on the web), the script links that
browser to the build revision Playwright expects instead of downloading one.
