#!/usr/bin/env bash
# check-file-sizes.sh - Kohäsions-Watcher für CI
#
# Zwei Schwellenwerte:
#   WARN_THRESHOLD (default 500)   - Warnung im PR, kein Fail
#   ERROR_THRESHOLD (default 1000) - CI blockiert den Merge
#
# Zwei Listen (gleiches Format: ein Pfad pro Zeile, # = Kommentar):
#   .filesize-whitelist - bewusst grosse, kohäsive Dateien (Datenmodelle,
#                         Schemas, statische Daten). Dauerhaft erlaubt.
#   .filesize-baseline  - bereits existierende God-Files (gemischte Concerns),
#                         die noch gesplittet werden muessen. Eingefroren auf
#                         "nicht schlimmer als heute": sie blocken den Merge
#                         NICHT, aber neue God-Files schon. Jeder Eintrag ist
#                         ein Split-TODO; keine neuen Eintraege hinzufuegen.
#
# Tests und generierte Verzeichnisse (mutants/, dev-dist/, site/, coverage/)
# werden NICHT geprueft - die Richtlinie zielt auf Produktiv-Quellcode.
#
# Exit-Codes:
#   0 = alles sauber, nur Warnungen, oder nur Baseline-Schuld
#   1 = mindestens eine NEUE Datei ueber ERROR_THRESHOLD (nicht ge-whitelistet
#       und nicht in der Baseline)

set -euo pipefail

WARN_THRESHOLD="${WARN_THRESHOLD:-500}"
ERROR_THRESHOLD="${ERROR_THRESHOLD:-1000}"
WHITELIST_FILE=".filesize-whitelist"
BASELINE_FILE=".filesize-baseline"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Listen laden ---
load_list() {
    local file="$1"
    [[ -f "$file" ]] || return 0
    while IFS= read -r line; do
        line="${line%%#*}"        # Kommentare entfernen
        line="${line// /}"        # Whitespace trimmen
        [[ -z "$line" ]] && continue
        printf '%s\n' "$line"
    done < "$file"
}

declare -A WHITELISTED
while IFS= read -r entry; do WHITELISTED["$entry"]=1; done < <(load_list "$WHITELIST_FILE")

declare -A BASELINED
while IFS= read -r entry; do BASELINED["$entry"]=1; done < <(load_list "$BASELINE_FILE")

# --- Dateien finden ---
# Produktiv-Quellcode (Python + TypeScript/JavaScript/JSX/TSX), ohne
# generierte Verzeichnisse und ohne Tests.
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

# --- Zaehlen und bewerten ---
warnings=0
errors=0
grandfathered=0
total_checked=0

printf "\n=== Kohäsions-Check: Dateigrößen ===\n"
printf "Warn-Schwelle: %d Zeilen | Error-Schwelle: %d Zeilen\n\n" "$WARN_THRESHOLD" "$ERROR_THRESHOLD"

for filepath in $FILES; do
    # Pfad normalisieren (./foo/bar.py -> foo/bar.py)
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

# --- Stale-Baseline-Hinweis: Eintraege, die jetzt unter der Warn-Schwelle
#     liegen (z.B. nach einem Split), sollten aus der Baseline entfernt werden,
#     damit die Ratsche greift. ---
stale=0
for entry in "${!BASELINED[@]}"; do
    if [[ -f "$entry" ]]; then
        elines=$(wc -l < "$entry")
        if [[ "$elines" -le "$WARN_THRESHOLD" ]]; then
            printf "  NOTE  %6d  %s  (unter Schwelle - aus .filesize-baseline entfernen)\n" "$elines" "$entry"
            stale=$((stale + 1))
        fi
    else
        printf "  NOTE       -  %s  (Baseline-Pfad existiert nicht mehr - Eintrag entfernen)\n" "$entry"
        stale=$((stale + 1))
    fi
done

printf "\n--- Ergebnis ---\n"
printf "Geprüft: %d Dateien\n" "$total_checked"
printf "Warnungen: %d (> %d Zeilen)\n" "$warnings" "$WARN_THRESHOLD"
printf "Grandfathered: %d (Baseline-Schuld, > %d Zeilen)\n" "$grandfathered" "$ERROR_THRESHOLD"
printf "Fehler: %d (neue Dateien > %d Zeilen)\n" "$errors" "$ERROR_THRESHOLD"
[[ "$stale" -gt 0 ]] && printf "Veraltete Baseline-Eintraege: %d\n" "$stale"

if [[ "$errors" -gt 0 ]]; then
    printf "\nKohäsions-Richtlinie verletzt. %d neue Datei(en) über %d Zeilen.\n" "$errors" "$ERROR_THRESHOLD"
    printf "Optionen: Aufsplitten oder (nur fuer bewusst kohäsive Dateien)\n"
    printf "in .filesize-whitelist eintragen (mit Begründung).\n"
    printf "God-Files mit gemischten Concerns gehoeren NICHT auf die Whitelist.\n"
    exit 1
fi

if [[ "$warnings" -gt 0 ]]; then
    printf "\n%d Datei(en) über %d Zeilen. Kein Blocker, aber Refactoring empfohlen.\n" "$warnings" "$WARN_THRESHOLD"
fi

printf "\nKohäsions-Check bestanden.\n"
exit 0
