# Erste Schritte

> **Lieber per Klick statt Terminal?** Der Desktop-Launcher für Windows, macOS und Linux ist unter [Installation](installation.md) dokumentiert. Diese Seite beschreibt den terminalbasierten Weg und die Orientierung danach.

## Installation

Bibliogon läuft als Sammlung von Docker-Containern auf deinem eigenen Rechner. Bücher, Einstellungen und Exporte bleiben lokal; nichts wird zu einem Dienst hochgeladen.

### Voraussetzungen

Du brauchst eine laufende [Docker](https://docs.docker.com/get-docker/)-Installation, bevor du Bibliogon starten kannst. Docker Desktop (Windows, macOS) oder Docker Engine mit Compose (Linux) funktionieren beide.

### Schnellinstallation (empfohlen)

Der Einzeiler lädt Bibliogon nach `~/bibliogon`, baut die Docker-Images und startet die Anwendung.

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

Sobald der Installer fertig ist, öffne [http://localhost:7880](http://localhost:7880) im Browser.

### Manuelle Installation

Wenn du das Repository lieber selbst klonst:

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
./start.sh
```

`start.sh` baut die Images beim ersten Aufruf und startet danach denselben Docker-Stack wie der Einzeiler. Die Anwendung ist unter [http://localhost:7880](http://localhost:7880) erreichbar.

## Bibliogon ausführen

Nach der Installation wird Bibliogon mit zwei Skripten im Installationsverzeichnis gesteuert.

| Aktion      | Befehl                              |
| ----------- | ----------------------------------- |
| Stoppen     | `cd ~/bibliogon && ./stop.sh`       |
| Starten     | `cd ~/bibliogon && ./start.sh`      |
| Neu starten | `./stop.sh && ./start.sh`           |

Beim Stoppen bleiben deine Daten auf der Festplatte erhalten; beim erneuten Starten findest du alles unverändert wieder vor.

## Deinstallation

So entfernst du Bibliogon und alle lokalen Daten:

```bash
cd ~/bibliogon && ./stop.sh
cd ~ && rm -rf ~/bibliogon
```

Das stoppt die Container und löscht das Installationsverzeichnis samt SQLite-Datenbank, hochgeladenen Assets und allen Exporten unter `~/bibliogon`. Lege vorher ein Backup an, wenn du deine Bücher behalten willst (Dashboard > **Backup**).

## Optional: PDF-Export mit Pandoc

EPUB-, Word-, HTML- und Markdown-Export funktionieren ohne weitere Schritte. PDF-Export benötigt [Pandoc](https://pandoc.org/installing.html) im Docker-Container; es ist im Standard-Image enthalten, sodass die meisten Nutzer nichts zusätzlich installieren müssen. Wenn du ein eigenes Image ohne Pandoc baust, schlägt der PDF-Export mit einer eindeutigen Fehlermeldung im Export-Dialog fehl.

## Für Entwickler

Die Arbeit an Bibliogon selbst nutzt ein anderes Setup: `make install` (Poetry + npm + Plugins) und `make dev` (FastAPI auf Port 8000, Vite auf Port 5173). Das Target `make prod` startet denselben Docker-Stack wie `./start.sh`. Die vollständige Entwicklerdokumentation steht im [README](https://github.com/astrapi69/bibliogon#development) und in der [CLAUDE.md](https://github.com/astrapi69/bibliogon/blob/main/CLAUDE.md).

## Erster Start

Wenn du [http://localhost:7880](http://localhost:7880) zum ersten Mal öffnest, ist die Datenbank leer. Bibliogon nutzt SQLite als lokale Datenbank; alle Daten liegen auf deinem Rechner, es wird kein externer Server benötigt. Über die Einstellungen kannst du Sprache und Theme anpassen. Es stehen sechs Themes (Warm Literary, Cool Modern, Nord, Klassisch, Studio, Notizbuch) jeweils in Light- und Dark-Variante zur Verfügung - Details im Abschnitt Themes.

Beim ersten Aufruf zeigt Bibliogon den Onboarding-Assistenten unter `/get-started` an — sieben kurze Schritte, die durch die wichtigsten Funktionen führen.

![Erste-Schritte-Onboarding-Assistent, Schritt 1 von 7](../assets/screenshots/get-started.png)

## Dashboard: Filter, Sortierung, Papierkorb

Wenn die Buchsammlung wächst, bietet das Dashboard oberhalb des Buch-Rasters Such-, Filter- und Sortier-Steuerungen. Du kannst nach Titel, Autor, Genre oder Sprache suchen, nach Genre und Sprache filtern und nach Datum, Titel oder Autor in beiden Richtungen sortieren.

![Bücher-Dashboard: Such-, Filter- und Sortier-Steuerung über dem Buch-Raster](../assets/screenshots/book-dashboard-grid.png)

Gelöschte Bücher landen im Papierkorb (Soft-Delete). Die Papierkorb-Ansicht listet sie mit drei Aktionen: **Wiederherstellen** holt ein Buch zurück in die Bibliothek, **Endgültig löschen** entfernt Buch und Dateien sofort, **Papierkorb leeren** entfernt alles auf einmal. Bücher im Papierkorb werden nach 90 Tagen automatisch gelöscht; die Frist lässt sich in den Einstellungen konfigurieren.

![Papierkorb-Ansicht mit Wiederherstellen, Endgültig löschen, Papierkorb leeren](../assets/screenshots/trash-and-restore.png)

## Das erste Buch anlegen

Klicke auf dem Dashboard auf **Neues Buch**. Es öffnet sich ein Dialog mit zwei Stufen: in der ersten gibst du Titel und Autor ein, in der zweiten (aufklappbar über "Weitere Details") kannst du optionale Felder wie Genre, Untertitel, Sprache und Serie ergänzen. Nur Titel und Autor sind Pflichtfelder.

Nach dem Anlegen wirst du direkt in den Editor weitergeleitet. Dort kannst du über die Sidebar Kapitel hinzufügen. Jedes Kapitel hat einen Titel und einen Kapiteltyp (z.B. Kapitel, Vorwort, Nachwort, Glossar). Die Reihenfolge der Kapitel lässt sich per Drag-and-Drop in der Sidebar ändern. Schreibe einfach los, der Editor speichert deine Änderungen automatisch.

## Bestehende Projekte importieren

Wenn du bereits ein Buchprojekt im write-book-template-Format besitzt, kannst du es direkt importieren. Klicke auf dem Dashboard auf **Importieren** und wähle die entsprechende ZIP-Datei aus. Bibliogon liest die Kapitelstruktur, Metadaten (Titel, Autor, ISBN, Sprache) und Assets (Bilder, Cover) automatisch ein und legt das Buch mit allen Inhalten an.

Ebenso lassen sich Backups wiederherstellen. Eine Backup-Datei (.bgb) enthält den gesamten Zustand aller Bücher. Über **Backup** auf dem Dashboard exportierst du den aktuellen Stand, über **Restore** stellst du ihn wieder her.
