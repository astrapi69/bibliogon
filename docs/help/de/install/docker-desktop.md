# Docker Desktop für Bibliogon installieren

Bibliogon läuft in Docker, einer Containerisierungs-Plattform. Du musst Docker Desktop installieren, bevor du den Bibliogon-Launcher startest.

## Warum Docker?

Bibliogons Backend ist eine Python-Anwendung mit mehreren Abhängigkeiten (Datenbank, Plugin-Laufzeit, Export-Pipeline). Docker bündelt alles in einen isolierten Container, sodass du Python, SQLite, Pandoc oder andere Bestandteile nicht selbst installieren musst. Docker Desktop wird von Docker Inc. gepflegt und ist sehr verbreitet.

## Ist Docker sicher zu installieren?

Kurz: ja. Docker ist etablierte Software eines bekannten Anbieters; die einzige Sicherheitsregel lautet, sie von der richtigen Stelle herunterzuladen.

- **Docker stammt von Docker Inc.** Lade ausschließlich von [docker.com](https://www.docker.com/products/docker-desktop/) herunter. Vermeide Drittanbieter-Downloadseiten.
- **Etabliert seit 2013.** Docker existiert seit über einem Jahrzehnt, gehört zum Standard-Werkzeugkasten von Entwicklerinnen und Entwicklern und wird weltweit von Millionen Anwendern und Unternehmen eingesetzt.
- **Der Installer ist signiert.** Unter Windows und macOS sind Dockers Installer von Docker Inc. signiert; das Betriebssystem prüft die Signatur, bevor die Datei ausgeführt wird – so weißt du, dass sie echt und unverändert ist.
- **Unter Windows nutzt Docker Desktop WSL 2.** WSL 2 ist eine Microsoft-Technologie, die einen schlanken Linux-Kernel bereitstellt; nichts Exotisches.
- **Unter macOS nutzt Docker Desktop Hypervisor.framework.** Das ist Apples eingebaute Virtualisierung – dieselbe Schnittstelle, die auch andere Entwickler-Tools verwenden.
- **Telemetrie ist optional.** Docker Desktop sendet standardmäßig anonyme Nutzungsstatistiken. Du kannst das in **Docker Desktop Einstellungen > Allgemein > Nutzungsstatistiken senden** abschalten.
- **Bibliogons eigene Container sind Open Source.** Deine Buchdaten liegen in einem Docker-Volume auf deinem Computer; nichts wird irgendwohin gesendet, solange du nicht selbst exportierst oder ein Backup erstellst.

Wer mehr lesen möchte: die offizielle [Docker-Sicherheits-Übersicht](https://docs.docker.com/security/) beschreibt Dockers Sicherheitsmodell und Isolations-Garantien.

## Voraussetzungen

- Windows 10/11 64-Bit, macOS 12 (Monterey) oder neuer, oder eine aktuelle Linux-Distribution
- ~4 GB freier RAM
- ~5 GB Speicherplatz (Docker selbst plus Bibliogons Container)
- Administrator- bzw. sudo-Rechte für die Installation

## Windows

1. Lade Docker Desktop von [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) herunter.
2. Starte den Installer. Übernimm die Voreinstellungen; das WSL-2-Backend ist empfohlen.
3. Starte den Computer neu, falls der Installer dazu auffordert.
4. Öffne Docker Desktop über das Startmenü. Warte, bis das Wal-Symbol in der Taskleiste von gelb-orange auf blau wechselt (etwa 30-60 Sekunden).
5. Jetzt kannst du den Bibliogon-Launcher starten.

Falls eine Meldung „WSL 2 installation is incomplete" erscheint, öffne PowerShell als Administrator, führe `wsl --install` aus und starte den Rechner neu.

## macOS

1. Lade Docker Desktop von [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) herunter. Wähle die Intel- oder Apple-Silicon-Variante passend zu deinem Mac (im Zweifel: Apple-Menü > Über diesen Mac).
2. Öffne die `.dmg`-Datei und ziehe Docker in den Programme-Ordner.
3. Starte Docker aus dem Programme-Ordner. macOS fragt nach deinem Passwort, um Hilfsdienste zu installieren.
4. Warte, bis das Wal-Symbol in der Menüleiste von gelb-orange auf blau wechselt (etwa 30-60 Sekunden).
5. Jetzt kannst du den Bibliogon-Launcher starten.

## Linux

Docker Desktop ist auch für Linux verfügbar; die meisten Linux-Nutzer ziehen jedoch Docker Engine plus Docker Compose über den Paketmanager der Distribution vor. Für Ubuntu / Debian:

```bash
sudo apt update
sudo apt install docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# Ab- und wieder anmelden, damit die Gruppenänderung wirkt.
```

Für andere Distributionen siehe die offizielle [Docker-Engine-Installationsanleitung](https://docs.docker.com/engine/install/).

## Fehlersuche

- **„Docker is not running" nach der Installation.** Starte Docker Desktop manuell; es startet auf den meisten Systemen nicht automatisch beim Hochfahren.
- **Container-Build schlägt fehl mit „no space left on device".** Öffne Docker Desktop > Einstellungen > Ressourcen > Disk-image-Größe. Erhöhe auf mindestens 60 GB, wenn die Voreinstellung kleiner ist.
- **Virenscanner warnt vor dem Docker-Installer.** Stelle sicher, dass du tatsächlich von [docker.com](https://www.docker.com/) heruntergeladen hast (nicht von einer Klon-Seite) und prüfe vor dem Ausführen die digitale Signatur unter Eigenschaften > Digitale Signaturen (Windows).

## Nächste Schritte

Sobald Docker installiert ist und läuft, kehre zum Bibliogon-Launcher zurück und klicke auf „Verstanden, weiter". Bibliogon erkennt Docker, lädt sich selbst herunter und startet.
