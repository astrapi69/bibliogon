# Entwickler-Fehlerbehebung

Haeufige Probleme im Dev-Setup, die `make dev` treffen, und wie man
sie loest. Produktions-Deploys (Docker `make prod` + nativer
Launcher) sind davon nicht betroffen: das statische Frontend-Build
und `uvicorn` ohne `--reload` ueberspringen die File-Watching-
Schicht komplett.

## ENOSPC: File-Watcher-Limit erreicht

Symptom: `make dev` startet das Backend, dann scheitert das Frontend
mit:

```
Error: ENOSPC: System limit for number of file watchers reached,
watch '/.../frontend/vite.config.ts'
```

Ursache: Linux `fs.inotify.max_user_watches` ist zu niedrig. GNOME
Tracker liefert `/usr/lib/sysctl.d/30-tracker.conf` aus, das den
Wert auf 65536 deckelt, was fuer den TipTap + Vite + uvicorn Dev-
Stack zu wenig ist.

Loesung (einmalig, dauerhaft):

```bash
make fix-watchers
```

Das Target schreibt `/etc/sysctl.d/99-bibliogon-watchers.conf` mit
beiden Limits hochgesetzt:

- `fs.inotify.max_user_watches=524288`
- `fs.inotify.max_user_instances=512`

Der 99-Praefix gewinnt die lexikalische Reihenfolge gegen
30-tracker, sodass die hoeheren Limits ueber Neustarts hinweg
bestehen bleiben.

Wenn `make fix-watchers` nicht verfuegbar ist, die equivalente
Befehle:

```bash
echo "fs.inotify.max_user_watches=524288"   | sudo tee    /etc/sysctl.d/99-bibliogon-watchers.conf
echo "fs.inotify.max_user_instances=512"    | sudo tee -a /etc/sysctl.d/99-bibliogon-watchers.conf
sudo sysctl --system
```

`make dev` prueft das Limit vorab und warnt, wenn es unter 100000
liegt.

## Vite-Build scheitert mit `crypto.hash is not a function`

Symptom: `npm run build` (oder jeder Vite-Build) bricht ab mit
`[postcss] crypto.hash is not a function`.

Ursache: Vite 7 nutzt die `crypto.hash` Node-API, die in Node 20.19+
bzw. 22.12+ gelandet ist. Auf Node 18 fehlt die API und das PWA-
Plugin crasht im Postcss-Handling. Die Fehlermeldung verweist auf
Postcss; das eigentliche Problem ist die Node-Version.

Loesung: lokales Node auf 22 LTS oder neuer aktualisieren.

```bash
nvm install 22
nvm use 22
```

CI laeuft bereits auf Node 24; das betrifft nur lokale Entwicklung.

## Backend-Tests scheitern mit "duplicate column name"

Symptom: `make test` scheitert im Backend mit:

```
sqlite3.OperationalError: duplicate column name: ...
```

Ursache: eine neue Alembic-Migration mit `ALTER TABLE` wurde
gepullt, aber die lokale `backend/bibliogon.db` hat noch die alte
`alembic_version`. Das Test-Harness erstellt die Tabellen mit dem
neuen Schema neu, waehrend die DB die Migration darauf anwendet.

Loesung: lokale SQLite-Datei loeschen und neu starten.

```bash
rm backend/bibliogon.db
make test
```

Das Test-Harness erstellt die Datenbank frisch.

## Pre-commit-Hooks fehlen

Symptom: Commits enthalten Formatierungs-Drift oder import-untyped-
Fehler, die lokal haetten gefangen werden sollen.

Ursache: pre-commit-Hooks wurden nie registriert.

Loesung:

```bash
cd backend && poetry run pre-commit install
```

Die Hooks laufen dann automatisch bei jedem `git commit`. Manuell
auf allen Dateien laufen lassen mit:

```bash
cd backend && poetry run pre-commit run --all-files
```

## Backend-Port 8000 belegt

Symptom: `make dev` scheitert mit `[Errno 98] Address already in use`.

Ursache: ein frueheres `make dev-bg` hat ein uvicorn am Leben
gelassen, oder ein anderer Prozess belegt Port 8000.

Loesung:

```bash
make dev-down
```

Falls das nicht aufraeumt, den Prozess von Hand suchen:

```bash
lsof -i :8000
kill <pid>
```

## SQLite-Datenbank ist gesperrt

Symptom: API-Calls scheitern mit `database is locked` waehrend
Tests oder nach dem Abbrechen einer laufenden Transaktion.

Ursache: SQLite ist Single-Writer. Ein vorheriger Prozess haelt eine
Schreib-Sperre, oder die WAL-Dateien (`*.db-shm`, `*.db-wal`) sind
verwaist.

Loesung:

```bash
make dev-down
rm -f backend/bibliogon.db-shm backend/bibliogon.db-wal
```

Mit `make dev` neu starten. Produktion nutzt Docker und isoliert die
Datenbank; das trifft nur lokale Entwicklung.

## Plugin installiert, Routen liefern 404

Symptom: ein Plugin liegt in `plugins/`, `make install-plugins` war
erfolgreich, aber die Routen liefern 404.

Ursache: das `poetry.lock` des Backends cached die aufgeloesten
transitiven Abhaengigkeiten von Path-installierten Plugins. Nach
einer Aenderung der Plugin-pyproject.toml ist der Backend-Lock
veraltet.

Loesung:

```bash
cd backend && poetry lock && poetry install
```

Danach `make dev` neu starten.

## Nuetzliche Diagnose-Befehle

```bash
# inotify-Limits pruefen
cat /proc/sys/fs/inotify/max_user_watches
cat /proc/sys/fs/inotify/max_user_instances

# Node-Version pruefen
node --version    # Benoetigt 20.19+ oder 22.12+

# Python-Version pruefen
poetry env info | grep -i python    # Benoetigt 3.11+

# Was laeuft auf den Dev-Ports
ss -tulpn | grep -E ':(5173|8000)'

# Dev-Backend-Logs ansehen (bei dev-bg)
ps aux | grep uvicorn
```
