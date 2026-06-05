# Dialoge werden zu Seiten

Acht große Dialoge sind in Bibliogon zu vollwertigen Seiten mit eigener Adresse geworden. Statt eines Overlays, das den restlichen Bildschirm sperrt, öffnet sich jetzt eine eigene Seite mit der gewohnten App-Kopfzeile und zentriertem Inhalt.

## Was sich geändert hat

Früher öffneten sich große Funktionen wie Buch anlegen oder Export als modaler Dialog über der aktuellen Ansicht. Diese Overlays waren auf dem Smartphone oft zu eng und ließen sich nur über einen Schließen-Knopf verlassen.

Jetzt gilt für diese acht Funktionen:

- Jede hat eine echte Adresse (URL), die du als Lesezeichen speichern oder teilen kannst.
- Die Zurück- und Vorwärts-Knöpfe des Browsers funktionieren wie erwartet.
- Auf dem Smartphone füllt die Seite den ganzen Bildschirm, statt dich in einem winzigen Fenster gefangen zu halten.
- Die Kopfzeile bleibt dieselbe wie auf dem Dashboard, du bist also klar erkennbar weiterhin in Bibliogon.

## Die neuen Seiten

Diese acht Funktionen sind jetzt eigene Seiten. Die Platzhalter in den Adressen (zum Beispiel die Buch-Nummer) setzt Bibliogon automatisch ein, wenn du auf den jeweiligen Knopf klickst.

- **Buch anlegen** unter `/books/new?type=`: der Teil hinter `type=` hält fest, welche Buchart du anlegst.
- **Text anlegen** unter `/articles/new?type=`: der Teil hinter `type=` hält die Textart fest.
- **Export** unter `/books/:bookId/export`: pro Buch, mit allen Exportformaten an einer Stelle.
- **Schreibverlauf** unter `/writing-history`: global über alle Bücher hinweg, nicht pro Buch.
- **Kapitel-Snapshots** unter `/books/:bookId/chapters/:chapterId/snapshots`: die gespeicherten Versionen eines einzelnen Kapitels.
- **Git-Sicherung** unter `/books/:bookId/git-backup`: pro Buch.
- **Git-Synchronisierung** unter `/books/:bookId/git-sync`: pro Buch.
- **Tastenkürzel** unter `/help/shortcuts`: die vollständige Übersicht. `Strg + /` springt jetzt direkt hierher.

## Kapitel direkt verlinkbar

Im Editor steht das aktuell geöffnete Kapitel jetzt in der Adresse (`?chapter=<id>`). Dadurch kannst du einen Link auf ein ganz bestimmtes Kapitel als Lesezeichen ablegen oder weitergeben. Wenn du außerdem einen Snapshot wiederherstellst, kehrst du anschließend genau zu dem passenden Kapitel zurück.

## So nutzt du die neuen Seiten

- **Lesezeichen setzen:** Speichere zum Beispiel den Schreibverlauf oder ein bestimmtes Kapitel als Browser-Lesezeichen und springe später mit einem Klick dorthin.
- **Links teilen:** Schicke dir selbst (oder Mitarbeitenden, sofern sie Zugriff haben) die Adresse einer Exportseite oder eines Kapitels.
- **Browser-Navigation:** Nutze Zurück und Vorwärts, um zwischen Seiten zu wechseln, ohne erst einen Schließen-Knopf zu suchen.
- **Mobil arbeiten:** Auf dem Smartphone füllen diese Seiten den ganzen Bildschirm und sind dadurch deutlich angenehmer zu bedienen.

## Was weiterhin ein Dialog bleibt

Nicht alles wurde umgestellt. Bewusst ein Dialog bleiben:

- **Bestätigungen:** kurze Ja/Nein-Abfragen und Sicherheitsabfragen vor dem Löschen oder Wiederherstellen.
- **Assistenten mit Zwischenstand:** der Import-Assistent, der Assistent zum Umwandeln eines Textes in ein Buch und die KI-Einrichtung. Ein Link mitten in einen solchen Schritt wäre ohne den Zwischenstand sinnlos.
- **Die Spenden-Einblendung** beim ersten Start, die die App selbst anzeigt.
- **Kleine, an ihren Kontext gebundene Dialoge**, die nur kurz an Ort und Stelle gebraucht werden.

## Tipps

- Wenn ein Lesezeichen auf ein Kapitel oder ein Buch ins Leere führt, wurde der Inhalt vermutlich gelöscht oder die Nummer hat sich geändert. Öffne das Buch dann erneut über das Dashboard.
- Die Tastenkürzel-Seite ist jetzt eine reine Nachschlage-Seite. Lege sie als Lesezeichen ab, wenn du sie häufig brauchst.

## Verwandte Themen

- [Schreibverlauf](editor/writing-history.md)
- [Snapshots](editor/snapshots.md)
- [EPUB-Export](export/epub.md)
- [PDF-Export](export/pdf.md)
- [Git-Sicherung](git-backup/basics.md)
- [Tastenkürzel](shortcuts.md)
