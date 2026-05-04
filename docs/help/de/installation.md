# Installation

> **Mit Terminal vertraut?** Der Docker-/curl-Installationsweg steht unter [Erste Schritte](getting-started.md). Diese Seite ist der empfohlene Weg für Nutzer, die eine grafische Installation bevorzugen.

Bibliogon liefert einen Desktop-Launcher für Windows, macOS und Linux. Der Launcher ist ein kleines Programm, das die Bibliogon-Seite der Installation für dich übernimmt (Release herunterladen, Konfiguration vorbereiten, Docker-Images bauen, Browser öffnen). Du musst nur Docker Desktop selbst installieren; den Rest erledigt der Launcher beim ersten Start.

## Voraussetzungen

- [Docker Desktop](https://docs.docker.com/get-docker/) installiert und gestartet. Der Launcher prüft das beim Start; wenn Docker Desktop fehlt oder nicht läuft, zeigt er einen Dialog mit Link zur Docker-Download-Seite und beendet sich sauber. Der Bibliogon-Launcher kann (und darf gemäß Docker-Lizenzbedingungen) Docker Desktop nicht für dich installieren.

## Plattform wählen

| Plattform | Was wird heruntergeladen | Start |
|-----------|--------------------------|-------|
| [Windows](launcher-windows.md) | `bibliogon-launcher.exe` | Doppelklick auf die `.exe`, beim ersten Start SmartScreen bestätigen |
| [macOS](launcher-macos.md) | `bibliogon-launcher-macos.zip` (arm64) | Entpacken, Rechtsklick auf das `.app`, beim ersten Start Gatekeeper bestätigen |
| [Linux](launcher-linux.md) | `bibliogon-launcher-linux` (ELF-Binary) | `chmod +x`, dann im Terminal oder Dateimanager starten |

Der Kern aller drei Launcher ist gleich:

- Erkennung von Docker Desktop beim Start, mit klarem Dialog, falls es fehlt oder nicht läuft
- Willkommensablauf beim ersten Start (siehe unten), der Bibliogon herunterlädt und einrichtet, falls noch nicht vorhanden
- Browser öffnet sich unter `http://localhost:7880`, sobald der Stack gesund meldet
- Schaltfläche **Bibliogon stoppen** fährt den Stack sauber herunter
- Aktivitätslog mit Rotation (1 MB, 1 Backup) im Konfigurationsverzeichnis der Plattform
- Hinweis auf neue Versionen beim Start (Opt-out in den Einstellungen)

## Was beim ersten Start passiert

Wenn Docker Desktop installiert ist und läuft, Bibliogon selbst aber noch nicht auf der Festplatte liegt, führt dich der Launcher durch die Installation:

1. **Willkommensdialog**: Ein Fenster mit drei Schaltflächen erscheint - "Bibliogon ist auf diesem Rechner noch nicht installiert". Wähle **Installieren** für den automatischen Ablauf, **Installationsanleitung öffnen** für die Dokumentation im Browser, oder **Schließen** zum Beenden.
2. **Ordner-Auswahl**: Wenn du Installieren gewählt hast, fragt der Launcher, wo Bibliogon liegen soll (Standard: `~/bibliogon` auf macOS/Linux, `%USERPROFILE%\bibliogon` auf Windows). Du kannst überschreiben; die Wahl wird gemerkt.
3. **Download**: Der Launcher holt die Bibliogon-Release-ZIP von GitHub, entpackt sie und schreibt eine frische `.env` mit generiertem Secret. Schnell (wenige Sekunden bei normaler Verbindung).
4. **Docker-Build**: Docker lädt Basis-Images herunter und baut den Bibliogon-Stack. Der erste Build ist der langsame Teil - typischerweise 3-5 Minuten, je nach Rechner und Verbindung. Spätere Starts überspringen das.
5. **Health-Wait**: Der Launcher wartet, bis das Backend auf Port 7880 als gesund meldet, und öffnet dann den Browser auf `http://localhost:7880`.
6. **Statusfenster**: Ein kleines Fenster bleibt offen und zeigt "Bibliogon läuft auf localhost:7880" mit einer Schaltfläche **Bibliogon stoppen**. Wenn du das Fenster schließt, stoppt der Stack sauber.

Bei späteren Starts werden Schritte 1-3 übersprungen. Der Launcher erkennt die bestehende Installation über eine Manifest-Datei, führt `docker compose up` aus, wartet auf den Health-Check und öffnet den Browser.

## Was der Launcher nicht macht

- **Er installiert Docker Desktop nicht.** Docker-Lizenzbedingungen verbieten eine stille Drittanbieter-Installation, dieser Schritt bleibt manuell. Der Launcher erkennt nur und weist an.
- **Er läuft nicht als Hintergrunddienst.** Der Launcher ist ein Vordergrundprogramm; das Schließen des Fensters stoppt Bibliogon. Wer Bibliogon dauerhaft laufen lassen will, lässt das Launcher-Fenster offen oder nutzt den Terminal-Weg (siehe Erste Schritte) und `docker compose` als Dienst.

## Terminal-Alternative

Wer lieber im Terminal arbeitet - oder den Bibliogon-Lebenszyklus skripten, auf einem Server laufen lassen oder die Launcher-GUI komplett umgehen will - findet in [Erste Schritte](getting-started.md) den Weg. Der Terminal-Pfad nutzt `start.sh` / `stop.sh` und produziert denselben Docker-Stack auf demselben Port. Du kannst beides mischen: per Launcher installieren, per Skript verwalten - oder umgekehrt.

## Konfigurationsverzeichnis

Jede Plattform speichert den Launcher-Zustand (gemerkter Installationspfad, Aktivitätslog, Update-Einstellung) im Standard-Konfigurationsverzeichnis des Benutzers:

| Plattform | Pfad |
|-----------|------|
| Windows | `%APPDATA%\bibliogon\` |
| macOS | `~/Library/Application Support/bibliogon/` |
| Linux | `~/.config/bibliogon/` |

Dieses Verzeichnis kann jederzeit gelöscht werden; der Launcher fragt beim nächsten Start wieder nach dem Installationsordner (oder zeigt den Willkommensablauf, falls keine Installation gefunden wird).

## Deinstallation

Siehe [Deinstallieren](uninstall.md) für den Launcher-Weg und das Skript-Fallback. Das Löschen der Buchdaten (Docker-Volumes) ist auf allen Plattformen Opt-in.

## Weiter

Klicke oben auf deine Plattform. Sobald das Launcher-Fenster "Bibliogon läuft auf localhost:7880" zeigt, geht es in [Erste Schritte](getting-started.md) mit dem ersten Buch weiter.
