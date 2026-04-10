# Editor-Übersicht

## Der TipTap-Editor

Bibliogon verwendet TipTap als Texteditor. TipTap ist ein moderner WYSIWYG-Editor, der auf ProseMirror basiert und in allen gaengigen Browsern funktioniert. Du siehst deinen Text so, wie er später im Buch erscheinen wird, mit formatierten Überschriften, Listen, Bildern und Zitaten. Intern speichert Bibliogon die Inhalte als TipTap-JSON, nicht als HTML oder Markdown. Beim Export werden die Inhalte automatisch in das Zielformat konvertiert.

## Toolbar

Am oberen Rand des Editors befindet sich die Toolbar mit 24 Schaltflaechen für die gaengigsten Formatierungen. Von links nach rechts findest du dort unter anderem: Fett, Kursiv, Durchgestrichen, Code, Überschriften (H1 bis H6), Aufzählungsliste, nummerierte Liste, Zitat, Trennlinie, Bild einfügen, Tabelle, Fußnote und Rückgängig/Wiederholen. Alle Funktionen sind auch über Tastenkürzel erreichbar (siehe Tastenkürzel-Seite). Wenn du den Mauszeiger über eine Schaltflaeche haeltst, zeigt ein Tooltip die zugehoerige Aktion und das Kürzel an.

## Kapitel-Sidebar

Links neben dem Editor zeigt die Sidebar die Kapitelstruktur deines Buchs. Jedes Kapitel wird als Eintrag mit Titel und Kapiteltyp angezeigt. Du kannst:

- Neue Kapitel über den Plus-Button hinzufügen
- Die Reihenfolge per Drag-and-Drop ändern
- Kapitel durch Klick auswählen und bearbeiten
- Den Kapiteltyp ändern (Kapitel, Vorwort, Nachwort, Glossar, Anhang, etc.)
- Kapitel löschen (mit Bestaetigung)

Die Kapiteltypen bestimmen, in welchem Abschnitt des exportierten Buchs ein Kapitel erscheint (Front-Matter, Hauptteil, Back-Matter).

## WYSIWYG und Markdown

Der Editor bietet zwei Modi: WYSIWYG (Standard) und Markdown. Im WYSIWYG-Modus arbeitest du visuell mit der Toolbar. Im Markdown-Modus siehst du den Rohtext in Markdown-Syntax und kannst ihn direkt bearbeiten. Beim Wechsel zwischen den Modi konvertiert Bibliogon den Inhalt automatisch. Beachte, dass TipTap intern kein Markdown versteht. Beim Umschalten von Markdown zu WYSIWYG wird der Markdown-Text zu HTML konvertiert und als TipTap-JSON gespeichert.

## Autosave

Der Editor speichert deine Änderungen automatisch. Jede Änderung wird mit einem kurzen Verzoegerung (Debounce) an das Backend gesendet und in der SQLite-Datenbank gespeichert. Du musst nicht manuell speichern. Der aktuelle Speicherstatus wird in der Statusleiste angezeigt.
