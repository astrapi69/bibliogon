# Häufig gestellte Fragen (FAQ)

## Welches Format wird intern gespeichert?

Bibliogon speichert Kapitelinhalte als TipTap-JSON. TipTap-JSON ist ein strukturiertes Dokumentenformat, das Absätze, Überschriften, Listen, Bilder und alle weiteren Elemente als verschachtelte Knoten abbildet. Beim Export wird dieses JSON-Format automatisch in Markdown konvertiert, das dann über manuscripta und Pandoc in das Zielformat (EPUB, PDF, DOCX) umgewandelt wird.

## Wie exportiere ich mein Buch?

Öffne dein Buch im Editor. In der Sidebar unten findest du Export-Buttons für die verfügbaren Formate: EPUB, PDF, Word (DOCX), HTML, Markdown und Projektstruktur (ZIP). Klicke auf das gewünschte Format, wähle im Export-Dialog den Buchtyp und starte den Export.

## Kann ich ein bestehendes Projekt importieren?

Ja. Auf dem Dashboard klicke "Projekt importieren" und wähle eine ZIP-Datei im write-book-template-Format. Bibliogon liest die Verzeichnisstruktur, Metadaten, Assets und die Kapitelreihenfolge automatisch ein.

## Wie funktioniert das Backup?

Klicke "Backup" auf dem Dashboard. Alle Bücher, Kapitel, Assets und Einstellungen werden in eine .bgb-Datei exportiert. Zum Wiederherstellen klicke "Restore" und wähle die .bgb-Datei aus.

## Was passiert wenn ich ein Buch lösche?

Standardmäßig werden gelöschte Bücher in den Papierkorb verschoben (Soft-Delete), damit du sie wiederherstellen kannst. Über das Papierkorb-Symbol auf dem Dashboard öffnest du die Papierkorb-Ansicht. Dort hat jedes Buch eine "Wiederherstellen"- und eine "Endgültig löschen"-Aktion. Über "Papierkorb leeren" lassen sich alle Einträge auf einmal endgültig entfernen. Bücher im Papierkorb werden standardmäßig nach 90 Tagen automatisch gelöscht; die Aufbewahrungsdauer lässt sich in den Einstellungen auf 7, 14, 30, 60, 90, 180 oder 365 Tage stellen, oder ganz deaktivieren (manuelles Löschen). Wenn du den Papierkorb komplett überspringen möchtest, aktiviere `delete_permanently` in den Einstellungen; dann werden Löschungen direkt durchgeführt, ohne den Umweg über den Papierkorb.

## Was ist der Markdown-Modus?

Im Editor kannst du zwischen WYSIWYG und Markdown umschalten. Im WYSIWYG-Modus arbeitest du visuell mit der Toolbar. Im Markdown-Modus siehst du den rohen Quelltext. Beim Umschalten konvertiert Bibliogon den Inhalt automatisch.

## Funktioniert Bibliogon offline?

Ja. Bibliogon nutzt SQLite als lokale Datenbank und speichert alle Daten auf deinem Rechner. Schriftarten sind lokal eingebettet. Nur Plugins, die auf externe Dienste zugreifen, benötigen Internet: Grammar (LanguageTool), Translation (DeepL), Audiobook mit Cloud-Engines, und KI mit Cloud-Anbietern.

## Wie richte ich die KI-Funktionen ein?

Gehe zu Einstellungen > Allgemein > KI-Assistent. Aktiviere die KI, wähle einen Anbieter, gib deinen API-Schlüssel ein und teste die Verbindung. Details findest du auf der [KI-Hilfeseite](ai.md).

## Kann ich KI nutzen ohne meinen Text in die Cloud zu senden?

Ja. Wähle LM Studio als Anbieter. Es läuft auf deinem Computer und behält alles lokal.

## Wie finde ich ein bestimmtes Buch?

Nutze die Suchleiste und die Filter-Dropdowns oben auf dem Dashboard. Du kannst nach Genre und Sprache filtern und nach Datum, Titel oder Autor sortieren.

## Was passiert wenn ich den Browser ohne Speichern schließe?

Bibliogon speichert automatisch während du tippst. Zusätzlich werden ungespeicherte Änderungen lokal im Browser gesichert (IndexedDB). Wenn du ein Kapitel mit ungespeicherten Änderungen erneut öffnest, wird dir angeboten diese wiederherzustellen.

## Welche Themes gibt es?

Sechs Themes mit je einem Hell- und Dunkelmodus: Warm Literary, Cool Modern, Nord, Classic, Studio und Notebook. Ändern unter Einstellungen > Allgemein.

## Wie sehe ich die Tastenkürzel?

Drücke Ctrl+/ (Cmd+/ auf macOS) um die Tastenkürzel-Übersicht zu öffnen.
