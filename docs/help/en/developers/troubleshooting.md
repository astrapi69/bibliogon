# Developer Troubleshooting

Common dev-environment issues that hit `make dev` and how to fix
them. Production deploys (Docker `make prod` + the native launcher)
do not trigger these; the static frontend build and `uvicorn`
without `--reload` skip the file-watching layer entirely.

## ENOSPC: file watcher limit reached

Symptom: `make dev` starts the backend, then frontend fails with:

```
Error: ENOSPC: System limit for number of file watchers reached,
watch '/.../frontend/vite.config.ts'
```

Cause: Linux `fs.inotify.max_user_watches` is too low. GNOME Tracker
ships `/usr/lib/sysctl.d/30-tracker.conf` capping it at 65536, which
is too low for the TipTap + Vite + uvicorn dev stack.

Fix (one-time, persistent):

```bash
make fix-watchers
```

The target writes `/etc/sysctl.d/99-bibliogon-watchers.conf` with
both limits raised:

- `fs.inotify.max_user_watches=524288`
- `fs.inotify.max_user_instances=512`

The 99- prefix wins lexical order against 30-tracker so the higher
limits stick across reboots.

If `make fix-watchers` is unavailable, run the equivalent commands:

```bash
echo "fs.inotify.max_user_watches=524288"   | sudo tee    /etc/sysctl.d/99-bibliogon-watchers.conf
echo "fs.inotify.max_user_instances=512"    | sudo tee -a /etc/sysctl.d/99-bibliogon-watchers.conf
sudo sysctl --system
```

`make dev` pre-checks the limit and warns if it is below 100000.

## Vite build fails with `crypto.hash is not a function`

Symptom: `npm run build` (or any vite build) errors with
`[postcss] crypto.hash is not a function`.

Cause: Vite 7 uses the `crypto.hash` Node API which landed in Node
20.19+/22.12+. On Node 18, the API is missing and the PWA plugin's
postcss handling crashes. The error message references postcss; the
real problem is the Node version.

Fix: upgrade local Node to 22 LTS or newer.

```bash
nvm install 22
nvm use 22
```

CI runs Node 24 already; this only affects local development.

## Backend tests fail with "duplicate column name"

Symptom: `make test` fails on backend with:

```
sqlite3.OperationalError: duplicate column name: ...
```

Cause: a new Alembic migration that uses `ALTER TABLE` was pulled
in, but the local `backend/bibliogon.db` still has the old
`alembic_version`. The test harness re-creates tables with the new
schema while the DB tries to apply the migration on top.

Fix: delete the local SQLite file and rerun.

```bash
rm backend/bibliogon.db
make test
```

The test harness recreates the database fresh.

## Pre-commit hook installs are missing

Symptom: commits land formatting drift or import-untyped errors that
should have been caught locally.

Cause: pre-commit hooks were never registered.

Fix:

```bash
cd backend && poetry run pre-commit install
```

Hooks then run automatically on every `git commit`. Run them
manually on all files with:

```bash
cd backend && poetry run pre-commit run --all-files
```

## Backend port 8000 already in use

Symptom: `make dev` fails with `[Errno 98] Address already in use`.

Cause: a previous `make dev-bg` left a uvicorn running, or another
process is on port 8000.

Fix:

```bash
make dev-down
```

If that does not clear it, find the process by hand:

```bash
lsof -i :8000
kill <pid>
```

## SQLite database is locked

Symptom: API calls fail with `database is locked` during heavy
concurrent test runs or after killing an in-flight transaction.

Cause: SQLite is single-writer. A previous process is holding a
write lock, or the WAL files (`*.db-shm`, `*.db-wal`) are stale.

Fix:

```bash
make dev-down
rm -f backend/bibliogon.db-shm backend/bibliogon.db-wal
```

Restart with `make dev`. Production uses Docker which isolates the
database; this only hits local development.

## Plugin-installed but routes return 404

Symptom: a plugin is in `plugins/` and `make install-plugins`
succeeded, but its routes return 404.

Cause: the backend's `poetry.lock` caches the resolved transitive
dependencies of path-installed plugins. After a plugin pyproject
change, the backend lock is stale.

Fix:

```bash
cd backend && poetry lock && poetry install
```

Then restart `make dev`.

## Useful diagnostic commands

```bash
# Check inotify limits
cat /proc/sys/fs/inotify/max_user_watches
cat /proc/sys/fs/inotify/max_user_instances

# Check Node version
node --version    # Need 20.19+ or 22.12+

# Check Python version
poetry env info | grep -i python    # Need 3.11+

# Check what is running on dev ports
ss -tulpn | grep -E ':(5173|8000)'

# View dev backend logs (when run via dev-bg)
ps aux | grep uvicorn
```
