# Windows-Launcher

Der Windows-Launcher ist eine kleine `bibliogon-launcher.exe`, die Bibliogon per Doppelklick startet: kein Terminal, keine `docker compose`-Kommandos. Docker Desktop lässt die App weiterhin laufen, der Launcher startet und stoppt sie nur für dich.

> **Wichtig: der Launcher ist kein Installer.** Er setzt voraus, dass Bibliogon bereits auf deinem Rechner installiert ist (Schritte 1 und 2 unten). Wenn du nur die `.exe` herunterlädst und sie auf einem frischen Rechner startest, erklärt sie dir, dass Bibliogon zuerst installiert werden muss, und beendet sich. Einen "Ein-Klick-alles-installieren"-Weg gibt es heute nicht; das ist als separater zukünftiger Punkt (D-05) erfasst und hängt von Nutzer-Feedback ab.

Für macOS oder Linux siehe [macOS-Launcher](launcher-macos.md) / [Linux-Launcher](launcher-linux.md). Das Gesamtbild über alle drei Plattformen hinweg: [Installations-Übersicht](installation.md).

## Einmalige Einrichtung

### 1. Docker Desktop installieren

Docker Desktop von [docs.docker.com/desktop/install/windows-install](https://docs.docker.com/desktop/install/windows-install/) herunterladen und installieren. Anschließend Docker Desktop starten und warten, bis die Engine läuft.

### 2. Bibliogon selbst installieren

Das Bibliogon-Repository in einen Ordner auf deinem Rechner klonen oder herunterladen. Empfohlene Lage: `%USERPROFILE%\bibliogon` (zum Beispiel `C:\Users\deinname\bibliogon`), weil der Launcher dort zuerst sucht. Andere Orte funktionieren auch; der Launcher fragt beim ersten Start nach dem Ordner.

Ohne Git: die Quell-ZIP von der [Releases-Seite](https://github.com/astrapi69/bibliogon/releases/latest) herunterladen und nach `%USERPROFILE%\bibliogon` entpacken.

### 3. Launcher herunterladen

Von der Releases-Seite zwei Dateien herunterladen, die am Release hängen:

- `bibliogon-launcher.exe`
- `bibliogon-launcher.exe.sha256`

Beliebiger Ordner: Desktop oder `Downloads` sind beide in Ordnung.

### 4. Download prüfen (optional, aber empfohlen)

Bibliogon signiert den Launcher (noch) nicht (siehe [Warum kommt eine Sicherheitswarnung?](#warum-kommt-eine-sicherheitswarnung) unten). Um zu bestätigen, dass du genau die veröffentlichte Datei hast, öffne PowerShell in dem Ordner und führe aus:

```powershell
Get-FileHash -Algorithm SHA256 .\bibliogon-launcher.exe
Get-Content .\bibliogon-launcher.exe.sha256
```

Der Hash aus `Get-FileHash` muss mit dem Hex-String in der `.sha256`-Datei übereinstimmen. Wenn nicht, nicht ausführen und ein [GitHub Issue](https://github.com/astrapi69/bibliogon/issues) öffnen.

## Erster Start

Doppelklick auf `bibliogon-launcher.exe`.

### Die SmartScreen-Warnung

Windows zeigt vermutlich einen blauen Dialog: **"Der Computer wurde durch Windows geschützt"** mit dem Text "Microsoft Defender SmartScreen hat den Start einer unbekannten App verhindert". Das ist bei unsignierter Software zu erwarten und bedeutet nicht, dass der Launcher schädlich ist.

So kommst du weiter:

1. **Weitere Informationen** klicken (ein Link im Dialog).
2. Der Dialog klappt auf und zeigt App-Name und Herausgeber. Auf den neu erscheinenden **Trotzdem ausführen**-Button klicken.

Hintergrund unter [Warum kommt eine Sicherheitswarnung?](#warum-kommt-eine-sicherheitswarnung) weiter unten.

### Was danach passiert

1. Der Launcher prüft, ob Docker Desktop installiert ist und läuft. Wenn Docker nicht läuft, erscheint ein Dialog mit Bitte um Start und Wiederholen.
2. Wenn Bibliogon nicht unter `%USERPROFILE%\bibliogon` liegt, fragt der Launcher nach dem Ordner (derjenige mit `docker-compose.prod.yml`). Deine Wahl wird in `%APPDATA%\Bibliogon\launcher.json` gemerkt, beim nächsten Start entfällt dieser Schritt.
3. Ein kleines "Bibliogon wird gestartet..."-Fenster erscheint, während Docker die Container hochfährt.
4. Wenn Bibliogon bereit ist, öffnet dein Standard-Browser `http://localhost:7880` (oder den in `.env` konfigurierten Port).
5. Das kleine Fenster wechselt auf "Bibliogon läuft auf localhost:7880" mit einem **Bibliogon beenden**-Button.

## Bibliogon beenden

Im Launcher-Fenster auf **Bibliogon beenden** klicken, oder das Fenster einfach schließen. Der Launcher führt `docker compose down` aus und beendet sich. Docker Desktop läuft weiter; nur die Bibliogon-Container stoppen.

## Zweiter Start

Erneuter Doppelklick auf den Launcher. Wenn Bibliogon bereits läuft (z.B. weil du das Launcher-Fenster minimiert hast), erkennt der Launcher die laufende Instanz und öffnet nur den Browser an der korrekten URL, ohne eine zweite Kopie zu starten.

## Fehlerbehebung

**"Docker Desktop läuft nicht"**
Docker Desktop aus dem Startmenue öffnen. Warten, bis das Wal-Symbol in der Taskleiste ruhig steht (nicht animiert). Dann im Launcher-Dialog auf Wiederholen klicken.

**"Bibliogon-Installation nicht gefunden"**
Der Launcher findet `docker-compose.prod.yml` nicht an der Standard- oder konfigurierten Stelle. Mit OK bestätigen und den Ordner auswählen, in dem du Bibliogon geklont oder entpackt hast. Dieser Ordner enthält typischerweise `README.md`, `Makefile` und `docker-compose.prod.yml`.

**"Port 7880 wird bereits verwendet"**
Ein anderes Programm belegt den Bibliogon-Port. Entweder das andere Programm stoppen oder in deinem Bibliogon-Ordner die Datei `.env` bearbeiten und `BIBLIOGON_PORT` auf einen anderen Wert setzen (z.B. `7881`), dann den Launcher erneut starten.

**"Bibliogon ist nicht rechtzeitig gestartet"**
Der allererste Start einer frischen Installation muss Docker-Images bauen und kann mehrere Minuten dauern. Auf Wiederholen klicken wartet weitere 60 Sekunden. Wenn es weiterhin fehlschlägt, die letzten Log-Zeilen im Dialog prüfen und in Docker Desktops Container-Ansicht nachsehen.

**Aktivitätslog**
Jeder Start schreibt nach `%APPDATA%\bibliogon\install.log` (1 MB Rotation, 1 Backup). Der alte Pfad `%APPDATA%\Bibliogon\launcher.log` wird aus Kompatibilitätsgründen weiter befüllt. Bei Bug-Reports bitte die aktuelle Log-Datei anhängen.

## Warum kommt eine Sicherheitswarnung?

Windows zeigt die "unbekannte App"-Warnung für jede ausführbare Datei, die nicht mit einem kostenpflichtigen, von Microsoft anerkannten Code-Signing-Zertifikat signiert ist. Solche Zertifikate kosten einige hundert Euro pro Jahr und erfordern laufende Pflege. Für die aktuelle Nutzerbasis veröffentlichen wir den Launcher unsigniert und liefern eine SHA256-Prüfsumme mit, damit du den Download unabhängig verifizieren kannst.

Wir planen, Code-Signing neu zu bewerten, wenn Bibliogon eine Nutzerbasis hat, die die Kosten und den Aufwand rechtfertigt. Bis dahin ist der "Weitere Informationen" -> "Trotzdem ausführen"-Weg der vorgesehene Ablauf. Der Quellcode des Launchers liegt in `launcher/` im Bibliogon-Repository; du darfst ihn gerne inspizieren oder selbst bauen.

## Deinstallation

Siehe [Deinstallieren](uninstall.md) für den Launcher-Weg und das `uninstall.sh`-Skript als Fallback.

Kurz: im Launcher-Fenster auf **Uninstall** klicken und bestätigen. Der Launcher entfernt das Installationsverzeichnis und sein eigenes Manifest. Docker-Volumes (Buchdaten) bleiben standardmäßig erhalten; sie müssen explizit mit entfernt werden, wenn alles weg soll.

Wenn du nur das Launcher-Binary löschen und Bibliogon behalten willst: `bibliogon-launcher.exe` löschen, optional auch das Konfigurationsverzeichnis `%APPDATA%\bibliogon\`.

## Verwandte Seiten

- [Installations-Übersicht](installation.md)
- [macOS-Launcher](launcher-macos.md)
- [Linux-Launcher](launcher-linux.md)
- [Deinstallieren](uninstall.md)
- [Fehlerbehebung](troubleshooting.md) (allgemeine App-Probleme, nachdem sie läuft)
