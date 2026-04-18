# Linux-Launcher

Der Linux-Launcher ist ein `bibliogon-launcher-linux`-ELF-Binary, das Bibliogon per Klick startet: keine `docker compose`-Kommandos, keine offenen Terminal-Sitzungen. Docker führt die Anwendung weiterhin aus, der Launcher startet und stoppt sie nur für dich.

> **Wichtig: der Launcher ist kein Installer.** Er setzt voraus, dass Bibliogon bereits auf deiner Festplatte liegt. Wenn du nur den Launcher auf einem frischen Rechner startest, weist er dich darauf hin, zuerst Bibliogon zu installieren, und beendet sich. Siehe [Installations-Übersicht](installation.md) für das Gesamtbild.

## Systemanforderungen

- Eine aktuelle 64-Bit-Linux-Distribution (Ubuntu 22.04+, Fedora 38+, Debian 12+, Arch oder vergleichbar). Das Binary wird auf `ubuntu-22.04` gebaut, daher ist glibc 2.35 oder neuer erforderlich. Ältere Distributionen werden nicht unterstützt.
- Docker Engine oder Docker Desktop, mit deinem Benutzer in der Gruppe `docker`.
- Die Tk-Laufzeitumgebung (`python3-tk` auf Debian/Ubuntu, `tk` auf Arch, `python3-tkinter` auf Fedora), falls das im PyInstaller-Binary mitgelieferte Tk meckert. Die meisten Distributionen haben das bereits; Berichte über fehlendes Tk sind bislang nicht aufgetaucht.

## Einmalige Einrichtung

### 1. Docker installieren

Eine der beiden Varianten:

- **Docker Engine** (nativ, empfohlen für Server und minimale Desktops): [docs.docker.com/engine/install](https://docs.docker.com/engine/install/). Nach der Installation den eigenen Benutzer in die Gruppe `docker` aufnehmen und ab- und wieder anmelden:

  ```bash
  sudo usermod -aG docker "$USER"
  ```

- **Docker Desktop für Linux**: [docs.docker.com/desktop/install/linux-install](https://docs.docker.com/desktop/install/linux-install/). Bequemer, aber schwerer.

Prüfen, dass Docker ohne `sudo` erreichbar ist:

```bash
docker info
```

### 2. Bibliogon selbst installieren

Das Bibliogon-Repository in einen Ordner auf deinem Rechner klonen oder herunterladen. Der Launcher sucht zuerst in `~/bibliogon`. Andere Orte funktionieren auch; der Launcher fragt beim ersten Start nach dem Ordner und merkt ihn sich.

Ohne Git: die Quell-ZIP von der [Releases-Seite](https://github.com/astrapi69/bibliogon/releases/latest) herunterladen und nach `~/bibliogon` entpacken.

### 3. Launcher herunterladen

Von der Releases-Seite zwei an das Release angehängte Dateien laden:

- `bibliogon-launcher-linux`
- `bibliogon-launcher-linux.sha256`

Speicherort beliebig; `~/Downloads` ist in Ordnung.

### 4. Download prüfen (optional, aber empfohlen)

Der Launcher ist nicht signiert. Um zu bestätigen, dass das Binary exakt die veröffentlichte Datei ist, im Terminal im Download-Ordner:

```bash
sha256sum bibliogon-launcher-linux
cat bibliogon-launcher-linux.sha256
```

Der Hash von `sha256sum` muss mit der Hex-Zeichenkette in der `.sha256`-Datei übereinstimmen. Wenn nicht, das Binary **nicht** ausführen und das Ganze auf [GitHub Issues](https://github.com/astrapi69/bibliogon/issues) melden.

### 5. Launcher ausführbar machen

```bash
chmod +x bibliogon-launcher-linux
```

Optional in einen Ordner im `PATH` verschieben (zum Beispiel `~/bin` oder `~/.local/bin`), um den Launcher aus jedem Verzeichnis heraus starten zu können.

## Erster Start

Launcher aus dem Terminal starten:

```bash
./bibliogon-launcher-linux
```

Oder, wenn die Desktop-Umgebung das Starten von Binarys aus dem Dateimanager unterstützt, Rechtsklick auf die Datei und "Ausführen" oder "Öffnen" wählen (GNOME Files: in den Einstellungen "Ausführbare Textdateien: Nachfragen" aktivieren).

### Was beim ersten Start passiert

1. Der Launcher prüft, ob Docker installiert und erreichbar ist. Falls nicht, fordert ein Dialog auf, Docker zu starten (oder sich nach der `docker`-Gruppenzuweisung neu anzumelden), und zeigt einen Wiederholen-Knopf.
2. Falls Bibliogon nicht unter `~/bibliogon` liegt, fragt der Launcher nach dem Installationsordner (derjenige, der `docker-compose.prod.yml` enthält). Die Wahl wird in `~/.config/bibliogon/install.json` gespeichert.
3. Ein kleines Fenster mit "Bibliogon startet..." erscheint, während Docker die Container hochfährt.
4. Sobald Bibliogon bereit ist, öffnet sich der Standard-Browser auf `http://localhost:7880` (bzw. dem in `.env` konfigurierten Port).
5. Das kleine Fenster wechselt zu "Bibliogon läuft auf localhost:7880" mit der Schaltfläche **Bibliogon stoppen**.

## Bibliogon stoppen

In der Launcher-Leiste auf **Bibliogon stoppen** klicken oder das Fenster einfach schließen. Der Launcher führt `docker compose down` aus und beendet sich. Docker läuft im Hintergrund weiter; nur die Bibliogon-Container werden gestoppt.

## Zweiter Start

Launcher erneut starten. Wenn Bibliogon bereits läuft (etwa weil das Fenster minimiert war), erkennt der Launcher die laufende Instanz und öffnet einfach den Browser auf der richtigen URL, ohne eine zweite Kopie zu starten.

## Fehlerbehebung

**"Docker läuft nicht" oder "permission denied" auf `docker.sock`**
Prüfen, ob Docker ohne `sudo` erreichbar ist:

```bash
docker info
```

Falls das mit einem Berechtigungsfehler fehlschlägt, bist du noch nicht in der Gruppe `docker`. Nach `sudo usermod -aG docker "$USER"` musst du dich komplett aus der Sitzung abmelden (nicht nur das Terminal schließen) und wieder anmelden. Unter Wayland ist manchmal ein kompletter Neustart nötig, damit der Gruppenwechsel greift.

**"Bibliogon-Installation nicht gefunden"**
Der Launcher findet `docker-compose.prod.yml` nicht unter dem Default- oder konfigurierten Pfad. OK klicken, dann den Ordner wählen, in dem Bibliogon liegt. Der Ordner enthält typischerweise `README.md`, `Makefile` und `docker-compose.prod.yml`.

**"Port 7880 ist belegt"**
Ein anderes Programm nutzt den Port. Optionen: das andere Programm stoppen oder in der `.env` des Bibliogon-Ordners `BIBLIOGON_PORT` auf einen anderen Wert setzen (zum Beispiel `7881`) und den Launcher neu starten.

**"Bibliogon ist nicht rechtzeitig gestartet"**
Der erste Start einer frischen Installation baut die Docker-Images, was einige Minuten dauern kann. Wiederholen klicken, um weitere 60 Sekunden zu warten. Falls es weiter scheitert, die letzten Log-Zeilen im Dialog prüfen und ausführen:

```bash
docker compose -f ~/bibliogon/docker-compose.prod.yml logs --tail=100
```

**"./bibliogon-launcher-linux: cannot execute: required file not found"**
Das Binary braucht glibc 2.35 oder neuer. Du bist auf einer älteren Distribution. Die Distribution aktualisieren oder Bibliogon stattdessen über `install.sh` aus dem Repository installieren.

**"error while loading shared libraries: libtk..."**
Tk ist nicht installiert. Das Tk-Paket deiner Distribution installieren (`python3-tk` auf Debian/Ubuntu, `tk` auf Arch, `python3-tkinter` auf Fedora). Ein AppImage mit gebündeltem Tk ist als D-03a vorgemerkt und hängt davon ab, wie oft dieses Problem auftritt.

**Aktivitätslog**
Jeder Start schreibt nach `~/.config/bibliogon/install.log` (1 MB Rotation, 1 Backup). Diese Datei Fehlerberichten beilegen. Siehe Abschnitt [Aktivitätslog](#aktivitatslog) für Details.

## Aktivitätslog

Jede Launcher-Aktion (Installation, Deinstallation, Docker-Operationen, Fehler) wird geschrieben nach:

```
~/.config/bibliogon/install.log
```

Das Log rotiert bei 1 MB mit einem Backup (`install.log.1`). Bei einer Fehlermeldung auf GitHub die aktuelle Log-Datei anhängen oder die letzten 50-100 Zeilen einfügen; der Fehler steht meistens direkt drin.

## Deinstallation

Siehe [Deinstallieren](uninstall.md) für den Launcher-Weg und das `uninstall.sh`-Skript als Fallback.

Kurz: auf **Uninstall** im Launcher-Fenster klicken und bestätigen. Der Launcher entfernt das Installationsverzeichnis und sein eigenes Manifest. Docker-Volumes (Buchdaten) bleiben standardmäßig erhalten; sie müssen explizit mit entfernt werden, wenn alles weg soll.

## Verwandte Seiten

- [Installations-Übersicht](installation.md)
- [Windows-Launcher](launcher-windows.md)
- [macOS-Launcher](launcher-macos.md)
- [Deinstallieren](uninstall.md)
- [Fehlerbehebung](troubleshooting.md) (allgemeine App-Probleme, nachdem sie läuft)
