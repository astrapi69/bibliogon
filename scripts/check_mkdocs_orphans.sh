#!/usr/bin/env bash
# Adversarial check: fail loud when MkDocs reports an orphan page.
#
# Why this script exists: `mkdocs build --strict` does NOT fail on
# orphan pages because the "not included in the 'nav' configuration"
# message is logged at INFO level, which --strict ignores. Two pages
# (articles/bulk-export.md, install/docker-desktop.md) sat orphan in
# the public docs site for two release cycles before the v0.30.0
# docs+i18n drift audit caught them. Surfaced as a v0.30.0
# retrospective finding ("verify the gate before trusting it").
#
# This script greps the mkdocs build output for the exact INFO-level
# string and exits non-zero if any orphan is found outside the
# explicit ALLOWLIST (intentional internal contributor files).
#
# Usage:
#   bash scripts/check_mkdocs_orphans.sh
#
# Exits:
#   0 — no orphans, or only allowlisted orphans
#   1 — at least one non-allowlisted orphan page
#   2 — mkdocs build itself failed (independent of orphans)

set -uo pipefail

# Files allowed to exist on disk without a nav entry. Any addition
# here needs a comment explaining why the file is intentionally
# unreachable from the public docs site.
ALLOWLIST=(
  # Internal contributor file: a TODO list of screenshots that need
  # updating before next major release. Not user-facing; surfaces
  # in the docs/help/ directory because contributors edit it
  # alongside the help pages it tracks.
  "SCREENSHOTS-TODO.md"
)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/docs"

# Run mkdocs build in strict mode and capture the full output.
output=$(poetry run mkdocs build --strict --config-file ../mkdocs.yml 2>&1)
build_rc=$?

if [[ $build_rc -ne 0 ]]; then
  echo "ERROR: mkdocs build --strict failed (exit $build_rc):" >&2
  echo "$output" >&2
  exit 2
fi

# Extract the orphan-page lines. The exact phrase MkDocs 1.6 emits is:
#   INFO    -  The following pages exist in the docs directory, but are not included in the "nav" configuration:
#     - <path>
#     - <path>
# We look for the lead-in phrase, then capture each indented "  -"
# line that follows.
orphans=$(echo "$output" | awk '
  /not included in the "nav" configuration/ { capture=1; next }
  capture && /^  - / { print substr($0, 5); next }
  capture && !/^  - / { capture=0 }
')

# Filter out allowlisted entries.
unexpected=()
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  allowed=0
  for permitted in "${ALLOWLIST[@]}"; do
    if [[ "$line" == "$permitted" ]]; then
      allowed=1
      break
    fi
  done
  if [[ $allowed -eq 0 ]]; then
    unexpected+=("$line")
  fi
done <<< "$orphans"

if [[ ${#unexpected[@]} -gt 0 ]]; then
  echo "ERROR: orphan pages detected (not in mkdocs.yml nav):" >&2
  for entry in "${unexpected[@]}"; do
    # Deduplicate (each orphan is reported once per language build).
    echo "  - $entry" >&2
  done | sort -u >&2
  echo "" >&2
  echo "Add the page to mkdocs.yml nav (and docs/help/_meta.yaml" >&2
  echo "for help pages), or add it to the ALLOWLIST in this script" >&2
  echo "with a comment explaining why it is intentionally unreachable." >&2
  exit 1
fi

echo "OK: no unexpected orphan pages."
exit 0
