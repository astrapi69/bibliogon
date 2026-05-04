#!/usr/bin/env python3
"""Find ASCII-transliterated German tokens in in-scope files.

Whitelist-based: only known German words are considered. No regex
guessing. False negatives are acceptable; false positives are not.

Output: JSON report at /tmp/umlaut-candidates.json (or path passed
via ``--output``), suitable for review and as input to
``replace_umlauts.py``.

Code-region aware: fenced code blocks (```...```), inline code
(`...`), and indented code blocks are masked before scanning so
identifiers + technical terms inside code never become candidates.

The replacer in ``scripts/replace_umlauts.py`` reuses the same
KNOWN_WORDS map and the same masking logic.

Usage:
    python3 scripts/find_umlaut_candidates.py [FILE_LIST] [--output PATH]

FILE_LIST defaults to /tmp/in-scope-files.txt (one path per line,
relative to repo root or absolute). Lines starting with ``#`` and
blank lines are ignored.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Verified German word mappings. Format: ASCII -> proper UTF-8.
# When in doubt, leave out. Better to miss a word than to corrupt one.
#
# DO NOT add: Buch (no umlaut), messen + Genuss (short vowel: ss
# stays). gekonnt (past participle of "können" has no umlaut in
# correct German).
KNOWN_WORDS: dict[str, str] = {
    # ue -> u-Umlaut
    "ueber": "über", "Ueber": "Über",
    "fuer": "für", "Fuer": "Für",
    "dafuer": "dafür", "Dafuer": "Dafür",
    "wofuer": "wofür", "Wofuer": "Wofür",
    "hierfuer": "hierfür", "Hierfuer": "Hierfür",
    "fuehrt": "führt", "fuehren": "führen", "gefuehrt": "geführt",
    "ausfuehren": "ausführen", "ausgefuehrt": "ausgeführt",
    "Einfuehrung": "Einführung",
    "ueberpruefen": "überprüfen", "Ueberpruefung": "Überprüfung",
    "ueberprueft": "überprüft", "Ueberprueft": "Überprüft",
    "muessen": "müssen", "muesste": "müsste", "muessten": "müssten",
    "duerfen": "dürfen", "duerfte": "dürfte",
    "wuerde": "würde", "wuerden": "würden",
    "koennen": "können", "koennte": "könnte", "koennten": "könnten",
    "koenntest": "könntest",
    "Schluessel": "Schlüssel", "schluessel": "schlüssel",
    "Stueck": "Stück", "Luecke": "Lücke", "Luecken": "Lücken",
    "zurueck": "zurück", "Zurueck": "Zurück",
    "zuruecksetzen": "zurücksetzen",
    "Buecher": "Bücher", "Buechern": "Büchern",
    "Buecherregal": "Bücherregal", "buecherregal": "bücherregal",
    "Pruefung": "Prüfung", "Pruefer": "Prüfer",
    "pruefen": "prüfen", "Pruefen": "Prüfen", "pruefe": "prüfe",
    "geprueft": "geprüft", "Geprueft": "Geprüft",
    "fuegen": "fügen", "hinzufuegen": "hinzufügen", "Hinzufuegen": "Hinzufügen",
    "einfuegen": "einfügen",
    "Kuerzel": "Kürzel", "Tastenkuerzel": "Tastenkürzel",
    "kuerzen": "kürzen",
    "Verfuegbar": "Verfügbar", "verfuegbar": "verfügbar",
    "Verfuegbare": "Verfügbare", "verfuegbare": "verfügbare",
    "Unterstuetzung": "Unterstützung",
    "Unterstuetzen": "Unterstützen",
    "Rueckgaengig": "Rückgängig", "rueckgaengig": "rückgängig",
    "Ueberschrift": "Überschrift", "Uebersicht": "Übersicht",
    "uebernehmen": "übernehmen", "Uebernehmen": "Übernehmen",
    "Uebersetzer": "Übersetzer", "Uebersetzung": "Übersetzung",
    "ueberspringen": "überspringen", "uebersprungen": "übersprungen",
    "Wuensche": "Wünsche", "wuenschen": "wünschen",
    "Fuellwort": "Füllwort", "Fuellwoerter": "Füllwörter",
    "Linksbuendig": "Linksbündig", "linksbuendig": "linksbündig",
    "Rechtsbuendig": "Rechtsbündig", "rechtsbuendig": "rechtsbündig",
    "Rechtschreibpruefung": "Rechtschreibprüfung",
    "Truebung": "Trübung",
    # oe -> o-Umlaut
    "moechte": "möchte", "moechten": "möchten",
    "moeglich": "möglich", "Moeglich": "Möglich",
    "Moeglichkeit": "Möglichkeit",
    "Moeglichkeiten": "Möglichkeiten",
    "loeschen": "löschen", "Loeschen": "Löschen", "geloescht": "gelöscht",
    "loese": "löse", "Loese": "Löse",
    "geloest": "gelöst", "Loesung": "Lösung", "Loesungen": "Lösungen",
    "schoen": "schön", "Schoenheit": "Schönheit",
    "hoeher": "höher", "Hoehe": "Höhe",
    "Goettin": "Göttin",
    "noetig": "nötig",
    "oeffnen": "öffnen", "Oeffnen": "Öffnen",
    "oeffnet": "öffnet", "geoeffnet": "geöffnet",
    "Oeffentlich": "Öffentlich", "oeffentlich": "öffentlich",
    "hoeren": "hören", "Vorhoeren": "Vorhören", "vorhoeren": "vorhören",
    "stoeren": "stören",
    "Woerter": "Wörter", "Woertern": "Wörtern",
    # ae -> a-Umlaut
    "aendern": "ändern", "Aendern": "Ändern",
    "aenderbar": "änderbar", "abaendern": "abändern",
    "unveraendert": "unverändert",
    "Aenderung": "Änderung",
    "Aenderungen": "Änderungen", "geaendert": "geändert",
    "aendert": "ändert",
    "waehlen": "wählen", "Waehlen": "Wählen",
    "waehle": "wähle", "gewaehlt": "gewählt",
    "Waehrend": "Während", "waehrend": "während",
    "naechste": "nächste", "Naechste": "Nächste",
    "naechsten": "nächsten", "naechster": "nächster",
    "spaeter": "später", "Spaeter": "Später",
    "Spaetere": "Spätere",
    "Maerz": "März",
    "haette": "hätte", "haetten": "hätten",
    "waere": "wäre", "waeren": "wären",
    "Aerger": "Ärger", "aergerlich": "ärgerlich",
    "aergern": "ärgern",
    "aehnlich": "ähnlich", "Aehnlichkeit": "Ähnlichkeit",
    "aeltere": "ältere", "Aeltere": "Ältere",
    "Aerzte": "Ärzte",
    "Aufzaehlung": "Aufzählung",
    "Erklaerung": "Erklärung", "Erklaerungen": "Erklärungen",
    "Erzaehlung": "Erzählung",
    "Geraet": "Gerät", "Geraete": "Geräte",
    "haeufig": "häufig", "Haeufig": "Häufig",
    "Laenge": "Länge",
    # ss -> sharp-s (long-vowel words only; conservative list)
    "Strasse": "Straße", "Strassen": "Straßen",
    "grosse": "große", "Grosse": "Große",
    "grosser": "großer", "grosses": "großes",
    "Groesse": "Größe", "groesser": "größer",
    "Fuss": "Fuß", "Fuesse": "Füße",
    "heissen": "heißen", "heisst": "heißt",
    "weiss": "weiß", "Weisse": "Weiße",
    "draussen": "draußen",
    "ausschliesslich": "ausschließlich",
    "schliesslich": "schließlich",
    "schliessen": "schließen", "Schliessen": "Schließen",
    "geschlossen": "geschlossen",  # already correct, identity (kept for clarity)
    "geniessen": "genießen", "geniesst": "genießt",
    "Mass": "Maß", "Masse": "Maße",
    "gemass": "gemäß", "Gemass": "Gemäß",
    "Spass": "Spaß",
    "Fuesse": "Füße",
    # Coverage additions surfaced via second-pass scan (2026-05-04).
    "gruen": "grün", "Gruen": "Grün",
    "gruene": "grüne", "Gruene": "Grüne",
    "gruener": "grüner", "gruenes": "grünes",
    "laeuft": "läuft",
    "ergaenzt": "ergänzt", "ergaenzen": "ergänzen",
    "Ergaenzung": "Ergänzung", "Ergaenzungen": "Ergänzungen",
    "Pruefe": "Prüfe",
    "prueft": "prüft", "Prueft": "Prüft",
    "enthaelt": "enthält",
    "Eintraege": "Einträge",
    "Fuege": "Füge",
    "Optimierungsvorschlaege": "Optimierungsvorschläge",
    "unabhaengig": "unabhängig",
    "bestaetigen": "bestätigen", "bestaetigt": "bestätigt",
    "Bestaetigung": "Bestätigung",
    "hinzugefuegt": "hinzugefügt",
    "Veroeffentlicht": "Veröffentlicht", "veroeffentlicht": "veröffentlicht",
    "veroeffentlichen": "veröffentlichen",
    "Veroeffentlichung": "Veröffentlichung",
    "Abhaengigkeit": "Abhängigkeit",
    "Abhaengigkeiten": "Abhängigkeiten",
    "abhaengig": "abhängig",
    "haelt": "hält",
    "faellt": "fällt", "gefaellt": "gefällt",
}

# Identity entries get filtered at runtime (skip if old == new).

# Per-word boundary-aware regex.
WORD_PATTERNS = {
    ascii_word: re.compile(rf"\b{re.escape(ascii_word)}\b")
    for ascii_word in KNOWN_WORDS
}

# Markdown code-block / inline-code regions: skip these entirely.
FENCED_BLOCK = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE = re.compile(r"`[^`\n]+`")
INDENTED_CODE = re.compile(r"(?m)^(?: {4}|\t).*$")


def mask_code_regions(text: str) -> tuple[str, list[tuple[int, int, str]]]:
    """Replace code regions with placeholders. Return masked text + map."""
    spans: list[tuple[int, int, str]] = []
    for pat in (FENCED_BLOCK, INLINE_CODE, INDENTED_CODE):
        for m in pat.finditer(text):
            spans.append((m.start(), m.end(), m.group(0)))
    spans.sort()

    # Merge overlapping
    merged: list[tuple[int, int, str]] = []
    for s, e, _content in spans:
        if merged and s <= merged[-1][1]:
            ps, pe, _pc = merged[-1]
            new_end = max(pe, e)
            merged[-1] = (ps, new_end, text[ps:new_end])
        else:
            merged.append((s, e, text[s:e]))

    placeholders: list[tuple[int, int, str]] = []
    out: list[str] = []
    last = 0
    for s, e, content in merged:
        out.append(text[last:s])
        out.append(f"\x00CODE{len(placeholders)}\x00")
        placeholders.append((s, e, content))
        last = e
    out.append(text[last:])
    return "".join(out), placeholders


def find_in_file(path: Path) -> list[dict]:
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError) as exc:
        return [{"error": f"cannot read: {exc}"}]

    masked, _placeholders = mask_code_regions(text)
    findings: list[dict] = []
    for ascii_word, pattern in WORD_PATTERNS.items():
        replacement = KNOWN_WORDS[ascii_word]
        if ascii_word == replacement:
            continue
        matches = list(pattern.finditer(masked))
        if matches:
            findings.append(
                {
                    "word": ascii_word,
                    "replacement": replacement,
                    "count": len(matches),
                    "lines": sorted(
                        {masked[: m.start()].count("\n") + 1 for m in matches}
                    ),
                }
            )
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "file_list",
        nargs="?",
        default="/tmp/in-scope-files.txt",
        help="File listing in-scope paths (default /tmp/in-scope-files.txt).",
    )
    parser.add_argument(
        "--output",
        default="/tmp/umlaut-candidates.json",
        help="JSON output path (default /tmp/umlaut-candidates.json).",
    )
    args = parser.parse_args()

    list_path = Path(args.file_list)
    if not list_path.is_file():
        print(f"error: file list not found: {list_path}", file=sys.stderr)
        return 2

    files = [
        Path(line.strip())
        for line in list_path.read_text().splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]

    report: dict[str, list[dict]] = {}
    for f in files:
        if not f.is_file():
            continue
        findings = find_in_file(f)
        if findings and not (
            len(findings) == 1 and findings[0].get("error")
        ):
            report[str(f)] = findings

    out_path = Path(args.output)
    out_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    total_files = len(report)
    total_words = sum(len(v) for v in report.values())
    total_occurrences = sum(
        item["count"]
        for v in report.values()
        for item in v
        if "count" in item
    )
    print(f"Files with candidates: {total_files}")
    print(f"Distinct words:        {total_words}")
    print(f"Total occurrences:     {total_occurrences}")
    print(f"Report:                {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
