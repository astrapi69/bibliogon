# Next-session handover — 2026-05-13

Closing summary for the v0.31.0 release-and-cleanup session.
Includes a paste-ready prompt block at the bottom for kicking
off the next session.

## What shipped today

**v0.31.0 released** —
https://github.com/astrapi69/bibliogon/releases/tag/v0.31.0

Plus three P3 backlog closures after release:

| ID | Commit | One-line |
|----|--------|----------|
| BACKUP-HISTORY-SINGLETON-01 | `c90d47d` + `ab36e16` | `list()` and `add()` reload from disk so multi-instance singletons converge |
| BACKEND-UPLOAD-SIZE-LIMIT-01 | `5c41d46` + `43a486c` | `BodySizeLimitMiddleware` caps POST/PUT/PATCH at 500 MB |
| CRYPTOGRAPHY-V48-MIGRATION-01 | `3e38cf7` + `60eb147` + `78f40c2` | cryptography 46 → 48 + pillow 11.3 → 12.2 in launcher + pip-audit pass |

All three trigger conditions were active: the first had a red
Playwright spec; the second was independently flagged by the
pre-release audit; the third was paired with the pip-audit
trigger (and the audit surfaced the pillow CVEs as
independent value).

## Test + verification state

Numbers verified at end of session:

- Backend pytest: **1626 passed**, 1 skipped (`make test`).
- Frontend Vitest: **929 passed** (no change from v0.31.0 ship).
- Launcher pytest: **196 passed**.
- Launcher PyInstaller `--clean --noconfirm`: builds clean.
- Playwright smoke: 188/199 (11 pre-classified non-blockers,
  detail in
  [docs/audits/pre-release-verification-2026-05-12.md](../audits/pre-release-verification-2026-05-12.md)).
- ruff / mypy (96 → 98 files) / tsc / pre-commit / docs
  discipline / sync-versions-check / verify-plugin-locks: all
  clean.

## Working tree state

`git status` clean. `git log origin/main..HEAD` is empty (all
commits pushed). HEAD = `78f40c2`.

## Docker environment state (worth carrying forward)

Four containers running on the dev machine at session close:

| Container | Image | Purpose |
|-----------|-------|---------|
| `bibliogon-backend-1` | `bibliogon-backend` | Dev backend on `:8000`, restarted twice in this session to pick up code changes |
| `bibliogon-frontend-1` | `node:24-slim` | Vite dev server on `:5173` |
| `astrapi69-backend-1` | `astrapi69-backend` | Production-mode compose, 7 days old |
| `astrapi69-frontend-1` | `astrapi69-frontend` | Production nginx, port 7880 |

The dev compose binds `./backend:/app` (host UID mismatch is
the root cause of the dev-docker write quirks documented in
`PROD-WRITES-ARCHITECTURE-01`). Production compose uses a
named `bibliogon-data` volume and is unaffected.

## Backlog state going into the next session

ROADMAP P0 / P1 / P2: **empty**.

Backlog P2 — all three trigger-deferred (waiting on user
reports):
- `MEDIUM-IMPORT-V2-01` — dry-run preview UI before bulk
  Medium import.
- `ASYNC-IMPORT-PROGRESS-01` — switch
  `/api/medium-import/import` to the existing async-job
  pattern with SSE.
- `MEDIUM-IMPORT-V2-02` — AI tag inference for imported
  articles.

Backlog P3 remaining (after today's three closures):
- **`PROD-WRITES-ARCHITECTURE-01`** — large refactor.
  10+ writes in `settings.py` + plugin install/uninstall
  go through `_base_dir / "config" / "app.yaml"`. The fix:
  route writes through `get_data_dir() / "config" /
  "app.yaml"` with the existing
  `_load_app_config()` merge mechanism already covering the
  read path. Production Docker fine; dev-docker quirk only.
- `I18N-NATIVE-REVIEW-V031-01` — needs native speakers,
  not code.
- `MUTMUT-STATS-COLLECTION-BUG-01` — investigative;
  `BadTestExecutionCommandsException` during mutmut's
  stats-collection phase. See
  `docs/audits/mutmut-2026-05-02-import.md` for the original
  CI run that failed. Pytest invocation
  `pytest --rootdir=. --tb=native -x -q tests/` succeeds on
  its own — so the failure is inside mutmut's pytest plugin,
  not pytest. Likely interaction with the session-scope
  autouse fixtures in `conftest.py` (`BIBLIOGON_TEST=1` +
  the production-marker tripwire).
- `BIBLIOGON-DATA-FIX-FRAMEWORK-01` — wait for 5th
  one-shot script.
- `D-06-VALIDATION-01` — manual fresh-machine validation.
- `PGS-05-FU-01` — git-sync follow-up; no trigger.
- `AR-BULK-SERIES-HIERARCHY-01` — feature; no trigger.
- `I18N-DIACRITICS-01` — needs native-speaker review per
  language.

P4 / P5 / Blocked: see `docs/backlog.md` and `docs/ROADMAP.md`.

## Open threads (paused, not finished)

**MUTMUT-STATS-COLLECTION-BUG-01 investigation**: started
this session but pivoted to handover before reading mutmut's
internals. Nothing committed. The audit file
`docs/audits/mutmut-2026-05-02-import.md` is the entry
point. Next-session approach:

1. `cd backend && poetry run mutmut run --paths-to-mutate
   app/import_plugins/ 2>&1 | head -30` — capture the exact
   `BadTestExecutionCommandsException` traceback.
2. Look at mutmut's `__main__.py` and the version-specific
   stats-collection code path.
3. Check if our `conftest.py`'s autouse session fixtures
   (env-var setting BEFORE app import, the
   `.bibliogon-production` marker tripwire) confuse
   mutmut's plugin discovery.
4. If the fix is upstream: file an issue against mutmut.
   If the fix is local: monkeypatch in `conftest.py` OR add
   a mutmut-specific config flag.

## Recommended next-session priority

**Either** `PROD-WRITES-ARCHITECTURE-01` (clean refactor,
2-4 hours of focused work, but architecture is already
defined via the existing `_load_app_config` merge mechanism
— most of the work is finding all the write sites and
swapping their target path) **or** `MUTMUT-STATS-COLLECTION-BUG-01`
(investigative; could be a 30-minute fix or a 2-hour
rabbit hole — limit by time-box).

Both are dev-quality-of-life rather than user-facing. None of
the user-facing P2 items have had their triggers fire (the
v0.31.0 audit confirmed there's no concrete user demand for
them yet).

If neither feels appealing as a next session, the alternative
is to wait for a real-world trigger (a user-report,
a CVE, a feature request) and pick that up reactively. Three
of today's closures were trigger-driven; that's a defensible
model going forward.

## Session-start checklist for the next session

```bash
# 1. Recent changes
git log --oneline -10

# 2. Open items
grep -A1 -B1 "^- \*\*[A-Z]" docs/backlog.md | head -60

# 3. Green baseline
make test

# 4. Optional: refresh the dev backend if it's been idle
docker restart bibliogon-backend-1 && \
  until curl -sf -o /dev/null http://localhost:8000/api/health; \
  do sleep 2; done
```

---

## Paste-ready prompt for the next session

```
Welcome back. v0.31.0 shipped 2026-05-13 along with three
follow-up P3 closures (BACKUP-HISTORY-SINGLETON-01,
BACKEND-UPLOAD-SIZE-LIMIT-01, CRYPTOGRAPHY-V48-MIGRATION-01).
The full handover is at
docs/journal/next-session-handover-2026-05-13.md — read that
first.

Quick start:
1. git log --oneline -10  (verify clean main at 78f40c2 or
   later)
2. make test  (expect 1626 passed, 1 skipped backend + 929
   Vitest)
3. Read the "Recommended next-session priority" section of
   the handover doc and tell me which path you'd take.

Top two candidates for productive work:

- PROD-WRITES-ARCHITECTURE-01 (P3): route writes from
  settings.py + plugin_install through get_data_dir() so
  dev-docker no longer crashes Settings updates and plugin
  install/uninstall. The read-merge mechanism
  (_load_app_config in backend/app/main.py) already exists;
  the refactor is mostly finding the write sites and
  swapping their target path. ~2-4 hours.

- MUTMUT-STATS-COLLECTION-BUG-01 (P3): investigative.
  Mutmut's run_stats_collection phase raises
  BadTestExecutionCommandsException on Bibliogon's test
  harness; pytest with the same invocation succeeds on its
  own. Likely an interaction with our session-scope autouse
  fixtures in conftest.py. Time-box to 45 minutes; if the
  fix isn't obvious by then, document the deeper
  investigation and move on.

Neither is critical. If neither feels right, picking
"wait-for-trigger" is a defensible call — three of today's
closures were trigger-driven (a red spec, a security audit
finding, a CVE-paired bump).

Don't overscope. Prefer one clean close over two half-done.
```

End of handover.
