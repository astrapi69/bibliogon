#!/usr/bin/env bash
# check-blockers.sh
#
# Pings the upstream sources for every BLOCKED dependency / security item
# tracked in docs/backlog.md and reports whether anything has changed.
#
# Run from the repo root:
#   make check-blockers
# or directly:
#   bash scripts/check-blockers.sh
#
# Exit code 0 even when blockers stay blocked. Non-zero only on
# tooling errors (missing curl / npm / network).

set -u

# Colour helpers (no-op when not a TTY)
if [ -t 1 ]; then
  RED=$'\033[0;31m'
  GRN=$'\033[0;32m'
  YEL=$'\033[0;33m'
  BLU=$'\033[0;34m'
  RST=$'\033[0m'
else
  RED=""; GRN=""; YEL=""; BLU=""; RST=""
fi

blocked=0
unblocked=0
manual=0

print_header() {
  printf "%s\n" ""
  printf "%s===%s %s %s===%s\n" "$BLU" "$RST" "$1" "$BLU" "$RST"
}

mark_blocked() {
  blocked=$((blocked + 1))
  printf "  %s[BLOCKED]%s %s\n" "$RED" "$RST" "$1"
}

mark_unblocked() {
  unblocked=$((unblocked + 1))
  printf "  %s[UNBLOCKED]%s %s\n" "$GRN" "$RST" "$1"
}

mark_manual() {
  manual=$((manual + 1))
  printf "  %s[MANUAL]%s %s\n" "$YEL" "$RST" "$1"
}

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "%sERROR%s: required tool '%s' not on PATH\n" "$RED" "$RST" "$1" >&2
    exit 2
  fi
}

require npm
require curl

# -----------------------------------------------------------------------------
# DEP-02: TipTap 2 -> 3 migration
# Hard blocker: @sereneinserenade/tiptap-search-and-replace v0.2.0 not on npm.
# -----------------------------------------------------------------------------
print_header "DEP-02 TipTap 3 (search-and-replace npm publish)"
ts_versions=$(npm view @sereneinserenade/tiptap-search-and-replace versions --json 2>/dev/null || echo "[]")
printf "  Published versions: %s\n" "$ts_versions"
if printf "%s" "$ts_versions" | grep -q '"0\.2\.'; then
  mark_unblocked "tiptap-search-and-replace v0.2.x is on npm. Path A (normal migration) is open."
else
  mark_blocked  "tiptap-search-and-replace v0.2.x not on npm yet. Path B (prosemirror-search adapter) requires user go-ahead."
fi

# -----------------------------------------------------------------------------
# DEP-09 + SEC-01: Vite 7 -> 8 / vite-plugin-pwa CVE chain
# Both unblock together when vite-plugin-pwa releases a Vite-8-compatible
# version. Check its peerDependencies for Vite 8.
# -----------------------------------------------------------------------------
print_header "DEP-09 + SEC-01 vite-plugin-pwa Vite-8 compat"
vp_pwa_peer=$(npm view vite-plugin-pwa peerDependencies --json 2>/dev/null || echo "{}")
vp_pwa_latest=$(npm view vite-plugin-pwa version 2>/dev/null || echo "?")
printf "  Latest version: %s\n" "$vp_pwa_latest"
printf "  peerDependencies: %s\n" "$vp_pwa_peer"
if printf "%s" "$vp_pwa_peer" | grep -q "8\\.0\\.0"; then
  mark_unblocked "vite-plugin-pwa peer-dep range now includes Vite 8. DEP-09 + SEC-01 unblock together."
else
  mark_blocked  "vite-plugin-pwa peer deps still top out at Vite 7."
fi

# -----------------------------------------------------------------------------
# DEP-05: elevenlabs SDK 0.2 -> 2.x
# Not strictly version-blocked (the bump is available); blocker is paid-API
# verification. Surface the version delta so the operator can schedule.
# -----------------------------------------------------------------------------
print_header "DEP-05 elevenlabs SDK 0.2 -> 2.x (paid-API verification)"
el_pinned=$(grep -E '^elevenlabs\s*=' backend/pyproject.toml 2>/dev/null | head -1 | sed -E 's/.*"\^?([0-9.]+)".*/\1/')
el_latest=$(curl -fsSL "https://pypi.org/pypi/elevenlabs/json" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['info']['version'])" 2>/dev/null || echo "?")
printf "  Pinned: %s\n" "${el_pinned:-?}"
printf "  Latest on PyPI: %s\n" "$el_latest"
mark_manual "Bump available (${el_pinned:-?} -> ${el_latest}). Manual unblock = schedule a real audiobook test session with a live ElevenLabs key."

# -----------------------------------------------------------------------------
# AR-03+: validation log
# AR-02 architecture decision is already done (Option B, see
# docs/ROADMAP.md:140). The remaining gate is AR-01 validation entries
# driving the AR-03+ platform-API commitment per ROADMAP:199.
# Not network-checkable; counts ## headings in the journal.
# -----------------------------------------------------------------------------
print_header "AR-03+ platform APIs (cross-posting validation log)"
ar_log="docs/journal/article-workflow-observations.md"
if [ -f "$ar_log" ]; then
  ar_entries=$(grep -c '^## ' "$ar_log" 2>/dev/null || echo 0)
  printf "  Log entries (## headings): %s\n" "$ar_entries"
  if [ "$ar_entries" -ge 3 ]; then
    mark_unblocked "AR-01 log has $ar_entries entries (>= 3 needed). AR-03+ platform-API commitment can proceed."
  else
    mark_manual "AR-01 log has $ar_entries entries. Target 3-5 entries before AR-03+ commitment."
  fi
else
  printf "  Log file not present yet.\n"
  mark_manual "AR-01 log file does not exist. Create on first cross-post."
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
printf "\n%s---%s\n" "$BLU" "$RST"
printf "%sSummary%s: %d blocked, %d unblocked, %d manual\n" "$BLU" "$RST" "$blocked" "$unblocked" "$manual"
if [ "$unblocked" -gt 0 ]; then
  printf "%sAction%s: at least one upstream item moved. Update docs/backlog.md and ROADMAP.md.\n" "$GRN" "$RST"
fi
exit 0
