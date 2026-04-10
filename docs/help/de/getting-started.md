# Erste Schritte

## Installation

Bibliogon laesst sich auf zwei Wegen installieren. Fuer die lokale Entwicklung genuegt es, das Repository zu klonen und `make install` auszufuehren. Dieser Befehl installiert sowohl die Python-Abhaengigkeiten (via Poetry) als auch die Frontend-Pakete (via npm) und richtet alle mitgelieferten Plugins ein. Alternativ steht ein Docker-Setup bereit: `make prod` startet die Anwendung als Container auf Port 7880, ohne dass Python oder Node.js lokal installiert sein muessen.

Fuer den PDF-Export wird Pandoc benoetigt. Pandoc ist ein separates Kommandozeilenwerkzeug, das unter [pandoc.org](https://pandoc.org/installing.html) heruntergeladen werden kann. EPUB-Export funktioniert auch ohne Pandoc, da manuscripta die Konvertierung uebernimmt.

## Erster Start

Nach der Installation startet `make dev` zwei parallele Prozesse: das FastAPI-Backend auf Port 8000 und das React-Frontend auf Port 5173. Sobald beide Prozesse laufen, oeffne einen Browser und navigiere zu `http://localhost:5173`. Du landest auf dem Dashboard, der zentralen Uebersicht ueber alle Buecher.

Beim ersten Start ist die Datenbank leer. Bibliogon nutzt SQLite als lokale Datenbank. Alle Daten liegen auf deinem Rechner, es wird kein externer Server benoetigt. Ueber die Einstellungen kannst du Sprache und Theme anpassen. Es stehen drei Themes (Warm Literary, Cool Modern, Nord) jeweils in Light- und Dark-Variante zur Verfuegung.

## Das erste Buch anlegen

Klicke auf dem Dashboard den Button "Neues Buch". Es oeffnet sich ein Dialog mit zwei Stufen: in der ersten gibst du Titel und Autor ein, in der zweiten (aufklappbar ueber "Weitere Details") kannst du optionale Felder wie Genre, Untertitel, Sprache und Serie ergaenzen. Nur Titel und Autor sind Pflichtfelder.

Nach dem Anlegen wirst du direkt in den Editor weitergeleitet. Dort kannst du ueber die Sidebar Kapitel hinzufuegen. Jedes Kapitel hat einen Titel und einen Kapiteltyp (z.B. Kapitel, Vorwort, Nachwort, Glossar). Die Reihenfolge der Kapitel laesst sich per Drag-and-Drop in der Sidebar aendern. Schreibe einfach los, der Editor speichert deine Aenderungen automatisch.

## Bestehende Projekte importieren

Wenn du bereits ein Buchprojekt im write-book-template-Format besitzt, kannst du es direkt importieren. Klicke auf dem Dashboard auf "Projekt importieren" und waehle die entsprechende ZIP-Datei aus. Bibliogon liest die Kapitelstruktur, Metadaten (Titel, Autor, ISBN, Sprache) und Assets (Bilder, Cover) automatisch ein und legt das Buch mit allen Inhalten an.

Ebenso lassen sich Backups wiederherstellen. Ein Backup (.bgb-Datei) enthaelt den gesamten Zustand aller Buecher. Ueber "Backup" auf dem Dashboard exportierst du den aktuellen Stand, ueber "Restore" stellst du ihn wieder her.
