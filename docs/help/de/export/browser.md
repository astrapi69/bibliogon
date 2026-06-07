# Export im Browser

Wenn Bibliogon ohne Backend im Browser läuft (die
[Web-App](../web-app.md)), kann es deine Arbeit trotzdem exportieren —
vollständig clientseitig, ohne Server und ohne Pandoc. Sechs Formate
stehen zur Verfügung:

- **Markdown** (`.md`)
- **HTML** (`.html`)
- **Reiner Text** (`.txt`)
- **PDF** (`.pdf`)
- **EPUB** (`.epub`)
- **DOCX** (`.docx`)

## Ein Buch oder einen Artikel exportieren

1. Öffne das Buch oder den Artikel und gehe zur Export-Seite (der
   Export-Knopf liegt in der Editor-Seitenleiste bzw. Werkzeugleiste).
2. Wähle ein Format.
3. Exportiere. Die Datei wird in deinem Browser erzeugt und direkt auf
   dein Gerät heruntergeladen.

## Die Einstellung „Export-Engine"

Unter **Einstellungen > Verhalten** gibt es die Option **Export-Engine**
mit drei Möglichkeiten:

- **Auto** (Standard) — nutzt die Backend-Pipeline, wenn ein Backend
  verfügbar ist, sonst den Export im Browser.
- **Client** — exportiert immer im Browser, auch auf dem Desktop.
- **Backend** — nutzt immer die Backend-Pipeline (nur Desktop; die
  Web-App hat kein Backend und fällt dort auf den Client-Export zurück).

## Browser-Export vs. Pandoc-Export

Die Export-Pipeline der Desktop-App nutzt **Pandoc / manuscripta** und
liefert die hochwertigste Ausgabe — volle Template-Kontrolle, anspruchs-
volles PDF-/LaTeX-Satzbild und die write-book-template-Projektstruktur.

Der Browser-Export ist eine eigenständige, abhängigkeitsfreie Alternative
für den backendlosen Build. Er deckt dieselben sechs Formate ab und ist
ideal für schnelle Exporte und für das vollständig offline Arbeiten. Für
druckreife Print-PDFs und die volle Template-Pipeline nutze die
Desktop-App mit der Backend-Engine — siehe [EPUB](epub.md) und
[PDF](pdf.md).
