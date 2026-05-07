# Deployment-Leitfaden

Wie man Bibliogon im Produktivbetrieb betreibt. Operator-seitige Referenz: Docker Compose, Umgebungsvariablen, Persistenz und häufige Stolpersteine. Für Endbenutzer-Installation siehe die [Installer-Skripte](../install/cross-platform-installers.md); diese Seite ist für das darunterliegende Setup.

## Was im Produktivbetrieb läuft

Bibliogon liefert zwei Docker-Container hinter einem Port aus:

- **backend** — Python + FastAPI + SQLAlchemy + SQLite. Läuft Uvicorn mit 2 Workern. Health-Endpoint unter `/api/health`.
- **frontend** — Vite-gebaute statische Dateien, ausgeliefert von nginx. Proxyt `/api/*` an das Backend im internen Docker-Netzwerk.

Der Frontend-Container exponiert standardmäßig Port `7880` (übersteuern mit `BIBLIOGON_PORT`). Der Backend-Container ist nur intern — Port 8000 sollte **nicht** ins öffentliche Internet exponiert werden.

Die Compose-Datei: `docker-compose.prod.yml`. Quelle: <https://github.com/astrapi69/bibliogon/blob/main/docker-compose.prod.yml>.

## Schnellstart

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
./start.sh
```

`start.sh` generiert eine `.env`-Datei mit Secrets, falls sie nicht existiert, und führt dann `docker compose -f docker-compose.prod.yml up -d` aus. <http://localhost:7880> öffnen. Stoppen mit `./stop.sh`.

## Umgebungsvariablen

| Variable | Default | Zweck |
|----------|---------|-------|
| `BIBLIOGON_PORT` | `7880` | Host-Port, an den das Frontend bindet. Ändern, wenn 7880 belegt ist oder wenn ein Reverse-Proxy auf einem anderen Port davorsteht. |
| `BIBLIOGON_DEBUG` | `false` | Bei `true` aktiviert `/api/test/reset` und die API-Docs unter `/api/docs` und liefert Stacktraces in 5xx-Antworten zurück. **Im Produktivbetrieb nicht aktivieren.** |
| `BIBLIOGON_SECRET_KEY` | (von `start.sh` generiert) | Für Lizenz-Signatur und CSRF-Schutz. Das Startup-Skript schreibt einen Zufallswert in `.env`, falls nicht gesetzt. |
| `BIBLIOGON_CREDENTIALS_SECRET` | (von `start.sh` generiert) | Fernet-verschlüsselt API-Keys + Service-Account-Dateien at-rest in der DB. Gleiche Auto-Generierung. |
| `BIBLIOGON_CORS_ORIGINS` | `http://localhost:7880` | Komma-separierte Liste erlaubter Origins. Den Reverse-Proxy-Hostname hinzufügen, wenn hinter einer Domain bereitgestellt wird. |
| `BIBLIOGON_DATA_DIR` | `/app/data` (im Container) | Container-seitiges Wurzelverzeichnis für Laufzeitdaten: SQLite-DB unter `<dir>/bibliogon.db`, Uploads unter `<dir>/uploads/`. Auf ein Docker-Named-Volume gemappt für Persistenz. |
| `BIBLIOGON_DB_PATH` | (wird nicht mehr berücksichtigt) | **Entfernt in v0.30.0** (DEP-DBPATH-01 Schritt 3). Die Variable hat keine Wirkung mehr auf die Pfad-Auflösung; ist sie weiterhin in der Umgebung gesetzt, wird beim Start eine einzelne Warnung mit dem ignorierten Wert geloggt. Stattdessen `BIBLIOGON_DATA_DIR` setzen — die Datenbank liegt dann unter `<BIBLIOGON_DATA_DIR>/bibliogon.db`. Verwerfungszyklus: Warnung v0.27.0, Präzedenz-Flip v0.28.0, Entfernung v0.30.0. |

Jede Variable mit einem Default ist optional. Das Startup-Skript generiert die zwei Secrets, falls sie nicht in `.env` stehen — ein frisches `./start.sh` funktioniert ohne Setup.

## Persistenz

Produktivdaten leben in einem **Docker-Named-Volume**, `bibliogon-data`, gemountet auf `/app/data` im Backend-Container.

- SQLite-DB: `/app/data/bibliogon.db` (+ `-wal`, `-shm`).
- Uploads (Cover-Bilder, Asset-Dateien): `/app/data/uploads/`.
- Hörbuch-Persistenz (MP3s nach Export): `/app/data/uploads/{book_id}/audiobook/`.

Das Volume überlebt Container-Rebuilds. Existenz prüfen:

```bash
docker volume ls | grep bibliogon
```

Inhalt anschauen (Container nur kurzzeitig):

```bash
docker run --rm -v bibliogon-data:/data alpine ls -la /data
```

Volume sichern:

```bash
docker run --rm -v bibliogon-data:/data -v "$PWD":/backup alpine tar czf /backup/bibliogon-data.tar.gz -C /data .
```

Wiederherstellen:

```bash
docker run --rm -v bibliogon-data:/data -v "$PWD":/backup alpine tar xzf /backup/bibliogon-data.tar.gz -C /data
```

Das `.bgb`-Backup-Format aus der UI ist eine andere, App-Ebene-Sache — ein Pro-Buch-ZIP, das einen Volume-Verlust überlebt. Das Volume-Backup oben deckt alles ab: jedes Buch, jedes Asset, jede Hörbuch-MP3, plus Zustand wie installierte Plugins.

## Stoppen / Neustart / Deinstallation

```bash
./stop.sh                                                # Container stoppen
./start.sh                                               # Container starten (oder neu starten)
docker compose -f docker-compose.prod.yml restart        # Neu starten ohne Rebuild
docker compose -f docker-compose.prod.yml down -v        # Stoppen + Volume LÖSCHEN (deinstalliert Bibliogon und ALLE Daten)
```

Das `-v`-Flag entfernt das Named Volume. Ohne `-v` bleiben die Daten quer über `docker compose down` und über Image-Rebuilds erhalten. **`-v` nur verwenden, wenn du wirklich alle Bücher, Assets und Hörbuch-MP3s löschen willst.**

## Logs

```bash
docker compose -f docker-compose.prod.yml logs -f                # alle Services
docker compose -f docker-compose.prod.yml logs -f backend        # nur Backend
docker compose -f docker-compose.prod.yml logs -f --tail=100     # letzte 100 Zeilen, mitlaufen
```

Das Backend loggt jeden API-Request (Uvicorn-Access-Log) und jeden Plugin-Lebenszyklus-Event. Fehler ab WARNING/ERROR-Level enthalten strukturierten Kontext (book_id, Plugin-Name, etc.).

## Reverse-Proxy

Wenn Bibliogon hinter nginx / Caddy / Traefik / Apache läuft, zwei Punkte:

1. **`/api/*` an dasselbe Upstream weiterleiten** — der Frontend-Container proxyt `/api/*` schon intern, also kannst du entweder den Reverse-Proxy auf Port `7880` zeigen lassen (Bibliogon als Black Box) oder splitten (`/` auf Frontend-Container, `/api/*` direkt auf Backend-Container). Der Single-Port-Ansatz ist einfacher und passt zum Default-Deployment.
2. **Den eigenen Hostname zu `BIBLIOGON_CORS_ORIGINS` hinzufügen.** Sonst blockiert der Browser das Frontend mit einem CORS-Fehler beim Backend-Aufruf. Komma-separierte Liste, z. B. `BIBLIOGON_CORS_ORIGINS=https://buecher.example.com,https://localhost:7880`.

HTTPS-Terminierung gehört auf den Reverse-Proxy. Die Bibliogon-Container handhaben kein TLS.

## Backups

Zwei sich ergänzende Mechanismen:

- **App-Ebene `.bgb` pro Buch** — exportiert über die Bibliogon-UI (Einstellungen → Backup). Deckt ein einzelnes Buch ab, seine Kapitel, seine Assets, optional die Hörbuch-MP3s. Portabel zwischen Bibliogon-Instanzen.
- **Volume-Ebene-Backup** — deckt den gesamten Bibliogon-Zustand ab inklusive jedes Buchs, Plugin-State und installierter Plugins. Der Tar-Befehl oben. Geeignet für nächtliche Cron-Jobs.

Das optionale [git-sync-Plugin](https://github.com/astrapi69/bibliogon/blob/main/plugins/bibliogon-plugin-git-sync) kann zusätzlich jedes Buch in ein eigenes Git-Repo pushen — Pro-Buch-Versionskontrolle + ein Off-Site-Backup-Ziel. Siehe die [Git-Backup-Hilfeseite](../git-backup/basics.md).

## Updates

Auf einen neuen Bibliogon-Release aktualisieren:

```bash
cd ~/bibliogon
git pull origin main
git checkout vX.Y.Z          # der neue Release-Tag
./stop.sh
./start.sh                   # baut die Images am neuen Tag neu
```

Die Launcher-Binärdatei ([Windows-Launcher](../launcher-windows.md), [macOS-Launcher](../launcher-macos.md), [Linux-Launcher](../launcher-linux.md)) verpackt diesen Lebenszyklus in eine Tray-Icon-UI mit Auto-Update-Erkennung. Für Server-Deployments ist der explizite Shell-Ablauf vorhersagbarer.

Das Lock-Step-Versionierungs-Modell bedeutet, dass es **nie** ein Teil-Upgrade gibt — Backend, Frontend und jedes Plugin liefern immer dieselbe Version aus. Tag pullen, neu starten, fertig.

### Daten-Migrationen

Bibliogon nutzt Alembic für Schema-Migrationen. Der FastAPI-Lifespan führt `alembic upgrade head` beim Start aus, sodass ein frisches `./start.sh` nach Pull eines neuen Tags ausstehende Migrationen anwendet. Die Migrationen sind idempotent und forward-only.

Für die v0.25.0+-Dateisystem-Migration (Daten zogen aus dem Projektverzeichnis nach platformdirs / `BIBLIOGON_DATA_DIR`) migriert der FastAPI-Lifespan beim ersten Start automatisch und schreibt einen `.migrated-YYYY-MM-DD`-Breadcrumb an jedem alten Pfad. Den Umzug bestätigen, bevor du die alten Dateien manuell löschst.

## Stolpersteine

### Container starten nicht

```bash
docker compose -f docker-compose.prod.yml logs backend  | tail -30
docker compose -f docker-compose.prod.yml logs frontend | tail -30
```

Häufigste Ursachen:

- **Port 7880 belegt** durch einen anderen Dienst. `BIBLIOGON_PORT=7881` (oder einen anderen freien Port) in `.env` setzen.
- **`BIBLIOGON_SECRET_KEY` fehlt** — `start.sh` sollte einen generieren; wenn das stillschweigend fehlschlug, prüfe, dass `.env` sowohl `BIBLIOGON_SECRET_KEY=` als auch `BIBLIOGON_CREDENTIALS_SECRET=` mit nicht-leeren Werten enthält.
- **Festplatte voll** — das bibliogon-data-Volume braucht Platz für die SQLite-DB und Uploads. `df -h` und `docker system df` lohnen den Blick.

### Backend-Health-Check schlägt fehl

Der `/api/health`-Endpoint gibt 200 zurück, sobald die DB erreichbar ist und der Plugin-Manager geladen hat. Wenn Health nach 5+ Minuten unhealthy bleibt:

```bash
docker compose -f docker-compose.prod.yml exec backend python -c "from app.database import engine; print(engine.url)"
docker compose -f docker-compose.prod.yml exec backend ls -la /app/data/
```

Wenn `/app/data/bibliogon.db` existiert, aber der DB-Query fehlschlägt, kann die SQLite-Datei beschädigt sein. Stoppen, aus dem letzten Volume-Backup wiederherstellen, neu starten.

### Plugin lädt nicht

```bash
docker compose -f docker-compose.prod.yml logs backend | grep -i plugin
```

Plugin-Discovery nutzt `importlib.metadata.entry_points()`. Ein Plugin, das beim Import scheitert, wird auf ERROR-Level mit dem Import-Fehler geloggt und übersprungen. Andere Plugins laden weiter. Häufige Ursache: fehlende Abhängigkeit in `pyproject.toml` des Plugins, die nicht im Container gebündelt war.

### CORS-Fehler in der Browser-Konsole

Den Hostname zu `BIBLIOGON_CORS_ORIGINS` hinzufügen. Der Default `http://localhost:7880` lässt nur das Frontend des lokalen Rechners durch. Hinter einem Reverse-Proxy auf `buecher.example.com`: `BIBLIOGON_CORS_ORIGINS=https://buecher.example.com`.

> Zuletzt geprüft für v0.29.0 (2026-05-07).
