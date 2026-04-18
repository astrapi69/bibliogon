# Bibliogon deinstallieren

Es gibt zwei Wege, Bibliogon zu deinstallieren, je nach Installationsart.

## Weg A: Launcher (alle Plattformen)

Wenn du Bibliogon über einen der Launcher installiert hast ([Windows](launcher-windows.md), [macOS](launcher-macos.md) oder [Linux](launcher-linux.md)):

1. Öffne den Bibliogon-Launcher.
2. Klicke auf **Uninstall**.
3. Bestätige die Abfrage.

Der Launcher entfernt das Installationsverzeichnis und seine eigene Manifest-Datei. Docker-Volumes (deine Buchdaten) bleiben standardmäßig erhalten.

Falls die Deinstallation unterbrochen wird (Prozess abgeschossen, gesperrte Docker-Dateien, Stromausfall), schreibt der Launcher zu Beginn `cleanup.json` und markiert jeden Schritt als abgeschlossen. Beim nächsten Start wiederholt der Launcher stillschweigend jeden Schritt, der noch als unvollständig markiert ist.

Um auch Docker-Volumes und -Images zu entfernen, führe die Befehle im Abschnitt "Was wird entfernt" aus.

## Weg B: Skript (alle Plattformen)

Wenn du Bibliogon über `install.sh` installiert hast oder eine vollständige Entfernung inklusive Docker-Ressourcen möchtest:

```bash
cd ~/bibliogon
bash uninstall.sh
```

Das Skript fragt vor dem Löschen nach einer Bestätigung. Tippe `yes` zum Fortfahren.

## Was wird entfernt

Das Deinstallationsskript entfernt:

| Komponente | Ort | Befehl |
|------------|-----|--------|
| Docker-Container | Laufender Stack | `docker compose -f docker-compose.prod.yml down` |
| Docker-Volumes | Buchdaten, Datenbank | `docker volume ls --filter name=bibliogon -q \| xargs docker volume rm` |
| Docker-Images | Backend- + Frontend-Images | `docker images --filter reference='*bibliogon*' -q \| xargs docker image rm` |
| Launcher-Manifest | Plattform-Konfigurationsverzeichnis | Siehe unten |
| Installationsverzeichnis | `~/bibliogon` (Standard) | `rm -rf ~/bibliogon` |

Launcher-Manifest-Speicherorte:
- Windows: `%APPDATA%\bibliogon\install.json`
- macOS: `~/Library/Application Support/bibliogon/install.json`
- Linux: `~/.config/bibliogon/install.json`

## Daten sichern

Wenn du deine Bücher vor der Deinstallation sichern möchtest:

1. Öffne Bibliogon im Browser
2. Gehe zum Dashboard
3. Nutze **Backup** um jedes Buch als `.bgb`-Datei zu exportieren
4. Speichere die `.bgb`-Dateien an einem sicheren Ort
5. Erst dann deinstallieren

Nach einer Neuinstallation kannst du die `.bgb`-Dateien über **Restore** wieder importieren.
