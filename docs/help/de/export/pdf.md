# PDF-Export

## Grundlagen

PDF eignet sich besonders für druckfertige Buchversionen (Paperback, Hardcover) und für die Vorschau des finalen Layouts. Bibliogon erzeugt PDF-Dateien über die gleiche Pipeline wie den EPUB-Export: TipTap-JSON wird zu Markdown konvertiert, in eine write-book-template-Projektstruktur eingebettet und von manuscripta mit Pandoc als Konverter zu PDF umgewandelt.

## Pandoc als Voraussetzung

Für den PDF-Export ist Pandoc zwingend erforderlich. Pandoc ist ein separates Kommandozeilenwerkzeug und muss auf dem System installiert sein, auf dem das Bibliogon-Backend läuft. Ohne Pandoc schlägt der PDF-Export mit einer entsprechenden Fehlermeldung fehl.

**Installation:**

- **Linux (Debian/Ubuntu):** `sudo apt install pandoc`
- **macOS (Homebrew):** `brew install pandoc`
- **Windows:** Installer von [pandoc.org](https://pandoc.org/installing.html) herunterladen

Zusätzlich wird eine LaTeX-Distribution benötigt, da Pandoc PDF-Dateien über LaTeX erzeugt. Empfohlen wird TeX Live (Linux/macOS) oder MiKTeX (Windows). Auf Debian/Ubuntu genügt `sudo apt install texlive-full` für eine vollständige Installation.

Wenn du Docker verwendest (`make prod`), sind Pandoc und TeX Live bereits im Container enthalten.

## Export-Optionen

Der PDF-Export unterstützt die gleichen Optionen wie der EPUB-Export:

- **Buchtyp** (E-Book, Paperback, Hardcover): Bestimmt die Kapitelreihenfolge und das Inhaltsverzeichnis.
- **Manuelles Inhaltsverzeichnis**: Falls ein eigenes TOC-Kapitel vorhanden ist.
- **Cover**: Ein hinterlegtes Coverbild wird als erste Seite eingefügt.
- **Metadaten**: Titel, Autor, Sprache und ISBN fliessen in die PDF-Metadaten ein.

## Weitere Formate

Neben PDF exportiert Bibliogon auch in folgende Formate, die alle über Pandoc erzeugt werden:

- **DOCX** (Word): Für die Zusammenarbeit mit Lektoren oder Verlagen, die Word-Dokumente bevorzugen.
- **HTML**: Eine einzelne HTML-Datei mit dem gesamten Buchinhalt.
- **Markdown**: Der rohe Markdown-Text aller Kapitel in der konfigurierten Reihenfolge.
- **Projektstruktur (ZIP)**: Eine ZIP-Datei im write-book-template-Format mit Markdown-Dateien, Metadaten und Assets. Dieses Format eignet sich für die Weiterverarbeitung mit eigenen Werkzeugen oder für die Versionskontrolle mit Git.
