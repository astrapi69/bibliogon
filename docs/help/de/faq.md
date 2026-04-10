# Haeufig gestellte Fragen (FAQ)

## Welches Format wird intern gespeichert?

Bibliogon speichert Kapitelinhalte als TipTap-JSON. TipTap-JSON ist ein strukturiertes Dokumentenformat, das Absaetze, Ueberschriften, Listen, Bilder und alle weiteren Elemente als verschachtelte Knoten abbildet. Beim Export wird dieses JSON-Format automatisch in Markdown konvertiert, das dann ueber manuscripta und Pandoc in das Zielformat (EPUB, PDF, DOCX) umgewandelt wird. Der Vorteil von TipTap-JSON gegenueber Markdown als Speicherformat: es bewahrt alle Formatierungsinformationen verlustfrei, einschliesslich Bilder mit Bildunterschriften, Tabellen und Fussnoten.

## Wie exportiere ich mein Buch?

Oeffne dein Buch im Editor. In der Sidebar unten findest du Export-Buttons fuer die verfuegbaren Formate: EPUB, PDF, Word (DOCX), HTML, Markdown und Projektstruktur (ZIP). Klicke auf das gewuenschte Format, waehle im Export-Dialog den Buchtyp (E-Book, Paperback, Hardcover) und starte den Export. Die exportierte Datei wird als Download bereitgestellt.

## Kann ich ein bestehendes Projekt importieren?

Ja. Auf dem Dashboard klicke "Projekt importieren" und waehle eine ZIP-Datei im write-book-template-Format. Bibliogon liest die Verzeichnisstruktur (front-matter, chapters, back-matter), Metadaten (metadata.yaml), Assets und die Kapitelreihenfolge (export-settings.yaml) automatisch ein. Markdown-Dateien werden zu TipTap-JSON konvertiert und als Kapitel angelegt. Auch Bilder und das Cover werden importiert.

## Wie funktioniert das Backup?

Klicke "Backup" auf dem Dashboard. Alle Buecher, Kapitel, Assets und Einstellungen werden in eine .bgb-Datei (ZIP-Archiv) exportiert. Zum Wiederherstellen klicke "Restore" und waehle die .bgb-Datei aus. Der gesamte Zustand wird wiederhergestellt, bestehende Daten werden dabei ueberschrieben. Audiobook-Dateien koennen optional mitgesichert werden, erhoehen aber die Backup-Groesse erheblich.

## Was ist der Markdown-Modus?

Im Editor kannst du zwischen WYSIWYG und Markdown umschalten. Im WYSIWYG-Modus (Standard) arbeitest du visuell mit der Toolbar und siehst das Ergebnis sofort. Im Markdown-Modus siehst du den rohen Markdown-Quelltext und kannst ihn direkt bearbeiten. Beim Umschalten konvertiert Bibliogon den Inhalt automatisch zwischen den Formaten. Der Markdown-Modus eignet sich fuer erfahrene Nutzer, die schneller mit Markdown-Syntax arbeiten als mit der Toolbar.

## Wie aktiviere ich ein Premium-Plugin?

Gehe zu Einstellungen > Lizenzen. Gib den Plugin-Namen (z.B. "audiobook") und deinen Lizenzschluessel ein und klicke auf "Aktivieren". Der Schluessel wird offline validiert. Fuer Testzwecke kannst du einen 30-Tage-Trial-Key generieren: `make generate-trial-key`. Trial-Keys gelten fuer alle Premium-Plugins gleichzeitig.

## Funktioniert Bibliogon offline?

Ja. Bibliogon nutzt SQLite als lokale Datenbank und speichert alle Daten auf deinem Rechner. Es wird kein externer Server benoetigt. Lizenzschluessel werden ebenfalls offline validiert (HMAC-signiert). Nur Plugins, die auf externe Dienste zugreifen, benoetigen eine Internetverbindung: Grammar (LanguageTool-Server), Translation (DeepL/LMStudio) und Audiobook mit Edge TTS, Google Cloud TTS oder ElevenLabs. Die Offline-TTS-Engine pyttsx3 funktioniert auch ohne Internet.
