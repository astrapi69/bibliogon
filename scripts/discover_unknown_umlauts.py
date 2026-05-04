#!/usr/bin/env python3
"""Discover ASCII transliteration patterns NOT yet in KNOWN_WORDS.

Complements ``find_umlaut_candidates.py`` (which only flags words
that ARE in the whitelist). This script does the inverse: scans
in-scope files for any ``ae``/``oe``/``ue``/``ss`` token and
filters out:

1. Tokens already in ``KNOWN_WORDS`` (handled by the regular
   sweep).
2. Tokens in ``NOT_TRANSLITERATIONS`` - English words and German
   words that are correct as ASCII (loanwords like ``Klasse``,
   short-vowel ``ss`` like ``Diskussion``, etc.).

What remains is the candidate set for KNOWN_WORDS expansion. A
human reviewer decides which entries are real transliterations
worth adding. A clean run (no remaining German tokens beyond the
``NOT_TRANSLITERATIONS`` exemptions) means the whitelist is
complete enough for the current corpus.

Usage::

    python3 scripts/discover_unknown_umlauts.py
    python3 scripts/discover_unknown_umlauts.py --top 50
    python3 scripts/discover_unknown_umlauts.py --file-list path

Reuses ``KNOWN_WORDS`` and ``mask_code_regions`` from
``find_umlaut_candidates`` so the masking + whitelist stay in
one place.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from find_umlaut_candidates import KNOWN_WORDS, mask_code_regions  # noqa: E402


# Tokens proven NOT to be German transliterations. Hand-curated:
# English words that happen to contain ae/oe/ue/ss, plus German
# words whose ASCII spelling is canonical (loanwords, short-
# vowel ss, names). When in doubt, leave OUT - the reviewer is
# the safety net.
NOT_TRANSLITERATIONS: set[str] = {
    # ---- English ----
    "session", "sessions", "Session", "Sessions",
    "does", "Does", "doesn", "Doesn",
    "missing", "Missing", "missed",
    "assets", "asset", "Asset", "Assets",
    "issue", "Issue", "issues", "Issues", "issued",
    "regression", "Regression", "regressions",
    "lessons", "Lessons", "lesson", "Lesson",
    "message", "messages", "Message",
    "request", "Request", "requests", "requested", "ReviewRequest",
    "question", "Question", "Questions", "questions",
    "passed", "passes", "Passed", "passing", "Passive", "passive",
    "classes", "Classic", "classic",
    "classification", "Classification", "classifications",
    "Classify", "classify", "classifies", "classified",
    "Klassifikation", "Klassifikationen", "Klassifizierer",
    "Klassifizierung", "klassifiziert",
    "subclasses", "Subklassen",
    "frequency", "Frequency", "frequent", "frequently",
    "successful", "continues", "Continued",
    "consequence", "Consequence", "consequences",
    "subsequent", "Subsequent", "sequence", "sequenced",
    "sequencing", "sequential", "Sequenz",
    "dismissed", "dismissible",
    "queried", "Query", "query", "queue", "queued", "queries",
    "pressure",
    "assistance", "assist", "assisted", "assistant", "Assistant",
    "Assistent", "Assistenten",
    "assert", "asserts", "Assertions", "assertions", "asserting",
    "assertion",
    "assume", "assumes", "assumed", "assuming", "assumption",
    "assumptions",
    "accessible", "accessibility", "Accessibility",
    "possible", "possibly", "impossible",
    "values", "Values",
    "guess", "guessing",
    "goes",
    "professional", "professionally", "professionellen",
    "Professionelle", "professionell",
    "analogues", "aggressively", "fluency",
    "Bluesky", "Squeeze", "Portuguese",
    "reclassified", "Reclassified",
    "stresses", "ossifies",
    "necessary", "necessarily",
    "onmessage",
    "discussed", "discussion",
    "processed", "processing",
    "unprofessional",
    "predecessor",
    "bypassed", "bypassing", "bypasses",
    "suppresses", "suppressed",
    "blueprint",
    "expressed",
    "passwordless", "Password",
    "issued",
    "massive", "Massive", "Massiven",
    "reassignment",
    "addressed",
    "submission", "submissions",
    "daemon",
    "associated", "association", "assigns", "assignment",
    "assessment",
    "lossy",
    "impression",
    "permission", "Permission", "permissions",
    "commission",
    "coexist", "coexists",
    # ---- Latin / loanword German (no umlaut, canonical) ----
    "Klasse", "Klassen", "Klassisch", "Klassischer",
    "manuell", "Manuelle", "Manuelles", "manuelles",
    "visuell",
    "Assistent", "Assistenten",
    "aktuell", "aktuelle", "aktuellen", "aktueller", "Aktuell",
    "Aktueller", "Aktuelle", "Aktuelles", "aktuellem",
    "Passiv", "Passive",
    "Diskussion",
    "Sequenz",
    "Glossar", "glossary",
    "Impressum",
    "Passwort",
    "Quelle", "Quell", "Quellen", "Quellcode",
    # ---- German "neu" forms (no umlaut) ----
    "neuen", "Neuer", "Neues", "neuer", "neues", "neueste",
    "neueres",
    # ---- "passen" forms (short a, no umlaut) ----
    "passt", "passte", "passend", "passen", "anpassen",
    "angepasst", "angepasster", "passiert", "passenden",
    "Anpassung", "Anpassungen", "Anpassungen",
    # ---- short-vowel ss German (correct as-is) ----
    "Ergebnisse", "Hauptergebnisse", "Zusammenfassung",
    "abgeschlossen", "ausgeschlossen", "Geschlossen", "geschlossen",
    "Schliesser",
    "dessen", "dasselbe",
    "bewusst", "bewusste", "Bewusste",
    "beeinflusst", "unbeeinflusst", "beeinflussen",
    "angefasst",
    "bessere",
    "Schlussgedanken",
    "vergisst",
    "umfasst",
    "stattdessen",
    "hinterlassen", "lassen", "laesst",  # laesst handled in KNOWN_WORDS, listed for safety
    "Verbesserungen",
    # ---- Misc correct German ----
    "bauen", "umbauen", "einbauen", "aufbauen",
    "zuerst",
    "dauern", "dauerhaft",
    "musst",  # 2nd person sg. of "müssen": "du musst" no umlaut
    "fokussierte",
    "Verzeichnisstruktur",
    "Erfolgsschritt",
    "feuert",
    "aussieht",
    "fuers",  # contraction "für das" sometimes written ASCII; keep neutral
    # ---- Tooling, file slugs, identifiers that the masker missed ----
    "ssh", "uebersicht", "poetry",
    # ---- Additional curation 2026-05-04 (productionization run) ----
    # English / loanwords surfaced by initial discovery scans
    "Successful", "successfully", "Submission", "reassign", "pressed",
    "Einrichtungsassistent", "Verbessern", "verbessern",
    "Essays", "Quer", "vergessen", "vertrauen", "assertet",
    "Regressions", "Misses", "Manuell",
    "individuell", "individuelle", "individueller",
    "Visuelle", "visueller", "visuell",
    "Professional", "Professionelles", "professioneller",
    "Bequemlichkeit", "Bequemer",
    "Fasse", "Assessment", "Messages",
    "Huerta",  # surname
    # Correct German with -ssen / -ss / no-umlaut
    "Inhaltsverzeichnisses", "Textpassagen", "Missbrauchs",
    "aussehen", "Voraussetzung", "Voraussetzungen",
    "Aufbewahrungsdauer", "Quelltext", "Buchverzeichnisses",
    "Buchverzeichnis", "klassische", "klassisches",
    "abgeschlossenen", "Arbeitssitzung", "neuere", "Geheimnisse",
    "Neuen", "Erneuern", "Erfassung", "Anwendungsstart",
    "Basisklassen", "fallenlassen", "Neueingabe",
    "passieren", "erfasst", "blauen", "Passivkonstruktionen",
    "wissenschaftlichen", "Wissenschaftliche", "Wissenschaft",
    "erfassen", "Fehlerquellen", "Bewusst", "wissen",
    "steuerlich", "Rechnungsstellung", "manuellen", "manuellem",
    "Reproduktionsschritten",
    "Aufbauen", "Ausbauen", "abbauen", "Umbauen", "desselben",
    "Betriebssystem", "Quellprojekts", "abgeschossen",
    "Ressourcen", "Deinstallationsskript",
    "Anzeigedauer", "Dauer", "feuerte", "klassen",
    "herausstellte", "Ersparnisse", "Weglassen", "massiven",
    "Klassifikations", "gelassen", "umfassende",
    "angesteuert", "steuert", "gesteuert", "Steuerungen",
    "Abschlussnotiz", "angepassten",
    "misst",  # 3rd person sg "messen" - short e, no umlaut
    "influence",  # English
    "Poetry",  # already covered above but reaffirm
}


def discover(file_list: Path) -> tuple[Counter[str], dict[str, list[str]]]:
    """Return (counter, locations) of unknown ASCII tokens."""
    token_re = re.compile(r"\b[A-Za-z]*(?:ae|oe|ue|ss)[a-z]+\b")
    skip = NOT_TRANSLITERATIONS | set(KNOWN_WORDS.keys())

    counter: Counter[str] = Counter()
    locations: dict[str, list[str]] = {}

    files = [
        Path(line.strip())
        for line in file_list.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]

    for f in files:
        if not f.is_file():
            continue
        try:
            text = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        masked, _ = mask_code_regions(text)
        for m in token_re.finditer(masked):
            tok = m.group(0)
            if tok in skip:
                continue
            counter[tok] += 1
            if tok not in locations:
                locations[tok] = []
            if len(locations[tok]) < 3:
                line_no = masked[: m.start()].count("\n") + 1
                locations[tok].append(f"{f}:{line_no}")

    return counter, locations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--file-list",
        default="/tmp/in-scope-files.txt",
        help="In-scope file list (default /tmp/in-scope-files.txt).",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=200,
        help="Max rows to print (default 200).",
    )
    args = parser.parse_args()

    file_list = Path(args.file_list)
    if not file_list.is_file():
        print(f"error: file list not found: {file_list}", file=sys.stderr)
        return 2

    counter, locations = discover(file_list)

    for tok, cnt in counter.most_common(args.top):
        locs = "; ".join(locations[tok])
        print(f"{cnt:4d}  {tok:30s}  {locs}")

    print()
    print(f"Distinct unknown tokens: {len(counter)}")
    print(f"Total occurrences:       {sum(counter.values())}")
    if not counter:
        print("Whitelist appears complete for current corpus.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
