#!/usr/bin/env bash
# Verify all mandatory version pins match the expected version.
#
# Usage: scripts/verify_version_pins.sh <expected-version>
# Example: scripts/verify_version_pins.sh 0.26.0
#
# Exits 0 if every pin matches, non-zero on any mismatch. The
# release-workflow rule (Step 4) requires this to pass before
# tagging a release.
#
# Pin policy: see .claude/rules/release-workflow.md "Step 4".
# Mandatory pins are listed below. Plugin pyproject.toml files
# and the launcher's own version are intentionally NOT here -
# they have independent release lifecycles per CLAUDE.md.
#
# When a new version-pin is introduced anywhere in the codebase,
# add it to BOTH this script AND the Step 4 checklist in the
# same commit.

set -euo pipefail

EXPECTED="${1:?usage: $0 <expected-version>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
errors=0

# extract_first_semver <file> <line-pattern>
# Reads the file, finds the first line matching <line-pattern>,
# extracts the first X.Y.Z token. Empty string on no match.
extract_first_semver() {
    local file="$1"
    local pattern="$2"
    grep -E "$pattern" "$ROOT/$file" 2>/dev/null \
        | head -1 \
        | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' \
        | head -1 || true
}

check() {
    local file="$1"
    local pattern="$2"
    local label="$3"
    local actual
    actual=$(extract_first_semver "$file" "$pattern")
    if [[ -z "$actual" ]]; then
        echo "MISSING: $label ($file): no version line matched pattern '$pattern'"
        errors=$((errors + 1))
    elif [[ "$actual" != "$EXPECTED" ]]; then
        echo "MISMATCH: $label ($file): expected $EXPECTED, found $actual"
        errors=$((errors + 1))
    else
        echo "OK: $label = $actual"
    fi
}

# Mandatory pins (audit 2026-05-04). Order matches the Step 4
# checklist in .claude/rules/release-workflow.md.

check "install.sh" \
    '^VERSION=' \
    "install.sh VERSION"

check "backend/pyproject.toml" \
    '^version = ' \
    "backend pyproject"

check "backend/app/__init__.py" \
    '^__version__ = ' \
    "backend __version__"

check "frontend/package.json" \
    '"version":' \
    "frontend package.json"

check "launcher/bibliogon_launcher/installer.py" \
    '^COMPATIBLE_VERSION = ' \
    "launcher COMPATIBLE_VERSION"

# Frontend `APP_VERSION` is intentionally not checked here.
# Both ErrorReportDialog.tsx and errorContext.ts now reference
# `__APP_VERSION__`, a build-time literal Vite injects from
# `frontend/package.json` (see frontend/vite.config.ts `define`).
# The package.json version is the only frontend source-of-truth;
# downstream code cannot drift.

# Defensive regression check: any new frontend hardcode of
# `APP_VERSION = "X.Y.Z"` (or similar) is a violation of the
# single-source-of-truth policy. Future contributors should use
# `__APP_VERSION__` instead.
regression=$(grep -rEn "APP_VERSION\s*=\s*['\"][0-9]+\.[0-9]+\.[0-9]+['\"]" \
    "$ROOT/frontend/src" \
    --include="*.ts" --include="*.tsx" 2>/dev/null || true)
if [[ -n "$regression" ]]; then
    echo
    echo "REGRESSION: hardcoded APP_VERSION constants found in frontend/src/"
    echo "$regression"
    echo "Use __APP_VERSION__ (Vite define from package.json) instead."
    errors=$((errors + 1))
fi

echo

if [[ $errors -gt 0 ]]; then
    echo "$errors version pin(s) out of sync with $EXPECTED."
    echo "Fix before tagging the release."
    exit 1
fi

echo "All mandatory version pins match $EXPECTED."
