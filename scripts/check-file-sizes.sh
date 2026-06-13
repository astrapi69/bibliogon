#!/usr/bin/env bash
# check-file-sizes.sh - cohesion watcher for CI
#
# Two thresholds:
#   WARN_THRESHOLD (default 500)   - warning in the PR, no fail
#   ERROR_THRESHOLD (default 1000) - CI blocks the merge
#
# Two lists (same format: one path per line, # = comment):
#   .filesize-whitelist - deliberately large, cohesive files (data models,
#                         schemas, static data). Permanently allowed.
#   .filesize-baseline  - already existing god-files (mixed concerns) that
#                         still need to be split. Frozen at "no worse than
#                         today": they do NOT block the merge, but new
#                         god-files do. Each entry is a split TODO; do not
#                         add new entries.
#
# Tests and generated directories (mutants/, dev-dist/, site/, coverage/)
# are NOT checked - the policy targets production source code.
#
# Exit codes:
#   0 = all clean, only warnings, or only baseline debt
#   1 = at least one NEW file over ERROR_THRESHOLD (not whitelisted and not
#       in the baseline)

set -euo pipefail

WARN_THRESHOLD="${WARN_THRESHOLD:-500}"
ERROR_THRESHOLD="${ERROR_THRESHOLD:-1000}"
WHITELIST_FILE=".filesize-whitelist"
BASELINE_FILE=".filesize-baseline"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Load lists ---
load_list() {
    local file="$1"
    [[ -f "$file" ]] || return 0
    while IFS= read -r line; do
        line="${line%%#*}"        # strip comments
        line="${line// /}"        # trim whitespace
        [[ -z "$line" ]] && continue
        printf '%s\n' "$line"
    done < "$file"
}

declare -A WHITELISTED
while IFS= read -r entry; do WHITELISTED["$entry"]=1; done < <(load_list "$WHITELIST_FILE")

declare -A BASELINED
while IFS= read -r entry; do BASELINED["$entry"]=1; done < <(load_list "$BASELINE_FILE")

# --- Find files ---
# Production source code (Python + TypeScript/JavaScript/JSX/TSX), without
# generated directories and without tests.
FILES=$(find . \
    -type f \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*" \
    ! -path "*/build/*" \
    ! -path "*/__pycache__/*" \
    ! -path "*/migrations/*" \
    ! -path "*/.venv/*" \
    ! -path "*/venv/*" \
    ! -path "*/.git/*" \
    ! -path "*/coverage/*" \
    ! -path "*/.next/*" \
    ! -path "*/mutants/*" \
    ! -path "*/dev-dist/*" \
    ! -path "./site/*" \
    ! -path "*/htmlcov/*" \
    ! -path "*/tests/*" \
    ! -path "./e2e/*" \
    ! -name "*.test.*" \
    ! -name "*.spec.*" \
    ! -name "test_*.py" \
    ! -name "*_test.py" \
    | sort)

# --- Count and evaluate ---
warnings=0
errors=0
grandfathered=0
total_checked=0

printf "\n=== Cohesion check: file sizes ===\n"
printf "Warn threshold: %d lines | Error threshold: %d lines\n\n" "$WARN_THRESHOLD" "$ERROR_THRESHOLD"

for filepath in $FILES; do
    # Normalize path (./foo/bar.py -> foo/bar.py)
    relpath="${filepath#./}"
    lines=$(wc -l < "$filepath")
    total_checked=$((total_checked + 1))

    if [[ "$lines" -gt "$ERROR_THRESHOLD" ]]; then
        if [[ -n "${WHITELISTED[$relpath]:-}" ]]; then
            printf "  SKIP  %6d  %s  (whitelisted)\n" "$lines" "$relpath"
        elif [[ -n "${BASELINED[$relpath]:-}" ]]; then
            printf "  BASE  %6d  %s  (grandfathered debt - split TODO)\n" "$lines" "$relpath"
            grandfathered=$((grandfathered + 1))
        else
            printf "  ERROR %6d  %s\n" "$lines" "$relpath"
            errors=$((errors + 1))
        fi
    elif [[ "$lines" -gt "$WARN_THRESHOLD" ]]; then
        if [[ -n "${WHITELISTED[$relpath]:-}" ]]; then
            printf "  SKIP  %6d  %s  (whitelisted)\n" "$lines" "$relpath"
        elif [[ -n "${BASELINED[$relpath]:-}" ]]; then
            printf "  BASE  %6d  %s  (grandfathered debt - split TODO)\n" "$lines" "$relpath"
            grandfathered=$((grandfathered + 1))
        else
            printf "  WARN  %6d  %s\n" "$lines" "$relpath"
            warnings=$((warnings + 1))
        fi
    fi
done

# --- Stale-baseline hint: entries that now sit below the warn threshold
#     (e.g. after a split) should be removed from the baseline so the
#     ratchet engages. ---
stale=0
for entry in "${!BASELINED[@]}"; do
    if [[ -f "$entry" ]]; then
        elines=$(wc -l < "$entry")
        if [[ "$elines" -le "$WARN_THRESHOLD" ]]; then
            printf "  NOTE  %6d  %s  (below threshold - remove from .filesize-baseline)\n" "$elines" "$entry"
            stale=$((stale + 1))
        fi
    else
        printf "  NOTE       -  %s  (baseline path no longer exists - remove entry)\n" "$entry"
        stale=$((stale + 1))
    fi
done

printf "\n--- Result ---\n"
printf "Checked: %d files\n" "$total_checked"
printf "Warnings: %d (> %d lines)\n" "$warnings" "$WARN_THRESHOLD"
printf "Grandfathered: %d (baseline debt, > %d lines)\n" "$grandfathered" "$ERROR_THRESHOLD"
printf "Errors: %d (new files > %d lines)\n" "$errors" "$ERROR_THRESHOLD"
[[ "$stale" -gt 0 ]] && printf "Stale baseline entries: %d\n" "$stale"

if [[ "$errors" -gt 0 ]]; then
    printf "\nCohesion policy violated. %d new file(s) over %d lines.\n" "$errors" "$ERROR_THRESHOLD"
    printf "Options: split them, or (only for deliberately cohesive files)\n"
    printf "add them to .filesize-whitelist (with a justification).\n"
    printf "God-files with mixed concerns do NOT belong on the whitelist.\n"
    exit 1
fi

if [[ "$warnings" -gt 0 ]]; then
    printf "\n%d file(s) over %d lines. Not a blocker, but refactoring recommended.\n" "$warnings" "$WARN_THRESHOLD"
fi

printf "\nCohesion check passed.\n"
exit 0
