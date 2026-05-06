# Massen-Export von Artikeln

Das Artikel-Dashboard exportiert mehrere Artikel in einem Vorgang. Artikel auswählen, Format wählen, ZIP oder kombiniertes Dokument wählen, auf Exportieren klicken.

## Wann sinnvoll?

- Eine Dachserie mit mehreren Folgeartikeln, die gemeinsam versendet werden sollen.
- Migration eines Themas zu einer Plattform, die ein Dokument einer Sammlung vieler vorzieht.
- Zusammenstellung einer Long-Form-Anthologie als PDF aus einem Jahrgang von Beiträgen.

Für einen einzelnen Artikel ist der Export im Zeilen-Menü schneller.

## Artikel auswählen

- Jede Kachel (Grid-Ansicht) und jede Zeile (Listen-Ansicht) hat eine Checkbox. Klick = Auswahl.
- Die „Alle auswählen"-Checkbox oben markiert alle aktuell sichtbaren Artikel nach den Filtern - nicht alle Artikel in der Datenbank.
- Auswahl von mehr als 50 zeigt einen Hinweis („kann länger dauern"). Auswahl von mehr als 200 deaktiviert die Exportieren-Schaltfläche (Server-Limit).

## Filter

Das Filter-Quartett im Dashboard heißt **Status**, **Thema**, **Serie**, **Tag**. Filter werden mit UND verknüpft - jeder zusätzliche Filter schränkt das Ergebnis weiter ein.

- **Status**: Entwurf / Bereit / Veröffentlicht / Archiviert (Schaltflächen-Zeile).
- **Thema**: Dropdown, gespeist aus den in den Einstellungen verwalteten Themen (Einstellungen > Themen).
- **Serie**: Dropdown, gespeist aus den unterschiedlichen Serien-Namen deiner Artikel. Serie ist heute ein flaches Freitextfeld; verschachtelte Unter-Serien sind ein zukünftiges Feature.
- **Tag**: Dropdown, gespeist aus den unterschiedlichen Tags deiner Artikel. Die Prüfung ist Mengen-Mitgliedschaft (ein Artikel mit Tag „python" passt; ein Artikel mit Tag „pythonista" nicht).

Filter-Zustand wird in die URL geschrieben, sodass du gefilterte Ansichten teilen oder als Lesezeichen speichern kannst. Die Auswahl selbst landet **nicht** in der URL - sie gilt pro Sitzung.

## Ausgabemodi

Sobald Artikel ausgewählt sind, zeigt die Aktionsleiste:

- **Format**: Markdown, HTML, PDF, DOCX. Dieselben vier Formate wie der Einzel-Export.
- **Ausgabe**: ZIP-Archiv oder Kombiniertes Dokument.

### ZIP-Archiv

Eine Datei pro Artikel im gewählten Format, in einem ZIP gebündelt. Dateinamen-Muster: `<slug>.<ext>` (z. B. `cosmos-einleitung.md`). Bei gleichem Slug bekommt der zweite Treffer `-2`, der dritte `-3` usw.

Hülldatei: `articles-YYYY-MM-DD.zip`.

### Kombiniertes Dokument

Alle Artikel zu einer Datei zusammengeführt:

- **Markdown**: pro Artikel eine `## <Titel>`-Überschrift, Artikel durch `---` getrennt. Kein Per-Artikel-Frontmatter.
- **HTML**: eigenständiges HTML mit Inhaltsverzeichnis und Anker-IDs pro Abschnitt, direkt im Browser lesbar.
- **PDF**: jeder Artikel wird zu einem Kapitel, automatisches Inhaltsverzeichnis, Pandoc + xelatex.
- **DOCX**: jeder Artikel ist eine Hauptüberschrift, automatisches Inhaltsverzeichnis.

Reihenfolge der Artikel im kombinierten Dokument: die im Dashboard aktive Sortierung.

## Limits und Verhalten

- **Hartes Server-Limit**: 200 Artikel pro Export. Über 200 ist der Exportieren-Button deaktiviert.
- **Warnung bei 50**: nicht-blockierender Hinweis zur Wartezeit.
- **Timeout für kombinierten Export**: 180 Sekunden. Wenn ein kombiniertes PDF länger braucht (sehr viele Artikel, viele eingebettete Bilder): Auswahl reduzieren oder in kleinere Stapel aufteilen.
- **Nicht erreichbare Bilder schlagen laut fehl**: wenn ein ausgewählter Artikel eine kaputte Bild-URL referenziert, schlägt der kombinierte Pandoc-Schritt fehl und die Fehlermeldung nennt den betroffenen Artikel. Bild reparieren (oder Artikel abwählen) und erneut exportieren.

## Was nicht passiert

- Kein Massen-Löschen, Massen-Veröffentlichen oder Massen-Tagging. Massen-Export ist heute die einzige Mehrfach-Aktion.
- Keine Drag-Drop-Sortierung im Export-Dialog. Die Reihenfolge ist die aktive Dashboard-Sortierung.
- Kein Pro-Artikel-Format. Alle ausgewählten Artikel werden im selben Format exportiert.

## Tipps

- Dashboard nach Datum absteigend sortieren (Standard) und die obersten N Artikel für eine „Letzte Beiträge"-Anthologie auswählen.
- Nach Serie filtern, „Alle auswählen", als kombiniertes PDF exportieren - Serien-Sammelband fertig.
- Nach Tag filtern, „Alle auswählen", als ZIP-Markdown exportieren, wenn das Ergebnis in ein anderes Werkzeug fließen soll.
