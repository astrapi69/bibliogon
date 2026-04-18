# Installation

Bibliogon läuft unter Windows, macOS und Linux. Auf allen drei Plattformen ist die eigentliche Anwendung derselbe Docker-Stack unter `http://localhost:7880`; nur der Weg zum Starten und Stoppen unterscheidet sich.

## Plattform wählen

| Plattform | Was wird heruntergeladen | Start |
|-----------|--------------------------|-------|
| [Windows](launcher-windows.md) | `bibliogon-launcher.exe` | Doppelklick auf die `.exe`, beim ersten Start SmartScreen bestätigen |
| [macOS](launcher-macos.md) | `bibliogon-launcher-macos.zip` (arm64) | Entpacken, Rechtsklick auf das `.app`, beim ersten Start Gatekeeper bestätigen |
| [Linux](launcher-linux.md) | `bibliogon-launcher-linux` (ELF-Binary) | `chmod +x`, dann im Terminal oder Dateimanager starten |

Der Kern aller drei Launcher ist gleich:

- Einmaliger Ordner-Picker beim ersten Start, gemerkt in `install.json`
- Docker-Check vor dem Start des Stacks
- Browser öffnet sich unter `http://localhost:7880`, sobald der Stack bereit ist
- Schaltfläche **Bibliogon stoppen** fährt den Stack sauber herunter
- Aktivitätslog mit Rotation (1 MB, 1 Backup) im Konfigurationsverzeichnis der Plattform
- Hinweis auf neue Versionen beim Start (Opt-out in den Einstellungen)

## Was der Launcher nicht kann

Der Launcher ist **kein** vollständiger Installer. Er erwartet, dass Bibliogon selbst bereits auf der Festplatte liegt (geklont oder aus dem Release-ZIP entpackt). Wenn du nur den Launcher auf einem frischen Rechner startest, weist er dich darauf hin, zuerst Bibliogon zu installieren, und beendet sich. Ein "Ein-Klick installiert alles"-Pfad ist als D-05 vorgemerkt und hängt vom Nutzerfeedback ab.

Wer lieber im Terminal arbeitet, nutzt das Skript `install.sh` im [Haupt-Repository](https://github.com/astrapi69/bibliogon#installation).

## Konfigurationsverzeichnis

Jede Plattform speichert den Launcher-Zustand (gemerkter Installationspfad, Aktivitätslog, Update-Einstellung) im Standard-Konfigurationsverzeichnis des Benutzers:

| Plattform | Pfad |
|-----------|------|
| Windows | `%APPDATA%\bibliogon\` |
| macOS | `~/Library/Application Support/bibliogon/` |
| Linux | `~/.config/bibliogon/` |

Dieses Verzeichnis kann jederzeit gelöscht werden; der Launcher fragt beim nächsten Start wieder nach dem Installationsordner.

## Deinstallation

Siehe [Deinstallieren](uninstall.md) für den Launcher-Weg und das Skript-Fallback. Das Löschen der Buchdaten (Docker-Volumes) ist auf allen Plattformen Opt-in.

## Weiter

Klicke oben auf deine Plattform. Sobald das Launcher-Fenster "Bibliogon läuft auf localhost:7880" zeigt, geht es in [Erste Schritte](getting-started.md) mit dem ersten Buch weiter.
