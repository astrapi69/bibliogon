# Feldauswahl im Import-Assistenten

Ab v0.22 kannst du im Import-Assistenten jedes Buch-Metadaten-
Feld sehen und konfigurieren, bevor du den Import bestaetigst.
Drei-Schritte-Ablauf:

## Schritt 1: Quelle

Datei fallenlassen, Ordner wählen oder Git-URL einfügen.
Wie bisher.

## Schritt 2: Zusammenfassung

Nach Abschluss der Erkennung zeigt der Assistent eine kurze
Übersicht dessen, was gefunden wurde:

- Erkanntes Format (`.bgb`, `markdown`, `wbt-zip`, `docx`,
  `epub`, ...)
- Anzahl der Kapitel
- Anzahl der Assets
- Cover-Dateiname, wenn ein Cover-Bild erkannt wurde
- Dateiname des eigenen CSS, wenn ein Stylesheet erkannt wurde
- Warnungen (fehlendes Cover, Metadaten-Probleme, ...)

Klick auf **Weiter: Prüfen & Konfigurieren** zum Fortfahren.

## Schritt 3: Prüfen & Konfigurieren

Ein abschnittsbasiertes Formular mit jedem Feld, das der Buch-
Metadaten-Editor anbietet:

**Grunddaten (Pflicht)**
- Titel — Pflichtfeld. Leer blockiert den Importieren-Button.
- Autor — Pflichtfeld. Gleiches Verhalten.
- Sprache — bei Abwahl Standard `de`.

**Metadaten**
- Untertitel, Serie, Band-Nummer, Genre, Edition.

**Publikation**
- Verlag, Stadt, Datum.
- Drei ISBNs (E-Book / Taschenbuch / Hardcover).
- Drei ASINs (E-Book / Taschenbuch / Hardcover).

**Langformige Inhalte**
- Beschreibung, HTML-Beschreibung, Rueckseitenbeschreibung,
  Autoren-Bio. Lange Einträge sind zuklappbar.

**Gestaltung**
- Eigenes CSS (EPUB-Styles). Mono-Schrift, zuklappbar.

**Keywords** — kommagetrennt.

Jede Zeile ausser Pflichtfeldern hat eine Checkbox für
Einbinden / Ausschliessen:

- Checkbox AN: Das Feld wird mit dem angezeigten (evtl.
  bearbeiteten) Wert importiert.
- Checkbox AUS: Das Feld wird übersprungen. Die Buch-Spalte
  behaelt ihren Standard (leer/null, für Sprache `de`).

Abschnitte, deren Felder in der Quelle alle leer sind, werden
unter **+ Felder hinzufügen** zusammengeklappt, damit du
fehlende Metadaten auch dann ergänzen kannst, wenn der Import
sie nicht geliefert hat.

## Warum das existiert

Frueher zeigte der Assistent in der Vorschau nur Titel, Autor
und Sprache. Langformige Felder (CSS, Rueckseitentext, Autoren-
Bio) wurden zwar importiert, aber erst im Metadaten-Editor
nach dem Import sichtbar. Nutzer meldeten das als "Felder
werden nicht importiert", weil sie sie nicht sehen konnten.
Der Feldauswahl-Schritt schliesst diese Lücke.

## Verwandte Themen

- [Import aus einer Git-URL](git-url.md) — das Eingabefeld
  aus Schritt 1.
- [Metadaten-Editor](../editor/uebersicht.md) — vollstaendige
  Nach-Import-Bearbeitung.
