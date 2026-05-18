#!/usr/bin/env bash
# Discover version-shape literals in unexpected locations.
#
# Closes the "closed-set discovery" gap identified by the
# release-automation audit (docs/audits/release-automation-audit-
# 2026-05-19.md Track D): scripts/verify_version_pins.sh's
# regression detectors only check the locations sync_versions.py
# KNOWS about. A future feature adding a new file with a
# ``version = "X.Y.Z"`` literal slips past every gate.
#
# This script greps for version-assignment patterns across the
# repo and prints any matches that fall OUTSIDE the known-target
# list (sync-versions Tier-1/2 + Tier-4 manual content). Used by:
#
# - scripts/verify_version_pins.sh — as a non-fatal WARNING
#   appended to the pre-tag validation chain.
# - ``make release-discover`` — as an on-demand discovery
#   report for release prep.
#
# Exit code: 0 ALWAYS. This is advisory, not a gate. A future
# session decides whether a finding should be added to
# sync_versions.py's collect_targets() or whether it's a
# legitimate one-off literal (e.g. test fixture).

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Known sync-versions Tier-1/2 propagated locations. Edits here
# MUST stay in lockstep with scripts/sync_versions.py's
# collect_targets() — keep the two lists synchronised when adding
# a new propagated file.
declare -a KNOWN_FILES=(
    "backend/pyproject.toml"
    "frontend/package.json"
    "frontend/package-lock.json"
    "launcher/pyproject.toml"
    "launcher/bibliogon_launcher/__init__.py"
    "launcher/bibliogon-launcher.spec"
    "install.sh"
    "install.ps1"
    "install.sh.template"
    "install.ps1.template"
)

# All plugin pyprojects (sync-versions propagates lock-step):
while IFS= read -r p; do
    KNOWN_FILES+=("${p#"$ROOT/"}")
done < <(find "$ROOT/plugins" -name "pyproject.toml" -type f 2>/dev/null)

# Per-plugin `version` class attribute on BasePlugin + the
# `__version__` sentinel fallback. CLAUDE.md "Plugin package
# versions are independent of the app version" — plugin authors
# maintain these explicitly, NOT via sync-versions.
while IFS= read -r p; do
    KNOWN_FILES+=("${p#"$ROOT/"}")
done < <(find "$ROOT/plugins" -path '*/bibliogon_*/plugin.py' -type f 2>/dev/null)
while IFS= read -r p; do
    KNOWN_FILES+=("${p#"$ROOT/"}")
done < <(find "$ROOT/plugins" -path '*/bibliogon_*/__init__.py' -type f 2>/dev/null)

# Tier-4 manual content (intentional version literals — release
# narrative, prose, changelog headers). These are author-managed
# and don't need automation discovery.
KNOWN_FILES+=(
    "CLAUDE.md"
    "docs/CHANGELOG.md"
    "docs/ROADMAP.md"
    "docs/backlog.md"
    "docs/pyproject.toml"
    ".github/RELEASE_TEMPLATE.md"
    "scripts/sync_versions.py"
    "scripts/verify_version_pins.sh"
    "scripts/discover_version_literals.sh"
    "scripts/generate_install_sh.sh"
)

# Build a fast lookup table.
declare -A KNOWN_SET=()
for f in "${KNOWN_FILES[@]}"; do
    KNOWN_SET["$f"]=1
done

# Patterns that anchor a version-assignment context (NOT random
# triples in code or dep ranges). Matches:
# - ``version = "X.Y.Z"``                (Poetry / pyproject)
# - ``"version": "X.Y.Z"``               (package.json, JSON locks)
# - ``__version__ = "X.Y.Z"``            (Python literal)
# - ``VERSION = "X.Y.Z"`` / APP_VERSION  (constant literals)
# - ``CFBundle*Version*"X.Y.Z"``         (Apple plist)
# Caret-prefixed dep ranges (``"^1.2.3"``) are NOT matched —
# we require a quoted bare semver, not a constraint.
PATTERN='(version[[:space:]]*=[[:space:]]*"|"version":[[:space:]]*"|__version__[[:space:]]*=[[:space:]]*"|APP_VERSION[[:space:]]*=[[:space:]]*"|^VERSION[[:space:]]*=[[:space:]]*"|CFBundle[A-Za-z]+:[[:space:]]*")[0-9]+\.[0-9]+\.[0-9]+'

cd "$ROOT" || exit 1

# Run the grep. Excludes cover the noise channels (lockfiles
# carry hundreds of nested dep versions; node_modules + .venv +
# build artifacts have unrelated semvers; per-release-notes /
# audits / journal explicitly mention versions in prose).
matches=$(
    grep -rEn "$PATTERN" \
        --include="*.py" --include="*.ts" --include="*.tsx" \
        --include="*.js" --include="*.jsx" --include="*.json" \
        --include="*.toml" --include="*.sh" --include="*.ps1" \
        --include="*.spec" --include="*.yaml" --include="*.yml" \
        --include="Makefile" \
        --exclude-dir=node_modules \
        --exclude-dir=.venv \
        --exclude-dir=venv \
        --exclude-dir=.git \
        --exclude-dir=dist \
        --exclude-dir=build \
        --exclude-dir=coverage \
        --exclude-dir=htmlcov \
        --exclude-dir=__pycache__ \
        --exclude-dir=.pytest_cache \
        --exclude-dir=mutants \
        --exclude-dir=tests \
        --exclude-dir=site \
        --exclude="package-lock.json" \
        --exclude="poetry.lock" \
        --exclude="*.lock" \
        --exclude="_build_info.py" \
        . 2>/dev/null \
    | grep -v ":[[:space:]]*#" \
    || true
)

# Print only matches NOT in the known-target set.
unknown_count=0
while IFS= read -r line; do
    [ -z "$line" ] && continue
    file="${line%%:*}"
    file="${file#./}"
    if [ -z "${KNOWN_SET[$file]+x}" ]; then
        echo "$line"
        unknown_count=$((unknown_count + 1))
    fi
done <<< "$matches"

# Footer summary (suppressed when no findings, to keep
# verify-version-pins output clean on green runs):
if [ $unknown_count -gt 0 ]; then
    echo ""
    echo "Found $unknown_count version-shape literal(s) outside the"
    echo "known sync-versions target list. Either:"
    echo "  - Add the file to sync_versions.py collect_targets()"
    echo "    if it should be auto-propagated, OR"
    echo "  - Add the file to KNOWN_FILES in this script if the"
    echo "    literal is intentional (test fixture, sample, etc.)."
fi

# Always exit 0 — advisory only.
exit 0
