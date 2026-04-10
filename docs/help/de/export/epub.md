# EPUB-Export

## Grundlagen

EPUB ist das Standardformat für E-Books und wird von den meisten E-Book-Readern unterstuetzt (Kindle via Konvertierung, Kobo, Tolino, Apple Books und andere). Bibliogon exportiert EPUB-Dateien über das Export-Plugin, das manuscripta als Konvertierungs-Pipeline nutzt. Du findest den Export-Button in der Sidebar des Editors oder im Export-Dialog.

Beim Export konvertiert Bibliogon die TipTap-JSON-Inhalte zunaechst in Markdown, erstellt eine write-book-template-Projektstruktur und laesst manuscripta daraus die fertige EPUB-Datei erzeugen. Pandoc wird für die finale Konvertierung von Markdown zu EPUB verwendet.

## Metadaten

Die Metadaten deines Buchs fliessen automatisch in die EPUB-Datei ein. Folgende Felder werden unterstuetzt:

- **Titel und Untertitel**: Erscheinen auf der Titelseite und in den EPUB-Metadaten.
- **Autor**: Wird als Creator in den EPUB-Metadaten hinterlegt.
- **Sprache**: Bestimmt die Sprachkennung im EPUB (z.B. "de" für Deutsch).
- **ISBN**: Falls vorhanden, wird die ISBN in die Metadaten eingebettet.
- **Cover**: Ein Coverbild kann über die Buch-Metadaten hinterlegt werden und erscheint als EPUB-Cover.
- **Beschreibung**: Die Buchbeschreibung wird in die Dublin-Core-Metadaten aufgenommen.

Pflege die Metadaten vor dem Export über den Metadaten-Tab im Editor, damit dein EPUB alle relevanten Informationen enthaelt.

## Inhaltsverzeichnis

Bibliogon unterstuetzt zwei Varianten für das Inhaltsverzeichnis:

- **Automatisch generiert**: Pandoc erstellt das Inhaltsverzeichnis aus den Überschriften im Text. Die Tiefe (Anzahl der Überschriftenebenen) ist in den Export-Einstellungen konfigurierbar (Standard: 2 Ebenen).
- **Manuelles Inhaltsverzeichnis**: Wenn dein Buch ein eigenes TOC-Kapitel enthaelt, kannst du im Export-Dialog die Option "Manuelles Inhaltsverzeichnis" aktivieren. In diesem Fall wird das selbst erstellte Inhaltsverzeichnis verwendet und die automatische Generierung übersprungen.

Verwende nicht beide Varianten gleichzeitig, da dies zu einem doppelten Inhaltsverzeichnis fuehrt.

## Qualitaetskontrolle mit epubcheck

Nach dem Export empfiehlt es sich, die EPUB-Datei mit epubcheck zu validieren. Epubcheck ist ein Open-Source-Werkzeug des W3C, das EPUB-Dateien auf Konformitaet mit dem EPUB-Standard prueft. Es erkennt Strukturfehler, fehlende Metadaten und ungueltige Referenzen. Epubcheck ist als Java-Anwendung verfügbar unter [github.com/w3c/epubcheck](https://github.com/w3c/epubcheck).

## Buchtypen

Beim Export kannst du den Buchtyp wählen (E-Book, Paperback, Hardcover). Der Buchtyp bestimmt, welche Kapitel in welcher Reihenfolge in die EPUB-Datei aufgenommen werden. So enthaelt ein E-Book beispielsweise ein digitales Inhaltsverzeichnis, während ein Paperback ein druckoptimiertes Inhaltsverzeichnis verwendet. Der Dateiname der exportierten Datei enthaelt standardmaessig den Buchtyp als Suffix (z.B. `mein-buch-ebook.epub`).
