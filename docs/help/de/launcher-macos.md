# macOS-Launcher

Der macOS-Launcher ist ein `Bibliogon.app`-Bundle, das Bibliogon per Doppelklick startet: kein Terminal, keine `docker compose`-Kommandos. Docker Desktop führt die Anwendung weiterhin aus, der Launcher startet und stoppt sie nur für dich.

**Diese erste Version ist ausschließlich arm64.** Macs mit Apple Silicon (M1, M2, M3, M4 und neuer) werden unterstützt. Intel-Macs sind mit diesem Binary nicht abgedeckt; dafür bitte stattdessen `install.sh` im Terminal verwenden.

> **Wichtig: der Launcher ist kein Installer.** Er setzt voraus, dass Bibliogon bereits auf deiner Festplatte liegt. Wenn du nur den Launcher auf einem frischen Rechner startest, weist er dich darauf hin, zuerst Bibliogon zu installieren, und beendet sich. Siehe [Installations-Übersicht](installation.md) für das Gesamtbild.

## Einmalige Einrichtung

### 1. Docker Desktop installieren

Docker Desktop für Mac (Apple Silicon) von [docs.docker.com/desktop/install/mac-install](https://docs.docker.com/desktop/install/mac-install/) herunterladen und installieren. Nach der Installation starten und warten, bis das Wal-Symbol in der Menüleiste meldet, dass die Engine läuft.

### 2. Bibliogon selbst installieren

Das Bibliogon-Repository in einen Ordner auf deinem Rechner klonen oder herunterladen. Der Launcher sucht zuerst in `~/bibliogon`. Andere Orte funktionieren auch; der Launcher fragt beim ersten Start nach dem Ordner und merkt ihn sich.

Ohne Git: die Quell-ZIP von der [Releases-Seite](https://github.com/astrapi69/bibliogon/releases/latest) herunterladen und nach `~/bibliogon` entpacken.

### 3. Launcher herunterladen

Von der Releases-Seite zwei an das Release angehängte Dateien laden:

- `bibliogon-launcher-macos.zip`
- `bibliogon-launcher-macos.zip.sha256`

Speicherort beliebig; `~/Downloads` ist in Ordnung.

### 4. Download prüfen (optional, aber empfohlen)

Der Launcher ist nicht mit einer Apple Developer ID signiert (siehe [Warum erscheint eine Sicherheitswarnung?](#warum-erscheint-eine-sicherheitswarnung) unten). Um zu bestätigen, dass die ZIP exakt die veröffentlichte Datei ist, im Terminal im Download-Ordner:

```bash
shasum -a 256 bibliogon-launcher-macos.zip
cat bibliogon-launcher-macos.zip.sha256
```

Der Hash von `shasum` muss mit der Hex-Zeichenkette in der `.sha256`-Datei übereinstimmen. Wenn nicht, die ZIP **nicht** öffnen und das Ganze auf [GitHub Issues](https://github.com/astrapi69/bibliogon/issues) melden.

### 5. Entpacken und App verschieben

`bibliogon-launcher-macos.zip` entpacken. Das Archiv enthält `Bibliogon.app`. Ins Verzeichnis `/Applications` verschieben, damit das Launchpad sie findet, oder einfach in `~/Downloads` liegen lassen.

## Erster Start

Der erste Start ist derjenige, der Gatekeeper auslöst. Danach funktioniert der Doppelklick normal.

### Der Gatekeeper-Dialog

Weil der Launcher unsigniert ist, zeigt macOS:

> **"Bibliogon" kann nicht geöffnet werden, weil der Entwickler nicht verifiziert werden kann.**

So wird der Launcher beim ersten Start freigegeben:

1. **Rechtsklick** (oder Ctrl-Klick) auf `Bibliogon.app` im Finder.
2. **Öffnen** aus dem Kontextmenü wählen.
3. Der Dialog bietet jetzt einen **Öffnen**-Knopf (der normale Doppelklick-Dialog bietet ihn nicht). Auf **Öffnen** klicken.

macOS merkt sich die Freigabe für genau dieses Binary. Beim nächsten Start reicht der Doppelklick.

Falls die Option "Öffnen" fehlt (bei einigen macOS-Versionen), hilft der Terminal-Fallback, das Quarantäne-Attribut zu entfernen:

```bash
xattr -d com.apple.quarantine /pfad/zu/Bibliogon.app
```

### Was nach dem Klick auf Öffnen passiert

1. Der Launcher prüft, ob Docker Desktop installiert ist und läuft. Falls nicht, fordert ein Dialog auf, Docker zu starten, und zeigt einen Wiederholen-Knopf.
2. Falls Bibliogon nicht unter `~/bibliogon` liegt, fragt der Launcher nach dem Installationsordner (derjenige, der `docker-compose.prod.yml` enthält). Die Wahl wird in `~/Library/Application Support/bibliogon/install.json` gespeichert.
3. Ein kleines Fenster mit "Bibliogon startet..." erscheint, während Docker die Container hochfährt.
4. Sobald Bibliogon bereit ist, öffnet sich der Standard-Browser auf `http://localhost:7880` (bzw. dem in `.env` konfigurierten Port).
5. Das kleine Fenster wechselt zu "Bibliogon läuft auf localhost:7880" mit der Schaltfläche **Bibliogon stoppen**.

## Bibliogon stoppen

In der Launcher-Leiste auf **Bibliogon stoppen** klicken oder das Fenster einfach schließen. Der Launcher führt `docker compose down` aus und beendet sich. Docker Desktop läuft weiter; nur die Bibliogon-Container werden gestoppt.

## Zweiter Start

`Bibliogon.app` erneut per Doppelklick öffnen. Wenn Bibliogon bereits läuft (etwa weil das Fenster minimiert war), erkennt der Launcher die laufende Instanz und öffnet einfach den Browser auf der richtigen URL, ohne eine zweite Kopie zu starten.

## Fehlerbehebung

**"Docker Desktop läuft nicht"**
Docker Desktop aus "Programme" oder "Launchpad" starten. Warten, bis das Wal-Symbol in der Menüleiste ruhig ist (nicht animiert). Dann im Launcher-Dialog auf Wiederholen klicken.

**"Bibliogon-Installation nicht gefunden"**
Der Launcher findet `docker-compose.prod.yml` nicht unter dem Default- oder konfigurierten Pfad. OK klicken, dann den Ordner wählen, in dem Bibliogon liegt. Der Ordner enthält typischerweise `README.md`, `Makefile` und `docker-compose.prod.yml`.

**"Port 7880 ist belegt"**
Ein anderes Programm nutzt den Port. Optionen: das andere Programm stoppen oder in der `.env` des Bibliogon-Ordners `BIBLIOGON_PORT` auf einen anderen Wert setzen (zum Beispiel `7881`) und den Launcher neu starten.

**"Bibliogon ist nicht rechtzeitig gestartet"**
Der erste Start einer frischen Installation baut die Docker-Images, was einige Minuten dauern kann. Wiederholen klicken, um weitere 60 Sekunden zu warten. Falls es weiter scheitert, die letzten Log-Zeilen im Dialog prüfen und in der Docker-Desktop-Container-Ansicht nachsehen.

**"Diese App wurde nach dem Öffnen in den Papierkorb verschoben"**
Das kann passieren, wenn Gatekeeper nicht richtig umgangen wurde. Die App aus dem Papierkorb wiederherstellen und dem Rechtsklick -> Öffnen-Pfad im [Abschnitt Gatekeeper-Dialog](#der-gatekeeper-dialog) folgen.

**Aktivitätslog**
Jeder Start schreibt nach `~/Library/Application Support/bibliogon/install.log` (1 MB Rotation, 1 Backup). Diese Datei Fehlerberichten beilegen. Siehe Abschnitt [Aktivitätslog](#aktivitatslog) für Details.

## Aktivitätslog

Jede Launcher-Aktion (Installation, Deinstallation, Docker-Operationen, Fehler) wird geschrieben nach:

```
~/Library/Application Support/bibliogon/install.log
```

Das Log rotiert bei 1 MB mit einem Backup (`install.log.1`). Bei einer Fehlermeldung auf GitHub die aktuelle Log-Datei anhängen oder die letzten 50-100 Zeilen einfügen; der Fehler steht meistens direkt drin.

## Warum erscheint eine Sicherheitswarnung?

macOS zeigt die Meldung "Entwickler kann nicht verifiziert werden" für jedes nicht mit Apple Developer ID signierte und notarisierte Programm. Eine Developer ID kostet 99 USD pro Jahr, Notarisierung bringt laufenden Aufwand. Für die aktuelle Nutzerbasis veröffentlichen wir den Launcher unsigniert und stellen eine SHA256-Prüfsumme bereit, damit Downloads unabhängig verifizierbar sind.

Code-Signing wird neu geprüft, sobald die Nutzerbasis die Kosten und den Pflegeaufwand rechtfertigt. Bis dahin ist der Rechtsklick -> Öffnen-Weg der vorgesehene. Der Launcher-Quellcode liegt im Verzeichnis `launcher/` des Bibliogon-Repositories; er kann frei inspiziert oder selbst gebaut werden.

## Deinstallation

Siehe [Deinstallieren](uninstall.md) für den Launcher-Weg und das `uninstall.sh`-Skript als Fallback.

Kurz: auf **Uninstall** im Launcher-Fenster klicken und bestätigen. Der Launcher entfernt das Installationsverzeichnis und sein eigenes Manifest. Docker-Volumes (Buchdaten) bleiben standardmäßig erhalten; sie müssen explizit mit entfernt werden, wenn alles weg soll.

## Verwandte Seiten

- [Installations-Übersicht](installation.md)
- [Windows-Launcher](launcher-windows.md)
- [Linux-Launcher](launcher-linux.md)
- [Deinstallieren](uninstall.md)
- [Fehlerbehebung](troubleshooting.md) (allgemeine App-Probleme, nachdem sie läuft)
