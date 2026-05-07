# Plattformübergreifende Installer-Skripte

Bibliogon liefert vier Installer-Einstiegspunkte aus, die alle dasselbe tun — Bibliogon herunterladen, Docker-Image bauen, App auf `http://localhost:7880` starten. Wähle den Einstiegspunkt, den dein Betriebssystem versteht.

## Schnellübersicht

| Plattform | Einstiegspunkt | Befehl |
|----------|----------------|--------|
| Linux / macOS (Terminal) | `install.sh` | `curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh \| bash` |
| Windows (PowerShell) | `install.ps1` | `irm https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.ps1 \| iex` |
| macOS (Finder-Doppelklick) | `install.command` | Repo klonen oder herunterladen, im Finder auf `install.command` doppelklicken |
| Windows (Doppelklick) | `install.cmd` | Repo klonen oder herunterladen, auf `install.cmd` doppelklicken |

## Was jedes Skript tut

Alle vier Einstiegspunkte führen dieselben fünf Schritte aus:

1. Docker (und Docker Compose) prüfen. Abbruch mit Download-Link, falls nicht installiert.
2. Bibliogon-Repo am gepinnten Release-Tag klonen (oder Tarball herunterladen, wenn `git` fehlt).
3. `BIBLIOGON_SECRET_KEY` und `BIBLIOGON_CREDENTIALS_SECRET` generieren, falls nicht vorhanden.
4. `.env`-Datei im Installationsverzeichnis schreiben.
5. `docker compose up -d` ausführen und auf den Health-Endpoint warten.

Standard-Installationsverzeichnis: `~/bibliogon` (Linux/macOS) bzw. `%USERPROFILE%\bibliogon` (Windows). Übersteuern via Umgebungsvariable `BIBLIOGON_DIR`. Version übersteuern via `BIBLIOGON_VERSION=vX.Y.Z`.

## Voraussetzungen

- **Docker Desktop** (Windows, macOS) oder **Docker Engine + Compose-Plugin** (Linux). Siehe die [Docker-Desktop-Installationsanleitung](docker-desktop.md).
- **~5 GB Speicherplatz** für das Docker-Image und deine Daten.
- **Internetzugang** zum Herunterladen von Bibliogon und der Basis-Images.

Du brauchst **kein** Python, Node, Poetry, npm oder andere Tools. Alles läuft im Docker-Container.

## install.sh (Linux / macOS, curl-Pipe)

Der ursprüngliche Einstiegspunkt. Einzeiler:

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

Das Skript wird zur Release-Zeit aus `install.sh.template` generiert; die fertige Datei ist im Repo eingecheckt, damit die curl-Pipe-URL direkt funktioniert. Vorher lesen ist erlaubt und empfohlen: `curl -fsSL ... -o install.sh`, prüfen, dann `bash install.sh`.

## install.ps1 (Windows, PowerShell)

PowerShell-Spiegel von `install.sh`, generiert aus `install.ps1.template` via `make sync-versions`. Dieselben fünf Schritte, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.ps1 | iex
```

`irm` (`Invoke-RestMethod`) lädt das Skript herunter; `iex` (`Invoke-Expression`) führt es aus. Wie bei curl-Pipe: erst herunterladen und prüfen, wenn du willst (`irm ... -OutFile install.ps1`).

## install.command (macOS, Finder-Doppelklick)

Ein 10-zeiliger Wrapper um `install.sh`, der die Installation ohne Terminal startet. Finder behandelt `.command`-Dateien als ausführbar. Nach dem Klonen oder Herunterladen des Repos:

1. Finder öffnen, ins Bibliogon-Verzeichnis navigieren.
2. Doppelklick auf `install.command`.
3. Beim ersten Start die Gatekeeper-Warnung bestätigen (Rechtsklick → Öffnen ist der dokumentierte Umweg).

Der Wrapper trägt keinen Versions-Platzhalter; er `cd`t in sein Verzeichnis und ruft `install.sh` auf, sodass `install.sh` die einzige Versions-Quelle bleibt.

## install.cmd (Windows, Doppelklick)

Ein 7-zeiliger Batch-Wrapper um `install.ps1`. Im Explorer doppelklicken zum Starten; `install.cmd` ruft PowerShell mit `-NoProfile -ExecutionPolicy Bypass` auf, sodass Firmen-Windows mit per Group Policy gesperrter ExecutionPolicy den Installer trotzdem startet. Der Benutzer muss **nicht** selbst `Set-ExecutionPolicy` ausführen.

Beim ersten Start gilt dieselbe SmartScreen-Warnung: „Weitere Informationen" → „Trotzdem ausführen".

## Unsignierte Binärdateien

Alle vier Wrapper werden **unsigniert** ausgeliefert (Launch-Entscheidung). Das bedeutet:

- **macOS-Benutzer sehen eine Gatekeeper-Warnung** beim ersten Doppelklick auf `install.command`. Der dokumentierte Umweg: Rechtsklick auf die Datei im Finder → Öffnen → im Dialog Öffnen bestätigen.
- **Windows-Benutzer sehen eine SmartScreen-Warnung** beim ersten Start von `install.cmd`. Umweg: „Weitere Informationen" → „Trotzdem ausführen" im SmartScreen-Dialog.

Bezahlte Signaturzertifikate würden diese Warnungen entfernen. Sie sind aufgeschoben, bis die Verbreitung die Pro-Plattform-Signaturkosten rechtfertigt. Die Warnungen sind kein Sicherheitsproblem — sie bedeuten nur, dass die Datei nicht von einer kostenpflichtigen Zertifizierungsstelle signiert wurde. Das Repo ist Open Source, und die Installer-Skripte sind kurz genug, um sie in wenigen Minuten zu lesen, falls du verifizieren willst, was sie tun.

## Manuelle Installation (ohne Wrapper)

Die Wrapper sind Komfort. Der zugrundeliegende Ablauf ist nur:

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
./start.sh
```

`start.sh` macht dieselbe `.env`-Generierung und `docker compose up -d`, die die Wrapper-Skripte ausführen. Nimm diesen Weg, wenn du das Repo lieber liest, bevor du dich festlegst.

## Stoppen, Neustart, Deinstallation

Nach der Installation:

```bash
cd ~/bibliogon && ./stop.sh         # Stoppen
cd ~/bibliogon && ./start.sh        # Neu starten
cd ~/bibliogon && ./stop.sh && cd ~ && rm -rf ~/bibliogon  # Vollständige Deinstallation
```

Der Bibliogon-Launcher (die Binärdatei aus den GitHub Releases) verpackt denselben Lebenszyklus in eine Tray-Icon-UI; siehe [Windows-Launcher](../launcher-windows.md), [macOS-Launcher](../launcher-macos.md), [Linux-Launcher](../launcher-linux.md).

> Zuletzt geprüft für v0.29.0 (2026-05-07).
