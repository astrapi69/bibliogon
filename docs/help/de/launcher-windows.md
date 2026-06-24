# Windows-Launcher

Der Windows-Launcher ist eine kleine `bibliogon-launcher.exe`, die Bibliogon per Doppelklick startet: kein Terminal, keine `docker compose`-Kommandos. Docker Desktop lässt die App weiterhin laufen, der Launcher startet und stoppt sie nur für dich.

> **Was der Launcher für dich erledigt.** Der Launcher verwaltet den Docker-Stack für eine Kopie des Bibliogon-Repositorys, die bereits auf deinem Rechner liegt: er baut die Images aus deiner lokalen Kopie und startet und stoppt die App für dich. Er lädt Bibliogon **nicht** selbst herunter. Du brauchst vorher zwei Dinge auf der Festplatte: Docker Desktop und die Bibliogon-Quellen (ein `git clone` des Repositorys oder dessen entpacktes Quell-ZIP - der Standardort ist `%USERPROFILE%\bibliogon`). Docker Desktop installierst du selbst; Docker-Lizenzbedingungen verbieten eine stille Drittanbieter-Installation. Plattformübergreifender Überblick: [Installations-Übersicht](installation.md).

Für macOS oder Linux siehe [macOS-Launcher](launcher-macos.md) / [Linux-Launcher](launcher-linux.md).

## Einmalige Einrichtung

### 1. Docker Desktop installieren

Eine vollständige Windows-Anleitung inklusive Abschnitt „Ist Docker sicher zu installieren?" findest du in der [Bibliogon-Anleitung zur Docker-Installation](install/docker-desktop.md). Nach der Installation Docker Desktop starten und warten, bis das Wal-Symbol in der Taskleiste von gelb-orange auf blau wechselt.

Wenn du diesen Schritt überspringst, erkennt der Launcher das fehlende Docker beim Start und zeigt einen Dialog mit drei Schaltflächen (Docker-Downloadseite öffnen, Bibliogon-Docker-Anleitung öffnen, oder Beenden). Du kannst den Launcher nach der Docker-Installation einfach erneut starten.

### 2. Launcher herunterladen

Von der Releases-Seite zwei Dateien herunterladen, die am Release hängen:

- `bibliogon-launcher.exe`
- `bibliogon-launcher.exe.sha256`

Beliebiger Ordner: Desktop oder `Downloads` sind beide in Ordnung.

### 3. Download prüfen (optional, aber empfohlen)

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

Die erste Aufgabe des Launchers ist die Erkennung des aktuellen Zustands.

1. **Docker-Prüfung.** Der Launcher bestätigt, dass Docker Desktop installiert ist und läuft. Fehlt Docker Desktop, erscheint ein Dialog mit Installations-URL und der Launcher beendet sich. Ist Docker installiert, aber nicht gestartet, bittet ein Dialog um den Start und einen Klick auf Wiederholen; der Launcher versucht es bis zu drei Mal.
2. **Repository-Prüfung.** Der Launcher braucht deine lokale Kopie des Bibliogon-Repositorys - den Ordner mit der `docker-compose.prod.yml`. Er sucht sie über die Umgebungsvariable `BIBLIOGON_DIR`, das Repo-Wurzelverzeichnis, wenn du den Launcher aus einem Quell-Checkout startest, oder am Standardort `%USERPROFILE%\bibliogon`.
   - **Bereits gebaut**: existieren die Bibliogon-Container schon aus einem früheren Lauf, fährt der Launcher direkt mit Schritt 3 fort.
   - **Noch nicht gebaut**: solange keine Container existieren, zeigt das Launcher-Fenster eine Schaltfläche **Installieren**. Ein Klick baut die Docker-Images aus deiner lokalen Kopie (`docker compose build`; der erste Build dauert 3-5 Minuten), schreibt den Host-Port in die `.env` und startet anschließend den Stack. Während der Installation zeigt ein Fortschrittsfenster jeden Schritt (Konfiguration vorbereiten, Images bauen, starten), damit du siehst, dass etwas passiert. Lässt sich das Repository nicht finden, schlägt der Build mit "Compose file not found" fehl - lege die Bibliogon-Quellen nach `%USERPROFILE%\bibliogon`, setze `BIBLIOGON_DIR` oder starte den Launcher aus dem Repository-Ordner heraus.
3. **Start.** Ein kleines Statusfenster mit einer Checkliste (Docker Desktop erkannt, Container werden gestartet, Warten auf Bibliogon) erscheint, während Docker die Container hochfährt.
4. **Browser.** Wenn Bibliogon bereit ist, öffnet dein Standard-Browser `http://localhost:7880` (oder den in `.env` konfigurierten Port). Ist Port 7880 bereits von einem anderen Programm belegt, wählt der Launcher automatisch den nächsten freien Port, speichert ihn in `.env` und nennt dir die neue Adresse.
5. **Statusfenster.** Das kleine Fenster wechselt auf "Bibliogon läuft auf localhost:7880" mit einer Schaltfläche **Bibliogon beenden**.

## Bibliogon beenden

Im Launcher-Fenster auf **Bibliogon beenden** klicken, oder das Fenster einfach schließen. Der Launcher führt `docker compose down` aus und beendet sich. Docker Desktop läuft weiter; nur die Bibliogon-Container stoppen.

## Zweiter Start

Erneuter Doppelklick auf den Launcher. Wenn Bibliogon bereits läuft (z.B. weil du das Launcher-Fenster minimiert hast), erkennt der Launcher die laufende Instanz und zeigt einen Verwaltungsdialog, statt eine zweite Kopie zu starten:

- **Im Browser öffnen** - `http://localhost:7880` der laufenden Instanz öffnen.
- **Stoppen** - `docker compose down` ausführen und die Container stoppen; die Installation bleibt erhalten.
- **Deinstallieren** - nach Bestätigung Bibliogon vollständig entfernen (siehe Deinstallation unten).
- **Schließen** - den Launcher schließen, die Container laufen weiter.

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

Kurz: im Verwaltungsdialog (oder im Hauptfenster) auf **Deinstallieren** klicken und bestätigen. Der Launcher entfernt danach alles: die Docker-Container, -Images und -Volumes (**deine Buchdaten werden gelöscht** - exportiere deine Bücher vorher, wenn du sie behalten willst), das Installationsverzeichnis, Desktop-Verknüpfungen, das Manifest sowie die Konfigurationsverzeichnisse (`%USERPROFILE%\.bibliogon` und `%APPDATA%\bibliogon`). Dieselbe Bereinigung gibt es ohne Fenster über `bibliogon-launcher.exe --uninstall`. Eine abgebrochene Deinstallation wird beim nächsten Start automatisch fortgesetzt.

Wenn du nur das Launcher-Binary löschen und Bibliogon behalten willst: `bibliogon-launcher.exe` löschen, statt die Deinstallation auszuführen.

## Verwandte Seiten

- [Installations-Übersicht](installation.md)
- [macOS-Launcher](launcher-macos.md)
- [Linux-Launcher](launcher-linux.md)
- [Deinstallieren](uninstall.md)
- [Fehlerbehebung](troubleshooting.md) (allgemeine App-Probleme, nachdem sie läuft)
