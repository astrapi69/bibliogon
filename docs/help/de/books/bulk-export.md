# Massen-Export von Büchern

Das Bücher-Dashboard exportiert mehrere Bücher in einem Vorgang. Bücher auswählen, Format wählen, auf Exportieren klicken. Du bekommst ein einzelnes ZIP mit einer gerenderten Datei pro Buch.

## Wann sinnvoll?

- Eine Reihe mit mehreren Bänden, die du gemeinsam an einen Verlag oder als Backup ausliefern willst.
- Migration eines Katalogs zu einer anderen Plattform.
- Jahresarchiv aller veröffentlichten Bücher deiner Bibliothek.

Für ein einzelnes Buch ist die Export-Aktion im Editor schneller.

## Bücher auswählen

- Jede Kachel hat eine Checkbox. Klick = Auswahl.
- Die „Alle auswählen"-Checkbox oben markiert alle aktuell sichtbaren Bücher nach den Filtern — nicht alle Bücher in der Datenbank.
- Auswahl von mehr als 50 zeigt einen Hinweis („kann länger dauern"). Auswahl von mehr als 200 deaktiviert die Exportieren-Schaltfläche (Server-Limit).

## Ausgabemodus

Sobald Bücher ausgewählt sind, zeigt die Aktionsleiste:

- **Format**: EPUB, PDF, DOCX. Drei Formate — schmaler als bei Artikeln (dort zusätzlich Markdown und HTML), weil jedes Buch durch die vollständige manuscripta- + write-book-template-Scaffolding-Pipeline läuft, die ein echtes Dokument-Ziel braucht.
- **Ausgabe**: ZIP-Archiv mit einzelnen Dateien. Es gibt **keinen** Modus „kombiniertes Dokument" für Bücher — siehe „Was nicht passiert" unten.

### ZIP-Archiv

Eine Datei pro Buch im gewählten Format, in einem ZIP gebündelt. Dateinamen-Muster: `<slug>.<ext>` (z. B. `kosmos-einleitung.epub`). Bei gleichem Slug bekommt der zweite Treffer `-2`, der dritte `-3` usw.

Hülldatei: `books-YYYY-MM-DD.zip`. Das Datum hilft, mehrere Massen-Exporte ohne Umbenennen zu sortieren.

## Limits und Verhalten

- **Hartes Server-Limit**: 200 Bücher pro Export. Über 200 ist der Exportieren-Button deaktiviert (Pydantic `max_length`-Validierung gibt 422 zurück).
- **Warnung bei 50**: nicht-blockierender Hinweis zur Wartezeit. Jedes Buch durchläuft die volle Scaffold- + Pandoc-Pipeline; eine Auswahl von 50 Büchern kann mehrere Minuten laufen.
- **Pro-Buch-Fehler schlagen laut fehl**: schlägt Pandoc bei einem Buch in der Auswahl fehl, gibt die ganze Anfrage 502 zurück und die Fehlermeldung nennt den Titel des betroffenen Buchs. Buch reparieren (oder abwählen) und erneut versuchen.
- **Unbekannte Buch-ID gibt 404 zurück** mit der betroffenen ID in der Meldung.

## Was nicht passiert

- **Kein Modus „kombiniertes Dokument".** Massen-Export von Büchern liefert ausschließlich ZIP — bewusst so. N Bücher in ein einziges EPUB / PDF zu fusionieren müsste entscheiden, wessen Metadaten gewinnen, welches Buch das Cover beisteuert, wie das Inhaltsverzeichnis aussieht — keine davon ist ein natürlicher Autor-Workflow. Wenn dein Anwendungsfall ein kombiniertes Buch wirklich braucht: Backlog-Eintrag öffnen, dann sehen wir es uns an.
- Kein Massen-Veröffentlichen oder Massen-Genre-Wechsel. Massen-Export und Massen-Löschen sind heute die einzigen Mehrfach-Aktionen auf Büchern.
- Keine Drag-Drop-Sortierung im Export-Dialog. Die Reihenfolge der Dateien im ZIP folgt der Reihenfolge der Buch-IDs in der Anfrage — also die aktive Dashboard-Sortierung.
- Kein Pro-Buch-Format. Alle ausgewählten Bücher werden im selben Format exportiert.

## Massen-Löschen

Dasselbe Auswahl-Modell, das Massen-Export antreibt, treibt auch Massen-Löschen auf dem Bücher-Dashboard. Filtern, auswählen, auf den roten **Löschen**-Button klicken. Das Dropdown bietet **In Papierkorb verschieben** (weiches Löschen, ca. 10 Sekunden lang per Toast-Button rückgängig zu machen) und **Endgültig löschen** (endgültig, abgesichert durch Eintippen der Anzahl).

Endgültiges Löschen kaskadiert zu den Kapitel-, Asset- und BookImportSource-Zeilen des Buchs. Die aktive Filter-Beschreibung erscheint im Bestätigungsdialog, damit der Umfang explizit ist (z. B. „Genre=Fantasy, Sprache=de"). Der Button ist deaktiviert, wenn weniger als 2 Bücher ausgewählt sind; Einzelbuch-Löschen liegt weiterhin auf dem Zeilen-Menü. Server-seitige Obergrenze: 200 pro Aufruf.

## Tipps

- Dashboard nach Datum absteigend sortieren (Standard) und die obersten N Bücher für ein „Aktuelle Veröffentlichungen"-Archiv auswählen.
- Nach Genre filtern, „Alle auswählen", EPUB-ZIP exportieren — fertig für den Genre-Stapel beim Distributor.
- Nach Sprache filtern, „Alle auswählen", PDF-ZIP wenn du ein paginiertes Archiv aller Bücher einer Sprache willst.

> Zuletzt geprüft für v0.29.0 (2026-05-07).
