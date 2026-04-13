# Haeufig gestellte Fragen (FAQ)

## Welches Format wird intern gespeichert?

Bibliogon speichert Kapitelinhalte als TipTap-JSON. TipTap-JSON ist ein strukturiertes Dokumentenformat, das Absaetze, Ueberschriften, Listen, Bilder und alle weiteren Elemente als verschachtelte Knoten abbildet. Beim Export wird dieses JSON-Format automatisch in Markdown konvertiert, das dann ueber manuscripta und Pandoc in das Zielformat (EPUB, PDF, DOCX) umgewandelt wird.

## Wie exportiere ich mein Buch?

Oeffne dein Buch im Editor. In der Sidebar unten findest du Export-Buttons fuer die verfuegbaren Formate: EPUB, PDF, Word (DOCX), HTML, Markdown und Projektstruktur (ZIP). Klicke auf das gewuenschte Format, waehle im Export-Dialog den Buchtyp und starte den Export.

## Kann ich ein bestehendes Projekt importieren?

Ja. Auf dem Dashboard klicke "Projekt importieren" und waehle eine ZIP-Datei im write-book-template-Format. Bibliogon liest die Verzeichnisstruktur, Metadaten, Assets und die Kapitelreihenfolge automatisch ein.

## Wie funktioniert das Backup?

Klicke "Backup" auf dem Dashboard. Alle Buecher, Kapitel, Assets und Einstellungen werden in eine .bgb-Datei exportiert. Zum Wiederherstellen klicke "Restore" und waehle die .bgb-Datei aus.

## Was ist der Markdown-Modus?

Im Editor kannst du zwischen WYSIWYG und Markdown umschalten. Im WYSIWYG-Modus arbeitest du visuell mit der Toolbar. Im Markdown-Modus siehst du den rohen Quelltext. Beim Umschalten konvertiert Bibliogon den Inhalt automatisch.

## Funktioniert Bibliogon offline?

Ja. Bibliogon nutzt SQLite als lokale Datenbank und speichert alle Daten auf deinem Rechner. Schriftarten sind lokal eingebettet. Nur Plugins, die auf externe Dienste zugreifen, benoetigen Internet: Grammar (LanguageTool), Translation (DeepL), Audiobook mit Cloud-Engines, und KI mit Cloud-Anbietern.

## Wie richte ich die KI-Funktionen ein?

Gehe zu Einstellungen > Allgemein > KI-Assistent. Aktiviere die KI, waehle einen Anbieter, gib deinen API-Schluessel ein und teste die Verbindung. Details findest du auf der [KI-Hilfeseite](ai.md).

## Kann ich KI nutzen ohne meinen Text in die Cloud zu senden?

Ja. Waehle LM Studio als Anbieter. Es laeuft auf deinem Computer und behaelt alles lokal.

## Wie finde ich ein bestimmtes Buch?

Nutze die Suchleiste und die Filter-Dropdowns oben auf dem Dashboard. Du kannst nach Genre und Sprache filtern und nach Datum, Titel oder Autor sortieren.

## Was passiert wenn ich den Browser ohne Speichern schliesse?

Bibliogon speichert automatisch waehrend du tippst. Zusaetzlich werden ungespeicherte Aenderungen lokal im Browser gesichert (IndexedDB). Wenn du ein Kapitel mit ungespeicherten Aenderungen erneut oeffnest, wird dir angeboten diese wiederherzustellen.

## Welche Themes gibt es?

Sechs Themes mit je einem Hell- und Dunkelmodus: Warm Literary, Cool Modern, Nord, Classic, Studio und Notebook. Aendern unter Einstellungen > Allgemein.

## Wie sehe ich die Tastenkuerzel?

Druecke Ctrl+/ (Cmd+/ auf macOS) um die Tastenkuerzel-Uebersicht zu oeffnen.
