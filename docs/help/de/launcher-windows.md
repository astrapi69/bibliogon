# Windows-Launcher

Der Windows-Launcher ist eine kleine `bibliogon-launcher.exe`, die Bibliogon per Doppelklick startet: kein Terminal, keine `docker compose`-Kommandos. Docker Desktop laesst die App weiterhin laufen, der Launcher startet und stoppt sie nur fuer dich.

> **Wichtig: der Launcher ist kein Installer.** Er setzt voraus, dass Bibliogon bereits auf deinem Rechner installiert ist (Schritte 1 und 2 unten). Wenn du nur die `.exe` herunterlaedst und sie auf einem frischen Rechner startest, erklaert sie dir, dass Bibliogon zuerst installiert werden muss, und beendet sich. Einen "Ein-Klick-alles-installieren"-Weg gibt es heute nicht; das ist als separater zukuenftiger Punkt (D-05) erfasst und haengt von Nutzer-Feedback ab.

Fuer macOS oder Linux siehe [macOS-Launcher](launcher-macos.md) / [Linux-Launcher](launcher-linux.md). Das Gesamtbild ueber alle drei Plattformen hinweg: [Installations-Uebersicht](installation.md).

## Einmalige Einrichtung

### 1. Docker Desktop installieren

Docker Desktop von [docs.docker.com/desktop/install/windows-install](https://docs.docker.com/desktop/install/windows-install/) herunterladen und installieren. Anschliessend Docker Desktop starten und warten, bis die Engine laeuft.

### 2. Bibliogon selbst installieren

Das Bibliogon-Repository in einen Ordner auf deinem Rechner klonen oder herunterladen. Empfohlene Lage: `%USERPROFILE%\bibliogon` (zum Beispiel `C:\Users\deinname\bibliogon`), weil der Launcher dort zuerst sucht. Andere Orte funktionieren auch; der Launcher fragt beim ersten Start nach dem Ordner.

Ohne Git: die Quell-ZIP von der [Releases-Seite](https://github.com/astrapi69/bibliogon/releases/latest) herunterladen und nach `%USERPROFILE%\bibliogon` entpacken.

### 3. Launcher herunterladen

Von der Releases-Seite zwei Dateien herunterladen, die am Release haengen:

- `bibliogon-launcher.exe`
- `bibliogon-launcher.exe.sha256`

Beliebiger Ordner: Desktop oder `Downloads` sind beide in Ordnung.

### 4. Download pruefen (optional, aber empfohlen)

Bibliogon signiert den Launcher (noch) nicht (siehe [Warum kommt eine Sicherheitswarnung?](#warum-kommt-eine-sicherheitswarnung) unten). Um zu bestaetigen, dass du genau die veroeffentlichte Datei hast, oeffne PowerShell in dem Ordner und fuehre aus:

```powershell
Get-FileHash -Algorithm SHA256 .\bibliogon-launcher.exe
Get-Content .\bibliogon-launcher.exe.sha256
```

Der Hash aus `Get-FileHash` muss mit dem Hex-String in der `.sha256`-Datei uebereinstimmen. Wenn nicht, nicht ausfuehren und ein [GitHub Issue](https://github.com/astrapi69/bibliogon/issues) oeffnen.

## Erster Start

Doppelklick auf `bibliogon-launcher.exe`.

### Die SmartScreen-Warnung

Windows zeigt vermutlich einen blauen Dialog: **"Der Computer wurde durch Windows geschuetzt"** mit dem Text "Microsoft Defender SmartScreen hat den Start einer unbekannten App verhindert". Das ist bei unsignierter Software zu erwarten und bedeutet nicht, dass der Launcher schaedlich ist.

So kommst du weiter:

1. **Weitere Informationen** klicken (ein Link im Dialog).
2. Der Dialog klappt auf und zeigt App-Name und Herausgeber. Auf den neu erscheinenden **Trotzdem ausfuehren**-Button klicken.

Hintergrund unter [Warum kommt eine Sicherheitswarnung?](#warum-kommt-eine-sicherheitswarnung) weiter unten.

### Was danach passiert

1. Der Launcher prueft, ob Docker Desktop installiert ist und laeuft. Wenn Docker nicht laeuft, erscheint ein Dialog mit Bitte um Start und Wiederholen.
2. Wenn Bibliogon nicht unter `%USERPROFILE%\bibliogon` liegt, fragt der Launcher nach dem Ordner (derjenige mit `docker-compose.prod.yml`). Deine Wahl wird in `%APPDATA%\Bibliogon\launcher.json` gemerkt, beim naechsten Start entfaellt dieser Schritt.
3. Ein kleines "Bibliogon wird gestartet..."-Fenster erscheint, waehrend Docker die Container hochfaehrt.
4. Wenn Bibliogon bereit ist, oeffnet dein Standard-Browser `http://localhost:7880` (oder den in `.env` konfigurierten Port).
5. Das kleine Fenster wechselt auf "Bibliogon laeuft auf localhost:7880" mit einem **Bibliogon beenden**-Button.

## Bibliogon beenden

Im Launcher-Fenster auf **Bibliogon beenden** klicken, oder das Fenster einfach schliessen. Der Launcher fuehrt `docker compose down` aus und beendet sich. Docker Desktop laeuft weiter; nur die Bibliogon-Container stoppen.

## Zweiter Start

Erneuter Doppelklick auf den Launcher. Wenn Bibliogon bereits laeuft (z.B. weil du das Launcher-Fenster minimiert hast), erkennt der Launcher die laufende Instanz und oeffnet nur den Browser an der korrekten URL, ohne eine zweite Kopie zu starten.

## Fehlerbehebung

**"Docker Desktop laeuft nicht"**
Docker Desktop aus dem Startmenue oeffnen. Warten, bis das Wal-Symbol in der Taskleiste ruhig steht (nicht animiert). Dann im Launcher-Dialog auf Wiederholen klicken.

**"Bibliogon-Installation nicht gefunden"**
Der Launcher findet `docker-compose.prod.yml` nicht an der Standard- oder konfigurierten Stelle. Mit OK bestaetigen und den Ordner auswaehlen, in dem du Bibliogon geklont oder entpackt hast. Dieser Ordner enthaelt typischerweise `README.md`, `Makefile` und `docker-compose.prod.yml`.

**"Port 7880 wird bereits verwendet"**
Ein anderes Programm belegt den Bibliogon-Port. Entweder das andere Programm stoppen oder in deinem Bibliogon-Ordner die Datei `.env` bearbeiten und `BIBLIOGON_PORT` auf einen anderen Wert setzen (z.B. `7881`), dann den Launcher erneut starten.

**"Bibliogon ist nicht rechtzeitig gestartet"**
Der allererste Start einer frischen Installation muss Docker-Images bauen und kann mehrere Minuten dauern. Auf Wiederholen klicken wartet weitere 60 Sekunden. Wenn es weiterhin fehlschlaegt, die letzten Log-Zeilen im Dialog pruefen und in Docker Desktops Container-Ansicht nachsehen.

**Aktivitaetslog**
Jeder Start schreibt nach `%APPDATA%\bibliogon\install.log` (1 MB Rotation, 1 Backup). Der alte Pfad `%APPDATA%\Bibliogon\launcher.log` wird aus Kompatibilitaetsgruenden weiter befuellt. Bei Bug-Reports bitte die aktuelle Log-Datei anhaengen.

## Warum kommt eine Sicherheitswarnung?

Windows zeigt die "unbekannte App"-Warnung fuer jede ausfuehrbare Datei, die nicht mit einem kostenpflichtigen, von Microsoft anerkannten Code-Signing-Zertifikat signiert ist. Solche Zertifikate kosten einige hundert Euro pro Jahr und erfordern laufende Pflege. Fuer die aktuelle Nutzerbasis veroeffentlichen wir den Launcher unsigniert und liefern eine SHA256-Pruefsumme mit, damit du den Download unabhaengig verifizieren kannst.

Wir planen, Code-Signing neu zu bewerten, wenn Bibliogon eine Nutzerbasis hat, die die Kosten und den Aufwand rechtfertigt. Bis dahin ist der "Weitere Informationen" -> "Trotzdem ausfuehren"-Weg der vorgesehene Ablauf. Der Quellcode des Launchers liegt in `launcher/` im Bibliogon-Repository; du darfst ihn gerne inspizieren oder selbst bauen.

## Deinstallation

Siehe [Deinstallieren](uninstall.md) fuer den Launcher-Weg und das `uninstall.sh`-Skript als Fallback.

Kurz: im Launcher-Fenster auf **Uninstall** klicken und bestaetigen. Der Launcher entfernt das Installationsverzeichnis und sein eigenes Manifest. Docker-Volumes (Buchdaten) bleiben standardmaessig erhalten; sie muessen explizit mit entfernt werden, wenn alles weg soll.

Wenn du nur das Launcher-Binary loeschen und Bibliogon behalten willst: `bibliogon-launcher.exe` loeschen, optional auch das Konfigurationsverzeichnis `%APPDATA%\bibliogon\`.

## Verwandte Seiten

- [Installations-Uebersicht](installation.md)
- [macOS-Launcher](launcher-macos.md)
- [Linux-Launcher](launcher-linux.md)
- [Deinstallieren](uninstall.md)
- [Fehlerbehebung](troubleshooting.md) (allgemeine App-Probleme, nachdem sie laeuft)
