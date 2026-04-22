# Erste Schritte

## Installation

Bibliogon lässt sich auf zwei Wegen installieren. Für die lokale Entwicklung genügt es, das Repository zu klonen und `make install` auszuführen. Dieser Befehl installiert sowohl die Python-Abhängigkeiten (via Poetry) als auch die Frontend-Pakete (via npm) und richtet alle mitgelieferten Plugins ein. Alternativ steht ein Docker-Setup bereit: `make prod` startet die Anwendung als Container auf Port 7880, ohne dass Python oder Node.js lokal installiert sein müssen.

Für den PDF-Export wird Pandoc benötigt. Pandoc ist ein separates Kommandozeilenwerkzeug, das unter [pandoc.org](https://pandoc.org/installing.html) heruntergeladen werden kann. EPUB-Export funktioniert auch ohne Pandoc, da manuscripta die Konvertierung übernimmt.

## Erster Start

Nach der Installation startet `make dev` zwei parallele Prozesse: das FastAPI-Backend auf Port 8000 und das React-Frontend auf Port 5173. Sobald beide Prozesse laufen, öffne einen Browser und navigiere zu `http://localhost:5173`. Du landest auf dem Dashboard, der zentralen Übersicht über alle Bücher.

Beim ersten Start ist die Datenbank leer. Bibliogon nutzt SQLite als lokale Datenbank. Alle Daten liegen auf deinem Rechner, es wird kein externer Server benötigt. Über die Einstellungen kannst du Sprache und Theme anpassen. Es stehen sechs Themes (Warm Literary, Cool Modern, Nord, Klassisch, Studio, Notizbuch) jeweils in Light- und Dark-Variante zur Verfügung - Details im Abschnitt Themes.

## Dashboard: Filter, Sortierung, Papierkorb

Wenn die Buchsammlung wächst, bietet das Dashboard oberhalb des Buch-Rasters Such-, Filter- und Sortier-Steuerungen. Du kannst nach Titel, Autor, Genre oder Sprache suchen, nach Genre und Sprache filtern und nach Datum, Titel oder Autor in beiden Richtungen sortieren.

![Dashboard: Filter und Sortierung](../assets/screenshots/dashboard-filter-sort.png)

Gelöschte Bücher landen im Papierkorb (Soft-Delete). Die Papierkorb-Ansicht listet sie mit drei Aktionen: **Wiederherstellen** holt ein Buch zurück in die Bibliothek, **Endgültig löschen** entfernt Buch und Dateien sofort, **Papierkorb leeren** entfernt alles auf einmal. Bücher im Papierkorb werden nach 90 Tagen automatisch gelöscht; die Frist lässt sich in den Einstellungen konfigurieren.

![Papierkorb-Ansicht mit Wiederherstellen, Endgültig löschen, Papierkorb leeren](../assets/screenshots/dashboard-trash.png)

## Das erste Buch anlegen

Klicke auf dem Dashboard den Button "Neues Buch". Es öffnet sich ein Dialog mit zwei Stufen: in der ersten gibst du Titel und Autor ein, in der zweiten (aufklappbar über "Weitere Details") kannst du optionale Felder wie Genre, Untertitel, Sprache und Serie ergänzen. Nur Titel und Autor sind Pflichtfelder.

Nach dem Anlegen wirst du direkt in den Editor weitergeleitet. Dort kannst du über die Sidebar Kapitel hinzufügen. Jedes Kapitel hat einen Titel und einen Kapiteltyp (z.B. Kapitel, Vorwort, Nachwort, Glossar). Die Reihenfolge der Kapitel lässt sich per Drag-and-Drop in der Sidebar ändern. Schreibe einfach los, der Editor speichert deine Änderungen automatisch.

## Bestehende Projekte importieren

Wenn du bereits ein Buchprojekt im write-book-template-Format besitzt, kannst du es direkt importieren. Klicke auf dem Dashboard auf "Projekt importieren" und wähle die entsprechende ZIP-Datei aus. Bibliogon liest die Kapitelstruktur, Metadaten (Titel, Autor, ISBN, Sprache) und Assets (Bilder, Cover) automatisch ein und legt das Buch mit allen Inhalten an.

Ebenso lassen sich Backups wiederherstellen. Ein Backup (.bgb-Datei) enthält den gesamten Zustand aller Bücher. Über "Backup" auf dem Dashboard exportierst du den aktuellen Stand, über "Restore" stellst du ihn wieder her.
