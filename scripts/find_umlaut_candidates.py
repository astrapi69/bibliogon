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
    "faellt": "fällt", "Faellt": "Fällt", "gefaellt": "gefällt",
    # Coverage additions surfaced via third-pass scan (2026-05-04).
    "vollstaendig": "vollständig", "vollstaendige": "vollständige",
    "Vollstaendig": "Vollständig", "Vollstaendige": "Vollständige",
    "Vollstaendiger": "Vollständiger",
    "unveraenderten": "unveränderten",
    "eingehaengt": "eingehängt", "angehaengt": "angehängt",
    "saeubern": "säubern",
    "ueberschreibbar": "überschreibbar",
    "ueberschreiben": "überschreiben", "ueberschrieben": "überschrieben",
    "ueberspringt": "überspringt",
    "uebertragen": "übertragen",
    "Ausloesung": "Auslösung", "Aufloesung": "Auflösung",
    "aufloesen": "auflösen",
    "Saetze": "Sätze",
    "Praeferenz": "Präferenz",
    "zurueckgezogen": "zurückgezogen", "zurueckfaellt": "zurückfällt",
    "beschaedigtes": "beschädigtes",
    "geaendertem": "geändertem",
    "Geaenderte": "Geänderte", "geaenderte": "geänderte",
    "Klaerung": "Klärung", "Klaerungs": "Klärungs",
    "Klaerungsfrage": "Klärungsfrage",
    "Loest": "Löst", "loest": "löst",
    "ausfuehrlichem": "ausführlichem",
    "gehoeren": "gehören", "Gehoeren": "Gehören", "gehoert": "gehört",
    "aenderst": "änderst",
    "luegt": "lügt",
    "Verfuegung": "Verfügung",
    "gezaehlt": "gezählt", "zaehlt": "zählt",
    "ueberschneidet": "überschneidet",
    "Sonderfaelle": "Sonderfälle",
    "Begruendung": "Begründung", "Begruendungs": "Begründungs",
    "zufaellig": "zufällig",
    "verhaelt": "verhält",
    "gefuellt": "gefüllt",
    "Leereintraege": "Leereinträge",
    "ueberlegen": "überlegen", "Ueberlegen": "Überlegen",
    "Gefuehl": "Gefühl",
    "Toene": "Töne",
    "eingerueckt": "eingerückt", "Einrueckung": "Einrückung",
    "Absaetzen": "Absätzen",
    "freizuraeumen": "freizuräumen",
    "Haertungs": "Härtungs",
    "verlaengert": "verlängert",
    "pruefbar": "prüfbar",
    "uebersehen": "übersehen",
    "ueberall": "überall",
    "uebernommen": "übernommen",
    "fuegt": "fügt",
    "beruehren": "berühren",
    "laesst": "lässt",
    "fehlschlaegt": "fehlschlägt", "schlaegt": "schlägt",
    "auswaehlen": "auswählen",
    "unabhaengige": "unabhängige",
    "schliesst": "schließt",
    "Muelleimer": "Mülleimer",
    "zukuenftige": "zukünftige",
    "Spezifitaet": "Spezifität",
    "Kompatibilitaet": "Kompatibilität",
    "Fussnoten": "Fußnoten",
    "verschluesselt": "verschlüsselt",
    "urspruengliche": "ursprüngliche",
    "Granularitaet": "Granularität",
    "primaer": "primär", "Primaer": "Primär",
    "zusaetzlich": "zusätzlich",
    "Geruest": "Gerüst",
    # Coverage additions surfaced via fourth-pass scan (2026-05-04).
    "vollstaendiger": "vollständiger",
    "eingefuegt": "eingefügt", "Eingefuegt": "Eingefügt",
    "ausschliessbar": "ausschließbar",
    "Heisst": "Heißt",
    "kuenftige": "künftige", "zukuenftiger": "zukünftiger",
    "Schliesst": "Schließt",
    "eigenstaendige": "eigenständige",
    "Ankuendigungen": "Ankündigungen",
    "Verzoegerung": "Verzögerung",
    "uebersteuert": "übersteuert",
    "zurueckverlinkt": "zurückverlinkt",
    "loescht": "löscht",
    "uebergibt": "übergibt",
    "ausserhalb": "außerhalb", "Ausserhalb": "Außerhalb",
    "Funktionskoerper": "Funktionskörper",
    "Haeufige": "Häufige",
    "tatsaechlichen": "tatsächlichen", "tatsaechlich": "tatsächlich",
    "Zustaendigkeit": "Zuständigkeit",
    "haengt": "hängt", "anhaengen": "anhängen",
    "duenne": "dünne",
    "Praefix": "Präfix",
    "fliessen": "fließen",
    "Zeilenumbrueche": "Zeilenumbrüche",
    "aufgeloest": "aufgelöst",
    "Haertung": "Härtung",
    "Bloecken": "Blöcken", "Bloecke": "Blöcke",
    "Faelle": "Fälle",
    "ueberarbeiten": "überarbeiten",
    "Laengste": "Längste", "Satzlaenge": "Satzlänge",
    "faengt": "fängt",
    "ausdruecklichem": "ausdrücklichem",
    "Rueckfrage": "Rückfrage", "Rueckfragen": "Rückfragen",
    "Verschluesselung": "Verschlüsselung",
    "traegt": "trägt",
    "spaeteren": "späteren",
    "ueberhaupt": "überhaupt",
    "Klaerungsfragen": "Klärungsfragen",
    "ausser": "außer",
    "uebernommenen": "übernommenen",
    "beschaedigte": "beschädigte",
    "unterstuetzt": "unterstützt",
    "erklaert": "erklärt",
    "ausfuehrbare": "ausführbare",
    "fuellen": "füllen",
    "Einfuegen": "Einfügen",
    "Fusszeile": "Fußzeile",
    "Frueher": "Früher", "frueher": "früher",
    "laenger": "länger",
    "Rueckseitentext": "Rückseitentext",
    "Rueckschreiben": "Rückschreiben",
    "gemaess": "gemäß",
    # Coverage additions surfaced via fifth-pass scan (2026-05-04).
    "eingefuehrt": "eingeführt",
    "eingeschraenkt": "eingeschränkt",
    "Bestaetige": "Bestätige",
    "frueheren": "früheren",
    "geaenderten": "geänderten",
    "Geschaetzter": "Geschätzter",
    "Inkompatibilitaet": "Inkompatibilität",
    "Schluesseltest": "Schlüsseltest",
    "tatsaechliche": "tatsächliche",
    "Umstaenden": "Umständen",
    "unveraenderbar": "unveränderbar",
    "zurueckzugeben": "zurückzugeben",
    "Zusaetzliche": "Zusätzliche", "zusaetzlicher": "zusätzlicher",
    "Grundverstaendnis": "Grundverständnis",
    # Coverage additions surfaced via discover_unknown_umlauts.py
    # productionization run (2026-05-04). All hand-verified.
    "Hoerbuch": "Hörbuch",
    "primaere": "primäre",
    "Bestaetigungsdialog": "Bestätigungsdialog", "bestaetigst": "bestätigst",
    "fuellt": "füllt", "befuellt": "befüllt",
    "ausfuellen": "ausfüllen",
    "Ankuendigung": "Ankündigung",
    "Veroeffentlichen": "Veröffentlichen", "veroeffentlichte": "veröffentlichte",
    "artikeluebergreifend": "artikelübergreifend",
    "loesen": "lösen", "loesche": "lösche", "Loesche": "Lösche",
    "loeschbar": "löschbar",
    "Prioritaeten": "Prioritäten",
    "unterstuetzen": "unterstützen", "Unterstuetze": "Unterstütze",
    "abwaegen": "abwägen",
    "frueh": "früh", "frueherer": "früherer", "frueheres": "früheres",
    "eigenstaendig": "eigenständig",
    "Testlaeufe": "Testläufe",
    "funktionsfaehiges": "funktionsfähiges",
    "haeufige": "häufige",
    "Ausserdem": "Außerdem", "ausserdem": "außerdem",
    "aehnlichsten": "ähnlichsten",
    "veraendert": "verändert",
    "faechert": "fächert", "gefaechert": "gefächert",
    "auffaechert": "auffächert", "Faechrungen": "Fächerungen",
    "ablaeuft": "abläuft",
    "temporaerer": "temporärer", "temporaeres": "temporäres",
    "fuegte": "fügte",
    "Naechster": "Nächster",
    "Haelfte": "Hälfte",
    "sproeder": "spröder",
    "fuehrenden": "führenden",
    "abschliessenden": "abschließenden", "abschliessen": "abschließen",
    "gekuerzt": "gekürzt",
    "hoeheren": "höheren", "Hoehere": "Höhere",
    "aufraeumt": "aufräumt",
    "aufgeloesten": "aufgelösten",
    "Nuetzliche": "Nützliche",
    "hinzufuegst": "hinzufügst", "hinzufuegt": "hinzufügt",
    "zusammengefuegte": "zusammengefügte",
    "Konformitaet": "Konformität",
    "fliesst": "fließt",
    "Rueckseitenbeschreibung": "Rückseitenbeschreibung",
    "Ausschliessen": "Ausschließen",
    "behaelt": "behält",
    "Sicherheitsgruenden": "Sicherheitsgründen",
    "uebernommene": "übernommene",
    "ueberschreibt": "überschreibt",
    "Nachtraegliche": "Nachträgliche",
    "Grenzfaelle": "Grenzfälle",
    "Beschaedigte": "Beschädigte",
    "oeffentliches": "öffentliches", "oeffentliche": "öffentliche",
    "herunterlaedst": "herunterlädst",
    "Anschliessend": "Anschließend",
    "haengen": "hängen",
    "oeffne": "öffne",
    "fuehre": "führe",
    "uebereinstimmen": "übereinstimmen",
    "geschuetzt": "geschützt",
    "schaedlich": "schädlich",
    "entfaellt": "entfällt",
    "hochfaehrt": "hochfährt",
    "Aktivitaetslog": "Aktivitätslog",
    "Kompatibilitaetsgruenden": "Kompatibilitätsgründen",
    "Pruefsumme": "Prüfsumme",
    "standardmaessig": "standardmäßig",
    "oefter": "öfter",
    "Benutzeroberflaeche": "Benutzeroberfläche",
    "Grammatikpruefung": "Grammatikprüfung",
    "Fuenf": "Fünf",
    "schreibgeschuetzt": "schreibgeschützt",
    "Schlaegt": "Schlägt",
    "zurueckgerollt": "zurückgerollt",
    "Fluesse": "Flüsse",
    "aendere": "ändere",
    "moechtest": "möchtest",
    "Eindruecke": "Eindrücke",
    "Hauptaenderungen": "Hauptänderungen",
    "aussagekraeftiger": "aussagekräftiger",
    "Zusaetzlich": "Zusätzlich",
    "ausfuehrbar": "ausführbar", "Ausfuehren": "Ausführen",
    "laengere": "längere",
    "unnuetzes": "unnützes",
    "Unterueberschriften": "Unterüberschriften",
    "faelschlicherweise": "fälschlicherweise",
    "ausgewaehlt": "ausgewählt", "auswaehlte": "auswählte",
    "zeilenumbrueche": "zeilenumbrüche", "Zeilenumbruechen": "Zeilenumbrüchen",
    "einrueckungen": "einrückungen",
    "groesse": "größe", "groessere": "größere", "groesseren": "größeren",
    "Erhoehe": "Erhöhe",
    "Schriftgroesse": "Schriftgröße",
    "Zuverlaessiges": "Zuverlässiges",
    "Wortzaehlung": "Wortzählung", "Wortzaehler": "Wortzähler",
    "fuege": "füge",
    "ueberleben": "überleben",
    "Faehigkeit": "Fähigkeit",
    "naechstes": "nächstes",
    "uebersetzt": "übersetzt", "uebersetzter": "übersetzter",
    "uebersetzen": "übersetzen",
    "vollstaendigen": "vollständigen",
    "endgueltig": "endgültig",
    "sprachunabhaengig": "sprachunabhängig",
    "Einfuegung": "Einfügung",
    "buendelt": "bündelt", "buendeln": "bündeln",
    "Buendelung": "Bündelung",
    "gaengigen": "gängigen",
    "Ausfuehrliche": "Ausführliche", "Ausfuehrlicher": "Ausführlicher",
    "zurueckgibt": "zurückgibt",
    "Qualitaetssicherung": "Qualitätssicherung",
    "Auftraege": "Aufträge",
    "zusammenhaengende": "zusammenhängende",
    "Anfuehrungszeichen": "Anführungszeichen",
    "Silbenzaehlung": "Silbenzählung",
    "Buchuebersetzung": "Buchübersetzung",
    "Vorhoer": "Vorhör",
    "Lizenzschluessel": "Lizenzschlüssel",
    "laedt": "lädt",
    "vorausgefuelltem": "vorausgefülltem",
    "Maximalfunktionsgroesse": "Maximalfunktionsgröße",
    "Geschaeftslogik": "Geschäftslogik",
    "klaeren": "klären", "geklaert": "geklärt",
    "Fussangel": "Fußangel",
    "waehlte": "wählte",
    "ueberschritten": "überschritten",
    "Spruenge": "Sprünge",
    "vernuenftige": "vernünftige",
    "Schreibflaeche": "Schreibfläche",
    "zurueckfallen": "zurückfallen",
    "Gewuenscht": "Gewünscht",
    "engineabhaengigen": "engineabhängigen",
    "Fortfuehrung": "Fortführung",
    "geschaetzte": "geschätzte", "geschaetzten": "geschätzten",
    "verschluesselte": "verschlüsselte",
    "Buecherregalen": "Bücherregalen",
    "muelleimer": "mülleimer",
    "Schluesselter": "Schlüsselter",
    # Added 2026-05-07 during README-de.md umlaut sweep:
    "unveraenderte": "unveränderte",
    "Kostenschaetzung": "Kostenschätzung",
    "Probehoeren": "Probehören",
    "kontextbewusste": "kontextbewusste",  # identity, no umlaut
    "Vorschlaege": "Vorschläge",
    "Verschluesselte": "Verschlüsselte",
    "Franzoesisch": "Französisch",
    "Tuerkisch": "Türkisch",
    "Mobilgeraeten": "Mobilgeräten",
    "Begleitbeitraege": "Begleitbeiträge",
    "Manueller": "Manueller",  # identity
    "oeffentlichen": "öffentlichen",
    "Buchaenderungen": "Buchänderungen",
    "Konfliktloesungs": "Konfliktlösungs",
    "verknuepfte": "verknüpfte",
    "Bruecke": "Brücke",
    "zurueckgegeben": "zurückgegeben",
    "Tastenkuerzeln": "Tastenkürzeln",
    "Stilpruefungen": "Stilprüfungen",
    "Verknuepfung": "Verknüpfung",
    "beruecksichtigt": "berücksichtigt",
    "kuenftigen": "künftigen",
    "Zielverzeichnisstruktur": "Zielverzeichnisstruktur",  # identity
    "Uebersetzungen": "Übersetzungen",
    "Menue": "Menü",
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


def mask_code_regions(
    text: str, *, indented_code: bool = True
) -> tuple[str, list[tuple[int, int, str]]]:
    """Replace code regions with placeholders. Return masked text + map.

    ``indented_code`` toggles the Markdown indented-code-block rule
    (lines beginning with 4 spaces / a tab). Set False for non-Markdown
    files (e.g. YAML) where indentation is data, not code.
    """
    spans: list[tuple[int, int, str]] = []
    patterns: tuple[re.Pattern[str], ...] = (FENCED_BLOCK, INLINE_CODE)
    if indented_code:
        patterns = (*patterns, INDENTED_CODE)
    for pat in patterns:
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

    # YAML / config files: indented lines are data, not code blocks.
    indented = path.suffix not in {".yaml", ".yml"}
    masked, _placeholders = mask_code_regions(text, indented_code=indented)
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
