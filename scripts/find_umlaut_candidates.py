#!/usr/bin/env python3
"""Find ASCII umlaut candidates in German i18n and docs files.

Scans for known German words that use ae/oe/ue/ss instead of real
umlauts and reports them as replacement candidates. Does NOT auto-replace.

Usage: python scripts/find_umlaut_candidates.py [--replace]
"""

import re
import sys
from pathlib import Path

# Known German words: ASCII -> correct umlaut form.
# Only words where the replacement is unambiguous.
REPLACEMENTS: dict[str, str] = {
    # ae -> ae
    "Aenderung": "Änderung", "Aenderungen": "Änderungen", "aendern": "ändern",
    "aendert": "ändert", "geaendert": "geändert",
    "Aerger": "Ärger", "aergerlich": "ärgerlich",
    "aehnlich": "ähnlich", "Aehnlichkeit": "Ähnlichkeit",
    "aeltere": "ältere", "Aeltere": "Ältere",
    "Aerzte": "Ärzte",
    "Aufzaehlung": "Aufzählung",
    "Erklaerung": "Erklärung",
    "Erzaehlung": "Erzählung",
    "Geraet": "Gerät", "Geraete": "Geräte",
    "haeufig": "häufig", "Haeufig": "Häufig",
    "Laenge": "Länge",
    "naechste": "nächste", "Naechste": "Nächste", "naechsten": "nächsten",
    "spaeter": "später", "Spaeter": "Später",
    "Sprachwahl": "Sprachwahl",  # no change needed
    "waehlen": "wählen", "Waehlen": "Wählen", "waehle": "wähle",
    "Waehrend": "Während", "waehrend": "während",
    "Erklaerungen": "Erklärungen",
    "verfuegbar": "verfügbar", "Verfuegbar": "Verfügbar", "Verfuegbare": "Verfügbare",
    "verfuegbare": "verfügbare",
    "Unterstuetzung": "Unterstützung",
    "zurueck": "zurück", "Zurueck": "Zurück",
    "Rueckgaengig": "Rückgängig", "rueckgaengig": "rückgängig",
    "Ueberschrift": "Überschrift", "Uebersicht": "Übersicht",
    "uebernehmen": "übernehmen", "Uebernehmen": "Übernehmen",
    "ueberpruefen": "überprüfen",
    "Uebersetzer": "Übersetzer", "Uebersetzung": "Übersetzung",
    "ueberspringen": "überspringen", "uebersprungen": "übersprungen",
    "ueber": "über", "Ueber": "Über",
    # oe -> oe
    "Loeschen": "Löschen", "loeschen": "löschen", "geloescht": "gelöscht",
    "Loesung": "Lösung", "Loesungen": "Lösungen",
    "moeglich": "möglich", "Moeglich": "Möglich",
    "Moeglichkeit": "Möglichkeit", "Moeglichkeiten": "Möglichkeiten",
    "moechte": "möchte", "moechten": "möchten",
    "noetig": "nötig",
    "oeffnen": "öffnen", "Oeffnen": "Öffnen", "oeffnet": "öffnet", "geoeffnet": "geöffnet",
    "Oeffentlich": "Öffentlich", "oeffentlich": "öffentlich",
    "hoeren": "hören", "Vorhoeren": "Vorhören", "vorhoeren": "vorhören",
    "stoeren": "stören",
    "Woerter": "Wörter", "Woertern": "Wörtern",
    "groesser": "größer", "Groesse": "Größe",
    # ue -> ue
    "fuer": "für", "Fuer": "Für",
    "Fuellwort": "Füllwort", "Fuellwoerter": "Füllwörter",
    "fuegen": "fügen", "hinzufuegen": "hinzufügen", "Hinzufuegen": "Hinzufügen",
    "einfuegen": "einfügen",
    "Kuerzel": "Kürzel",
    "kuerzen": "kürzen",
    "Luecke": "Lücke", "Luecken": "Lücken",
    "muessen": "müssen",
    "pruefen": "prüfen", "Pruefen": "Prüfen", "pruefe": "prüfe", "geprueft": "geprüft",
    "Pruefung": "Prüfung",
    "Schluessel": "Schlüssel", "schluessel": "schlüssel",
    "Stueck": "Stück",
    "Unterstuetzen": "Unterstützen",
    "wuerde": "würde",
    "Wuensche": "Wünsche",
    "zuruecksetzen": "zurücksetzen",
    # ss -> ss (only specific words where ss should be sharp s)
    "Strasse": "Straße", "Strassen": "Straßen",
    "grosse": "große", "Grosse": "Große", "grosser": "großer", "grosses": "großes",
    "Fuss": "Fuß",
    "Spass": "Spaß",
    "schliessen": "schließen", "Schliessen": "Schließen",
    "ausschliesslich": "ausschließlich",
    "Mass": "Maß", "Masse": "Maße",
    "gemass": "gemäß", "Gemass": "Gemäß",
    # Common toolbar/UI terms
    "Linksbuendig": "Linksbündig", "linksbuendig": "linksbündig",
    "Rechtsbuendig": "Rechtsbündig", "rechtsbuendig": "rechtsbündig",
    "Rechtschreibpruefung": "Rechtschreibprüfung",
    "Fehlerbehebung": "Fehlerbehebung",  # correct already
    "Tastenkuerzel": "Tastenkürzel",
}

# Files to scan
SCAN_PATTERNS = [
    "backend/config/i18n/de.yaml",
    "docs/help/de/**/*.md",
    "backend/config/plugins/*.yaml",
]


def find_candidates(root: Path) -> list[tuple[Path, str, str, int]]:
    """Return (file, old, new, count) tuples."""
    results = []
    for pattern in SCAN_PATTERNS:
        for filepath in root.glob(pattern):
            try:
                content = filepath.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            for old, new in REPLACEMENTS.items():
                if old == new:
                    continue
                count = content.count(old)
                if count > 0:
                    results.append((filepath.relative_to(root), old, new, count))
    return results


def apply_replacements(root: Path) -> int:
    """Apply all known replacements. Returns total replacement count."""
    total = 0
    for pattern in SCAN_PATTERNS:
        for filepath in root.glob(pattern):
            try:
                content = filepath.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            original = content
            for old, new in REPLACEMENTS.items():
                if old == new:
                    continue
                content = content.replace(old, new)
            if content != original:
                filepath.write_text(content, encoding="utf-8")
                changes = sum(1 for o, n in REPLACEMENTS.items() if o != n and o in original)
                total += changes
                print(f"  Updated: {filepath.relative_to(root)}")
    return total


def main():
    root = Path(__file__).resolve().parent.parent
    replace = "--replace" in sys.argv

    if not replace:
        candidates = find_candidates(root)
        if not candidates:
            print("No umlaut candidates found.")
            return
        print(f"Found {len(candidates)} replacement candidates:\n")
        for filepath, old, new, count in sorted(candidates):
            print(f"  {filepath}: {old!r} -> {new!r} ({count}x)")
        print(f"\nRun with --replace to apply.")
    else:
        print("Applying umlaut replacements...")
        total = apply_replacements(root)
        print(f"\nDone. {total} files updated.")


if __name__ == "__main__":
    main()
