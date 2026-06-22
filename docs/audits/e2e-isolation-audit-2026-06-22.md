# E2E Test-Isolation Audit — 2026-06-22

Audit-first response to the isolation directive ("alle E2E-Tests müssen
isoliert laufen — eigene Testdaten pro Spec, kein shared State, grün in
beliebiger Reihenfolge"). Goal: identify *exactly* where shared state
exists before changing anything — no big-bang per-worker rewrite without
facts.

## Verdict

**Data-isolation already works. The flakes are infra accumulation in the
single long-lived backend, not cross-test data contamination.**

- Every test starts from a clean DB: the autouse `resetDatabase` fixture
  calls `DELETE /api/test/reset` (wipes 19 content tables FK-safe) +
  `resetSettings()` before each test, and specs seed their own data.
- The recurring load-flakes (detach-during-click #534, "container not
  rendered in 5s" #535/#536) were rendering/timing under cumulative
  system load — not state leaking between tests.
- The genuine shared state is the **one backend process** (port 8000)
  serving all 142 specs: its in-memory caches, the job store, and the
  on-disk DB/upload files accumulate across the run, so late tests run
  against a heavier, slower backend.

This narrows the fix scope: close the accumulation gaps, don't re-isolate
data that is already isolated.

## Shared-state map (evidence)

| Surface | Reset per test? | Risk | Evidence |
|---|---|---|---|
| **19 content tables** (Book/Chapter/Article/Page/Comic*/Story*/…) | ✅ yes | none | `backend/app/routes_admin.py:274-306` wipes them FK-safe |
| **`ui` + `topics` settings** | ✅ yes | none | `resetSettings()` restores baseline `ui` + `topics` (`e2e/helpers/api.ts`) |
| **non-`ui` settings keys** (behavior / ai / author / plugins / export …) | ❌ no | low (latent) | `resetSettings()` PATCHes only `ui` + `topics`; a spec changing e.g. `behavior` would leak. grep found **no** spec currently mutating those → no live leak, but unguarded |
| **4 backend `lru_cache`s** | ❌ no | low (safe) | `platform_schema.py`, `registries/{content_type,story_entity,book_type}_registry.py`. Read-only config/seed caches; E2E never fakes backend config (unlike pytest), so staleness can't occur |
| **`job_store` (in-memory singleton)** | ❌ no | low-moderate | `job_store = JobStore()` module-level (`backend/app/job_store.py:286`). In-flight export/audiobook jobs + SSE state persist; id-keyed so collisions are unlikely, but a hung job lingers |
| **Upload / asset files** | ❌ no | moderate | Asset rows are deleted, the files orphan. Live proof: `/tmp/bibliogon-e2e-data` holds **8.7 MB / 16 files** after a run, incl. `uploads/articles/<id>/imported_image` orphans |
| **SQLite DB file + WAL** | ❌ no (rows only) | moderate | `e2e.db` + `e2e.db-wal` + `e2e.db-shm` persist; `DELETE` rows do not shrink the file/WAL, so it grows over the run → slower late tests |

### Order-independence

Because content tables are wiped before every test and specs seed their
own data, there is **no data-level order dependency** in serial runs. The
only theoretical order vectors are the unguarded surfaces above
(non-`ui` settings, a lingering job, a colliding upload filename) — none
observed today. A shuffled full run with `retries:0` would confirm
empirically; deferred (cheap to add as a CI variant later).

## Options

### Option A — Harden the reset endpoint (targeted; recommended)

Extend `DELETE /api/test/reset` (and/or the `resetDatabase` fixture) to
clear the accumulation in one central place:

- clear the 4 `lru_cache`s (`*.cache_clear()`),
- reset the `job_store` singleton,
- delete the upload/asset files under the test data dir,
- `PRAGMA wal_checkpoint(TRUNCATE)` / `VACUUM` the e2e DB so it stops
  growing,
- (optional) make `resetSettings()` restore the **full** settings object,
  not just `ui` + `topics`, closing the latent non-`ui` leak.

Pros: one file, central, low-risk, keeps `workers: 1`, directly removes
every identified shared-state source → late tests run against a
backend as fresh as the first. Cons: does not unlock parallelism.

Effort: small (1 PR). **Matches the directive: facts-first, targeted, no
big-bang.**

### Option B — Per-worker backend + DB (structural)

A global-setup that starts one backend per `TEST_WORKER_INDEX` on
`8000+index` with its own SQLite DB + `baseURL`.

Pros: true isolation by construction (each worker is a universe) **and**
unlocks `workers > 1` (parallel speed — the thing that currently can't
work because of the shared backend). Cons: real infra change (port
allocation, per-worker lifecycle, baseURL plumbing), multi-PR, higher
risk; the audit shows it is **not required** to fix the observed flakes.

Effort: large (several PRs). Best if parallel wall-clock becomes a goal.

### Option C — Status quo + the timeout fix only

`#536` (`expect.timeout: 10_000`) already absorbs the load-timing
symptom; the suite passes serially. Accept the accumulation as benign.

Pros: zero further work. Cons: leaves the unguarded shared-state
surfaces in place (a future settings-mutating spec or a hung job could
reintroduce order-flakes); the DB/upload growth keeps degrading long
runs.

Effort: none.

## Recommendation

**Option A.** It is the smallest change that actually closes every
shared-state gap the audit found, keeps the serial model, and carries no
big-bang risk. Option B stays on the table as a separate initiative *if
and when* parallel speed is wanted — but the facts say it is not needed to
make the suite robust. Option C under-delivers on the directive (the gaps
remain).
