#!/usr/bin/env bash
# Generate install.sh from install.sh.template, substituting
# @@BIBLIOGON_VERSION@@ with the version from backend/pyproject.toml.
#
# Run during release-workflow Step 4. The committed install.sh is
# the artifact users curl-pipe; the template is the editable source.
#
# Usage: scripts/generate_install_sh.sh
# Verify-only: scripts/generate_install_sh.sh --check
#   exits 0 if install.sh matches what regeneration would produce,
#   non-zero otherwise. Used by verify_version_pins.sh.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/install.sh.template"
TARGET="$ROOT/install.sh"
PYPROJECT="$ROOT/backend/pyproject.toml"

if [[ ! -f "$TEMPLATE" ]]; then
    echo "ERROR: template missing: $TEMPLATE" >&2
    exit 2
fi

if [[ ! -f "$PYPROJECT" ]]; then
    echo "ERROR: pyproject missing: $PYPROJECT" >&2
    exit 2
fi

# Extract version from backend/pyproject.toml (under [tool.poetry])
VERSION=$(grep -m1 -E '^version\s*=' "$PYPROJECT" \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' \
    | head -1)

if [[ -z "$VERSION" ]]; then
    echo "ERROR: could not extract version from $PYPROJECT" >&2
    exit 2
fi

# Tag form is v-prefixed (matches GitHub release tags)
TAG="v$VERSION"

# Generate by substituting placeholder
generated=$(sed "s|@@BIBLIOGON_VERSION@@|$TAG|g" "$TEMPLATE")

if [[ "${1:-}" == "--check" ]]; then
    if [[ ! -f "$TARGET" ]]; then
        echo "ERROR: $TARGET missing; run $0 to regenerate." >&2
        exit 1
    fi
    if ! diff -q <(printf '%s\n' "$generated") "$TARGET" >/dev/null 2>&1; then
        echo "ERROR: install.sh out of sync with template + pyproject." >&2
        echo "Run scripts/generate_install_sh.sh to regenerate." >&2
        exit 1
    fi
    echo "OK: install.sh matches template substituted with $TAG."
    exit 0
fi

printf '%s\n' "$generated" > "$TARGET"
chmod +x "$TARGET"
echo "Generated $TARGET with VERSION=$TAG."
