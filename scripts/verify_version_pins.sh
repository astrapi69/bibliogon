#!/usr/bin/env bash
# Verify version sources are aligned with the expected version.
#
# Usage: scripts/verify_version_pins.sh <expected-version>
# Example: scripts/verify_version_pins.sh 0.26.0
#
# Exits 0 if everything is aligned, non-zero on any failure.
# release-workflow.md Step 4 requires this to pass before tagging.
#
# Architecture (post-2026-05-04 SSoT refactor):
#
# Two canonical sources are hand-edited per release:
#   - backend/pyproject.toml      (Python subsystem)
#   - frontend/package.json       (JS subsystem)
# Plugin versions live in plugins/<name>/pyproject.toml and are
# bumped independently (per CLAUDE.md "Plugin package versions").
#
# Derived references (DO NOT EDIT):
#   - backend/app/__init__.py:__version__  (tomllib at import)
#   - install.sh                            (generated from template)
#   - launcher BIBLIOGON_TARGET_VERSION     (injected at build time)
#   - frontend __APP_VERSION__              (Vite define from package.json)
#   - plugins/bibliogon-plugin-git-sync     (importlib.metadata)
#
# This script:
#   1. Confirms the canonical pins match EXPECTED.
#   2. Runs scripts/generate_install_sh.sh --check (install.sh
#      sync with template + pyproject).
#   3. Regression-detects hardcoded version literals in the
#      "DO NOT EDIT" tier. If a contributor reintroduces one,
#      the corresponding derivation is broken; fix the
#      derivation, do not bump the literal.

set -euo pipefail

EXPECTED="${1:?usage: $0 <expected-version>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
errors=0

extract_first_semver() {
    local file="$1"
    local pattern="$2"
    grep -E "$pattern" "$ROOT/$file" 2>/dev/null \
        | head -1 \
        | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' \
        | head -1 || true
}

check_canonical() {
    local file="$1"
    local pattern="$2"
    local label="$3"
    local actual
    actual=$(extract_first_semver "$file" "$pattern")
    if [[ -z "$actual" ]]; then
        echo "MISSING: $label ($file): no version line matched '$pattern'"
        errors=$((errors + 1))
    elif [[ "$actual" != "$EXPECTED" ]]; then
        echo "MISMATCH: $label ($file): expected $EXPECTED, found $actual"
        errors=$((errors + 1))
    else
        echo "OK: $label = $actual"
    fi
}

# -------- Canonical pins (hand-edited at release) --------

check_canonical "backend/pyproject.toml" \
    '^version = ' \
    "backend pyproject"

check_canonical "frontend/package.json" \
    '"version":' \
    "frontend package.json"

# -------- Installer artifacts sync (install.sh + install.ps1) --------
#
# Delegates to scripts/sync_versions.py --check which knows how to
# regenerate every templated installer artifact. The bash-only
# generate_install_sh.sh stays as a human-facing helper for ad-hoc
# regeneration of install.sh; sync_versions.py is the canonical
# multi-artifact source of truth that release tooling consults.

if python3 "$ROOT/scripts/sync_versions.py" --check >/dev/null 2>&1; then
    echo "OK: installer artifacts in sync with templates + pyproject"
else
    echo "MISMATCH: install.sh and/or install.ps1 out of sync with" \
         "their templates + backend/pyproject.toml. Run" \
         "make sync-versions to regenerate."
    errors=$((errors + 1))
fi

# -------- Per-plugin (informational; independent versions) --------

shopt -s nullglob
for plugin_pyproject in "$ROOT"/plugins/*/pyproject.toml; do
    plugin_v=$(extract_first_semver \
        "${plugin_pyproject#$ROOT/}" \
        '^version = ')
    if [[ -n "$plugin_v" ]]; then
        echo "INFO: $(basename "$(dirname "$plugin_pyproject")"): $plugin_v"
    fi
done
shopt -u nullglob

# -------- Regression detectors (DO NOT EDIT tier) --------

regression_check() {
    local pattern="$1"
    local label="$2"
    local search_paths="$3"
    local hits
    # shellcheck disable=SC2086
    hits=$(grep -rnE "$pattern" $search_paths 2>/dev/null \
        | grep -v "test_\|_build_info\|importlib\|tomllib\|sentinel" \
        || true)
    if [[ -n "$hits" ]]; then
        echo
        echo "REGRESSION ($label):"
        echo "$hits"
        echo "Fix the derivation, not the literal."
        errors=$((errors + 1))
    fi
}

# Python __version__ literal anywhere in app code or plugins
regression_check \
    '__version__\s*=\s*"[0-9]+\.[0-9]+\.[0-9]+"' \
    'hardcoded Python __version__ literal' \
    "$ROOT/backend/app $ROOT/plugins"

# Defensive: the deprecated COMPATIBLE_VERSION alias was removed
# in 2026-05-04 cleanup. Any reappearance signals someone resurrected
# the old name; flag it so we re-decide the deprecation cycle.
regression_check \
    'COMPATIBLE_VERSION' \
    'reintroduced COMPATIBLE_VERSION (use BIBLIOGON_TARGET_VERSION)' \
    "$ROOT/launcher/bibliogon_launcher"

# Launcher target-version literal outside _build_info
regression_check \
    '^BIBLIOGON_TARGET_VERSION\s*=\s*"[0-9]' \
    'hardcoded BIBLIOGON_TARGET_VERSION literal in source' \
    "$ROOT/launcher/bibliogon_launcher"

# install.command + install.cmd are static wrappers (no version
# literal). Any v0.X.Y string in them signals someone duplicated
# version logic that belongs in install.sh.template / install.ps1.template.
for static_wrapper in "$ROOT/install.command" "$ROOT/install.cmd"; do
    [[ -f "$static_wrapper" ]] || continue
    if grep -nE 'v[0-9]+\.[0-9]+\.[0-9]+' "$static_wrapper" >/dev/null 2>&1; then
        echo
        echo "REGRESSION (hardcoded version literal in $(basename "$static_wrapper")):"
        grep -nE 'v[0-9]+\.[0-9]+\.[0-9]+' "$static_wrapper"
        echo "These wrappers must NOT carry a version literal; they delegate"
        echo "to install.sh / install.ps1 which carry the canonical version."
        errors=$((errors + 1))
    fi
done

# Frontend hardcoded APP_VERSION (carry-forward from prior session)
if grep -rnE "APP_VERSION\s*=\s*['\"][0-9]+\.[0-9]+\.[0-9]+['\"]" \
    "$ROOT/frontend/src" \
    --include="*.ts" --include="*.tsx" 2>/dev/null; then
    echo
    echo "REGRESSION (hardcoded APP_VERSION in frontend/src/):"
    grep -rnE "APP_VERSION\s*=\s*['\"][0-9]+\.[0-9]+\.[0-9]+['\"]" \
        "$ROOT/frontend/src" \
        --include="*.ts" --include="*.tsx"
    echo "Use __APP_VERSION__ (Vite define from package.json) instead."
    errors=$((errors + 1))
fi

# -------- Subsystem lock-step (sync-versions --check) --------

# Confirms every derived subsystem (launcher pyproject + spec + init,
# plugin pyprojects, frontend package.json) carries the canonical
# version. Catches drift the per-file regression detectors above
# do not see (a hand-edited launcher version, a forgotten plugin
# pyproject bump). sync_versions.py exits 1 on any drift.
echo
echo "Subsystem lock-step:"
if ! python3 "$ROOT/scripts/sync_versions.py" --check >&2; then
    errors=$((errors + 1))
fi

echo
echo "Reminder: external Bibliogon-owned deps (manuscripta,"
echo "pluginforge) are NOT auto-synced. Verify their pins in"
echo "backend/pyproject.toml + plugins/*/pyproject.toml manually"
echo "at release time per release-workflow.md Step 4."
echo

if [[ $errors -gt 0 ]]; then
    echo "$errors version-pin issue(s) found. Fix before tagging."
    exit 1
fi

echo "All canonical version sources match $EXPECTED. Derivations clean."
