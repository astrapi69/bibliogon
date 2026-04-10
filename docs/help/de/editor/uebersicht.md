# Editor-Uebersicht

## Der TipTap-Editor

Bibliogon verwendet TipTap als Texteditor. TipTap ist ein moderner WYSIWYG-Editor, der auf ProseMirror basiert und in allen gaengigen Browsern funktioniert. Du siehst deinen Text so, wie er spaeter im Buch erscheinen wird, mit formatierten Ueberschriften, Listen, Bildern und Zitaten. Intern speichert Bibliogon die Inhalte als TipTap-JSON, nicht als HTML oder Markdown. Beim Export werden die Inhalte automatisch in das Zielformat konvertiert.

## Toolbar

Am oberen Rand des Editors befindet sich die Toolbar mit 24 Schaltflaechen fuer die gaengigsten Formatierungen. Von links nach rechts findest du dort unter anderem: Fett, Kursiv, Durchgestrichen, Code, Ueberschriften (H1 bis H6), Aufzaehlungsliste, nummerierte Liste, Zitat, Trennlinie, Bild einfuegen, Tabelle, Fussnote und Rueckgaengig/Wiederholen. Alle Funktionen sind auch ueber Tastenkuerzel erreichbar (siehe Tastenkuerzel-Seite). Wenn du den Mauszeiger ueber eine Schaltflaeche haeltst, zeigt ein Tooltip die zugehoerige Aktion und das Kuerzel an.

## Kapitel-Sidebar

Links neben dem Editor zeigt die Sidebar die Kapitelstruktur deines Buchs. Jedes Kapitel wird als Eintrag mit Titel und Kapiteltyp angezeigt. Du kannst:

- Neue Kapitel ueber den Plus-Button hinzufuegen
- Die Reihenfolge per Drag-and-Drop aendern
- Kapitel durch Klick auswaehlen und bearbeiten
- Den Kapiteltyp aendern (Kapitel, Vorwort, Nachwort, Glossar, Anhang, etc.)
- Kapitel loeschen (mit Bestaetigung)

Die Kapiteltypen bestimmen, in welchem Abschnitt des exportierten Buchs ein Kapitel erscheint (Front-Matter, Hauptteil, Back-Matter).

## WYSIWYG und Markdown

Der Editor bietet zwei Modi: WYSIWYG (Standard) und Markdown. Im WYSIWYG-Modus arbeitest du visuell mit der Toolbar. Im Markdown-Modus siehst du den Rohtext in Markdown-Syntax und kannst ihn direkt bearbeiten. Beim Wechsel zwischen den Modi konvertiert Bibliogon den Inhalt automatisch. Beachte, dass TipTap intern kein Markdown versteht. Beim Umschalten von Markdown zu WYSIWYG wird der Markdown-Text zu HTML konvertiert und als TipTap-JSON gespeichert.

## Autosave

Der Editor speichert deine Aenderungen automatisch. Jede Aenderung wird mit einem kurzen Verzoegerung (Debounce) an das Backend gesendet und in der SQLite-Datenbank gespeichert. Du musst nicht manuell speichern. Der aktuelle Speicherstatus wird in der Statusleiste angezeigt.
