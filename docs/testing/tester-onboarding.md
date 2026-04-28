# Bibliogon Tester Onboarding

Goal: get from zero to running your first test session in 30
minutes.

If anything in this guide is wrong by the time you read it, check
the actual `Makefile` for the canonical commands. Files lie; the
Makefile is the source of truth.

---

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Docker | 24+ | Production deploy via `make prod`; not required for `make dev` |
| Python | 3.11+ | Backend |
| Poetry | 1.8+ | Backend dependency manager |
| Node.js | **20.19+ or 22.12+** | Vite 7 needs `crypto.hash` API |
| npm | 10+ | Frontend |
| git | any | Source |
| Modern browser | Chrome / Firefox / Safari | Test target |

8 GB RAM minimum. 16 GB if running tests + dev concurrently.

If Node is below 22 LTS, upgrade before continuing — `make dev`
will start, but `make build` and some tests fail with `crypto.hash
is not a function`. See [../help/en/developers/troubleshooting.md](../help/en/developers/troubleshooting.md).

---

## Setup

### Clone and install

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
make install
```

`make install` runs `install-plugins`, `install-backend`,
`install-frontend`, and `install-e2e` in sequence. First run is
slow (~5-10 min); subsequent runs are fast.

### Linux only: raise inotify limits

`make dev` on Linux will fail with `ENOSPC: System limit for number
of file watchers reached` unless inotify limits are raised. One-time
fix:

```bash
make fix-watchers
```

Persistent across reboots. macOS and Windows are unaffected.

### Start the application

```bash
make dev
```

This starts:

- **Backend** at `http://localhost:8000` (FastAPI + uvicorn,
  `--reload` enabled)
- **Frontend** at `http://localhost:5173` (Vite dev server)

Open `http://localhost:5173` in your browser. The dashboard should
load. If it shows "Welcome to Bibliogon", setup is correct.

### Stop / restart

```bash
make stop       # alias for dev-down; kills both processes
make restart    # stop + start
```

Background mode (useful when running tests against a live app):

```bash
make dev-bg     # start in background
make dev-down   # stop
```

---

## Test data

### Fresh installation

A first-time `make dev` boots with an empty database
(`backend/bibliogon.db` is created on first request). Use the UI
to create your test data:

1. Click **New Book** — fill title + author, save.
2. Click **New Article** — fill title, save.
3. Add a chapter to the book.

This takes ~2 minutes and gives you the minimum surface to test
core flows.

### Reset to clean state

There is **no** `make reset-test-db` target as of v0.24.0. If a
test leaves you in a broken state:

```bash
make stop
rm backend/bibliogon.db backend/bibliogon.db-wal backend/bibliogon.db-shm 2>/dev/null
make dev
```

The database is recreated on next request. Note: this also wipes
your test fixtures.

### Test fixtures via API

To script repeatable test data, use the API directly:

```bash
# Create a book
curl -X POST http://localhost:8000/api/books \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Book","author":"Tester"}'

# Create an article
curl -X POST http://localhost:8000/api/articles \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Article"}'
```

Bookmark `http://localhost:8000/api/docs` (FastAPI Swagger UI) for
the full API surface.

---

## Your first test (5 minutes)

This sanity check covers the critical path:

1. Open `http://localhost:5173`.
2. Click **New Article** in the dashboard.
3. Fill title `Onboarding Test`. Save.
4. Wait until the auto-save indicator shows **Saved**.
5. Click into the editor body, type `Hello world`.
6. Wait again for **Saved**.
7. Reload the page (`F5`).
8. Verify the article is still there with `Hello world` in the
   body.

If all 8 steps pass, your environment is healthy. Proceed to a
real test session.

---

## Running existing tests

```bash
# Everything (backend + plugins + frontend Vitest, no coverage)
make test

# Backend only
make test-backend

# Plugin tests
make test-plugins

# Frontend Vitest
make test-frontend

# E2E smoke (Playwright; needs `make dev-bg` running)
cd frontend && npx playwright test --project=smoke

# E2E full regression
cd frontend && npx playwright test --project=full
```

Expected baselines as of v0.24.0:

| Suite | Count |
|-------|-------|
| Backend | 1198 tests |
| Frontend Vitest | 664 tests |
| All plugins (sum) | 432 tests |
| E2E smoke specs | 20 |
| E2E full specs | 0 (currently empty) |

If your local count differs by more than ~5, your install or
fixtures are stale.

---

## Reporting findings

### Per-session report

Use [test-result-template.md](test-result-template.md). One file
per session under `docs/testing/sessions/YYYY-MM-DD-session-N-{topic}.md`.

### GitHub issues (Critical / High findings)

Title format: `[Bug][severity] Short description`. Body must include:

- **Bibliogon version** (e.g., `v0.24.0` or commit hash)
- **Reproduction steps** (numbered list)
- **Actual outcome**
- **Expected outcome**
- **Evidence** (screenshot, log, or stack trace)

Open within 24h of finding. Critical findings interrupt the session;
High can wait until the session report.

### Backlog entries (Medium / Low findings)

Add to `docs/backlog.md` under the appropriate severity section.
Keep the entry short — one or two sentences plus reproduction
hint. The backlog is a queue, not a tracker.

---

## Common pitfalls

### "Editor disabled" or "API 502"

Backend isn't ready. `make dev` waits up to 10 seconds; on slow
machines it may need longer. Wait 30 seconds after `make dev` and
hard-refresh the browser.

### "Theme toggle missing"

Check the editor header (top right). It moves between releases —
if the toggle isn't in the location your test step expects, the
test step is stale, not the app.

### Tests pass locally but fail in CI

Two common causes documented in [../../.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md):

- Stale `poetry install` — run `poetry install --sync` to remove
  vanished deps.
- Missing path-deps in `backend/pyproject.toml` — every plugin
  whose code is exercised by tests must be declared.

### Backend port 8000 already in use

A previous `make dev-bg` left uvicorn running.

```bash
make dev-down
# or, if that doesn't clear it:
lsof -i :8000
kill <pid>
```

### `make dev` hangs after backend starts

The frontend is waiting for inotify. See "Linux only: raise inotify
limits" above.

---

## Where to learn more

- [test-plan.md](test-plan.md) — strategy and severity definitions.
- [../smoke-tests-catalog.md](../smoke-tests-catalog.md) — catalog of manual smoke tests with severity.
- [coverage-matrix.md](coverage-matrix.md) — feature-by-feature coverage state.
- [../help/en/developers/troubleshooting.md](../help/en/developers/troubleshooting.md) — environment troubleshooting.
- [../../CLAUDE.md](../../CLAUDE.md) — project orientation for the AI assistant; useful for humans too.
- [../ROADMAP.md](../ROADMAP.md) — what's shipped vs in flight.

If a step in this guide doesn't match reality, fix the guide. The
onboarding doc is the entry point — drift here costs new testers
the most.
