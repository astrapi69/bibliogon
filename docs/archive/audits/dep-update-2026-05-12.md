# Dependency Audit — 2026-05-12

Audit date: 2026-05-12
Surfaces: backend (Poetry), frontend (npm), 10 plugin pyprojects,
GitHub Actions, Docker base images.

## Summary

- Backend: **30 outdated** (Poetry-level)
- Frontend: **32 outdated** (npm) — but **23 are TipTap 2→3
  deferred** (DEP-02 P3 backlog)
- Plugins: **10 plugins, ~10-15 outdated each**, all overlap heavily
  (same Pydantic / starlette / coverage / pygments drift)
- GitHub Actions: all at their current major versions (v4/v5)
- Docker base images: `python:3.12-slim` (latest stable),
  `node:24-slim` (current LTS), `nginx:alpine` (rolling)

| Category | Count | Action |
|---|---|---|
| Low-risk batch (patch + safe minor) | ~25 | ship in Phase 1 |
| Medium-risk (per-package review) | ~8 | ship with confirmation |
| High-risk (explicit user decision) | **4** | NOT shipping without OK |
| Deferred (DEP-02 / others) | 23 TipTap + 2 misc | leave |

## Low-Risk Batch (auto-update candidates)

Backend — patch or clean-minor of stable libraries:

| Package | Current | Latest | Risk |
|---|---|---|---|
| coverage | 7.13.5 | 7.14.0 | clean minor (test-only) |
| greenlet | 3.4.0 | 3.5.0 | minor of stable C-ext lib |
| idna | 3.13 | 3.14 | minor of stdlib-adjacent |
| jedi | 0.19.2 | 0.20.0 | dev-only (IDE completion) |
| mako | 1.3.11 | 1.3.12 | patch |
| matplotlib-inline | 0.2.1 | 0.2.2 | patch (notebook dep) |
| packaging | 26.1 | 26.2 | patch-ish, stdlib-adjacent |
| parso | 0.8.6 | 0.8.7 | patch (jedi dep) |
| pathspec | 1.1.0 | 1.1.1 | patch |
| pymupdf | 1.27.2.2 | 1.27.2.3 | patch |
| python-multipart | 0.0.27 | 0.0.28 | patch in 0.0.x |
| textual | 8.2.4 | 8.2.5 | patch |
| traitlets | 5.14.3 | 5.15.0 | minor of stable lib |
| types-markdown | 3.10.2.20260408 | 3.10.2.20260508 | type-stub date |
| types-pyyaml | 6.0.12.20260408 | 6.0.12.20260510 | type-stub date |
| virtualenv | 21.2.4 | 21.3.1 | minor |
| pip | 26.0.1 | 26.1.1 | minor (Poetry-managed, mostly inert) |

Frontend — patch versions of stable libraries:

| Package | Current | Latest | Risk |
|---|---|---|---|
| @vitest/coverage-v8 | 4.1.5 | 4.1.6 | patch (must pair with vitest) |
| vite | 8.0.11 | 8.0.12 | patch |
| vitest | 4.1.5 | 4.1.6 | patch (pair with @vitest/coverage-v8) |
| xstate | 5.31.0 | 5.31.1 | patch |

Plugins — same per-plugin patches across the matrix:

| Package | Current | Latest | Plugins affected |
|---|---|---|---|
| coverage | 7.13.5 | 7.14.0 | all 10 |
| idna | 3.11/3.13 | 3.14 | all 10 |
| packaging | 26.0/26.1 | 26.2 | all 10 |
| pygments | 2.19.2 | 2.20.0 | 6 plugins |
| pymupdf | 1.27.2.2 | 1.27.2.3 | 4 plugins |
| certifi | 2026.2.25 | 2026.4.22 | 5 plugins (CA cert refresh) |

**Strategy for plugin batch:** rather than bumping each plugin's
pyproject manually, run `poetry lock` per plugin to pick up the
transitive bumps without touching the pin specs. The `^` carets
already permit the patch bumps; only the lockfile drifts. Use the
existing `make lock-all-plugins` target (filed in commit `1b43aec`
per the lessons-learned "Two installation paths diverge"
session).

## Medium-Risk (per-package review)

| Package | Current | Latest | Surface | Why review |
|---|---|---|---|---|
| click | 8.1.8 | 8.3.3 | backend | 8.1 → 8.3 is two minor versions; check CLI flag deprecations |
| markdown-it-py | 4.0.0 | 4.2.0 | backend + export + ms-tools plugins | minor, parser lib; surface used in help-rendering + ms-tools |
| mdit-py-plugins | 0.5.0 | 0.6.0 | backend + export + ms-tools | 0.x minor = SemVer-permitted breakage, check changelog |
| propcache | 0.4.1 | 0.5.2 | backend + 4 plugins | 0.x minor, but it's a cache primitive (yarl/aiohttp dep); usually safe |
| pydantic | 2.12.5 → 2.13.4 | 2.13.3 → 2.13.4 | plugins (backend already at 2.13.3) | plugins lag backend; bump via `lock-all-plugins` |
| requests | 2.33.1 | 2.34.0 | backend + several plugins | minor of very stable lib; usually clean |
| urllib3 | 2.6.3 | 2.7.0 | backend + several plugins | minor; usually clean |
| wcwidth | 0.6.0 | 0.7.0 | backend + 2 plugins | 0.x minor; terminal-display lib used by textual |
| @types/node | 24.12.2 | 25.7.0 | frontend | **note: this is a major TYPE bump**; per lessons-learned "@types/node major bumps cascade into tsconfig lib"; defer until paired with TS upgrade |

For each medium-risk: ship if patch tests stay green; revert
individually if a single package breaks.

## High-Risk (explicit user decision required)

These four are **not** shipping without explicit user approval.
Each has a strong reason to defer:

### 1. `elevenlabs` 0.2.27 → 2.46.0 (BACKEND)

- **9 major versions of jump in one bump.**
- Pin is `^0.2.27` — restricts to `<0.3`. Latest is 2.46.0.
- ElevenLabs Python SDK had a fundamental API redesign post-1.0
  (sync → async client, response types changed, model registry
  reorganised). Used in `manuscripta`-adapter audiobook path
  (TTS engine routing).
- Effort to migrate: M-L. Touches the audiobook plugin's TTS
  adapter integration. Real risk of subtle behaviour changes
  (rate-limit handling, voice IDs, error types).
- **Recommendation:** defer. File as P3 dedicated bump
  `ELEVENLABS-SDK-V2-MIGRATION-01` with explicit scope.

### 2. `mypy` 1.20.2 → 2.1.0 (BACKEND)

- Major version bump of the type checker.
- mypy 2.x changed several inference defaults and dropped some
  legacy behaviours. Bibliogon's existing type stubs +
  `[tool.mypy.overrides]` (visible in `pyproject.toml`) were
  written against 1.x.
- The audit-led 2026-05-12 CI hardening added mypy to the lint
  gate (`lint-and-type-check` job). A 2.x bump that surfaces
  new errors would block CI immediately.
- **Recommendation:** defer. The CI gate adds risk asymmetry —
  one new mypy warning that the 1.x version didn't surface
  red-lines the whole build.

### 3. `cryptography` 46.0.7 → 48.0.0 (BACKEND)

- Major bump; cryptography historically has aggressive
  deprecations.
- Used transitively (PyJWT for license signing in
  `app/licensing.py`, plus some plugin chains).
- 48.0 dropped Python 3.7 support (we're on 3.12, fine) and
  removed some legacy hashes. License-signing path is HMAC-SHA256
  which is stable across versions, BUT the licensing-test suite
  should be re-run with extra attention.
- **Recommendation:** defer to a dedicated security-bump session
  paired with a `pip audit` review of the rest of the
  cryptography stack.

### 4. `starlette` 0.46.2 → 1.0.0 (PLUGINS, via FastAPI)

- **Major** of starlette (1.0 release).
- FastAPI currently pins `starlette>=0.46,<0.47` (or similar
  tight range). Bumping starlette to 1.0 requires either:
  (a) FastAPI minor/major bump that itself opens the starlette
  range,
  (b) overriding the pin via `[tool.poetry.dependencies]`
  starlette = "^1" — high risk of FastAPI runtime breakage.
- **Recommendation:** defer entirely. Track via a new backlog
  item `STARLETTE-V1-AWAIT-FASTAPI-01` (P5, BLOCKED on FastAPI
  shipping starlette-1.0 compat). Don't override pins.

## Deferred (do not touch)

- **TipTap 2 → 3 (DEP-02, P3 backlog).** 23 packages affected:
  `@tiptap/*` (21 packages), `@pentestpad/tiptap-extension-figure`,
  `tiptap-footnotes`. Per the lessons-learned community-extension
  pin rules (1.0.12 / 2.0.4 are the last TipTap-2-compatible
  pins). DEP-02 is the dedicated session.
- **`elevenlabs` / `mypy` / `cryptography` / `starlette`** — see
  High-Risk section above.
- **`rich` 14 → 15** (export + ms-tools plugins) — major bump;
  rich's API is fairly stable but a major version is a major
  version. Plugins use rich only for CLI / debug-print paths.
  Low priority. File as P5 if needed.

## Cross-Surface Conflicts

**Plugin-vs-backend Pydantic drift:**

- backend: `pydantic = "^2.13.0"` → installed 2.13.3
- plugins: `pydantic = "^2.10.0"` (most) → installed 2.12.5

Not a real conflict (both resolve via `^2.x`), but plugins lag
the backend. Filed in lessons-learned as
"Two installation paths diverge: `make test` vs per-plugin CI";
the `lock-all-plugins` make target exists for exactly this.
Running it picks up the patch transitives without touching
pyproject pin specs.

## GitHub Actions

All workflows at current majors:

| Action | Current pin | Notes |
|---|---|---|
| actions/checkout | v4 | v5 exists; not adopted yet; v4 still supported |
| actions/setup-python | v5 | current |
| actions/setup-node | v4 | current |
| actions/cache | v4 | current |
| actions/upload-artifact | v4 | current |
| actions/configure-pages | v4 | current |
| actions/deploy-pages | v4 | current |
| actions/upload-pages-artifact | v4 | current |
| softprops/action-gh-release | v2 | current |

`actions/checkout@v5` is GA but the `@v4` line keeps receiving
security updates. **No action needed** this session.

## Docker Base Images

| Dockerfile | Image | Status |
|---|---|---|
| backend/Dockerfile | `python:3.12-slim` | current stable (3.13 available; 3.12 LTS-equivalent) |
| frontend/Dockerfile | `node:24-slim` AS build | current LTS (active LTS) |
| frontend/Dockerfile | `nginx:alpine` | rolling tag |

No bumps needed. Python 3.13 is available but not promoted —
3.12 is the project's documented baseline (CLAUDE.md).

## Baseline test counts (pre-update)

- Backend: 1601 passed, 1 skipped
- Plugins (via `make test`): all green per most recent CI
- Frontend: 929 passed
- E2E: not run in this audit

## Recommended scope per phase

If user approves the low-risk batch, the proposed phasing:

**Phase 1 — Backend low-risk batch (1 commit)**
- `poetry update` for the 17 low-risk backend packages above.
- Verify: `make test-backend` green, mypy clean, ruff clean.

**Phase 2 — Frontend low-risk batch (1 commit)**
- `npm update` for vitest + @vitest/coverage-v8 (paired) + vite
  + xstate.
- Verify: `npx vitest run` green, tsc clean.

**Phase 3 — Plugin lock-only batch (1 commit)**
- `make lock-all-plugins` (existing target). Regenerates 10
  plugin lockfiles to pick up the patch transitives. No
  pyproject.toml edits.
- Verify: `make test-plugins` green.

**Phase 4 — Medium-risk per-package (3-5 commits)**
- One commit per medium-risk package, only after explicit
  user confirmation.
- Each commit verified independently.

**Phase 5 — High-risk: NONE** in this session. Each gets its own
backlog entry with the explicit trigger language.

**Phase 6 — Close-out**
- Audit report committed.
- 3-4 new backlog entries for the high-risk deferrals.
- Updated `dep-update-2026-05-12.md` "After action" appendix
  with the actual delta.

## Open questions for user confirmation

1. **Phase 1 scope (backend low-risk batch):** ship the 17
   packages as one `poetry update` commit? Or surgical per-
   category split (type-stubs / dev-tools / runtime patches)?

2. **Phase 2 scope (frontend low-risk):** ship vitest 4.1.5 →
   4.1.6 + vite 8.0.11 → 8.0.12 + xstate 5.31.0 → 5.31.1? Per
   the lessons-learned "Vitest major bump validates with
   `npm run build`" rule — patch bumps are typically clean but
   worth running build.

3. **Phase 3 scope (plugins lock-only):** approve
   `make lock-all-plugins` to refresh the 10 plugin lockfiles?
   This is the recurring drift the lessons-learned flagged;
   refreshing now keeps CI green per-plugin matrix.

4. **Phase 4 scope (medium-risk):** which of the 9 medium-risk
   bumps does user approve? Default suggestion: ship all 9
   sequentially with per-commit verification, defer any that
   surface real issues.

5. **High-risk deferrals (4):** confirm the 4 backlog items
   get filed (elevenlabs-v2 migration, mypy 2.x, cryptography
   48, starlette 1.0) with the trigger language documented
   above?

STOP after this report. User picks scope before any commit.

---

## After action — 2026-05-12

User confirmed A-E with refinements (per-phase verification,
specific medium-risk order, backlog-trigger language matching
COMMENTS-COUNT-PERF-01 pattern). Phase 1, 2, 4 shipped; Phase
3 deferred per surfaced finding. Phase 5 (high-risk) skipped
as planned. Total: **8 commits** shipped, **5 backlog entries**
filed, **2 lessons-learned rules** added.

### Phase 1 (backend low-risk batch) — SHIPPED

Commit ``b9c2456``. 15 of 17 audit packages updated.

| Package | Before | After |
|---|---|---|
| coverage | 7.13.5 | 7.14.0 |
| greenlet | 3.4.0 | 3.5.0 |
| idna | 3.13 | 3.15 |
| jedi | 0.19.2 | 0.20.0 |
| mako | 1.3.11 | 1.3.12 |
| matplotlib-inline | 0.2.1 | 0.2.2 |
| packaging | 26.1 | 26.2 |
| parso | 0.8.6 | 0.8.7 |
| pathspec | 1.1.0 | 1.1.1 |
| pymupdf | 1.27.2.2 | 1.27.2.3 |
| textual | 8.2.4 | 8.2.6 |
| traitlets | 5.14.3 | 5.15.0 |
| types-markdown | 3.10.2.20260408 | 3.10.2.20260508 |
| types-pyyaml | 6.0.12.20260408 | 6.0.12.20260510 |
| virtualenv | 21.2.4 | 21.3.2 |

Deferred:
- `pip` — Poetry-managed venv pip, inert for app code.
- `python-multipart 0.0.27 → 0.0.28` — needs paired bump of
  `bibliogon-plugin-medium-import` (also pins `^0.0.27`).
  Cross-surface conflict surfaced at the lock-resolution
  step. Filed as a separate follow-up note (not its own
  backlog item; will fold into a future plugin-paired bump
  pass when there's enough volume to justify a session).

Tests: 1601 passed / 1 skipped (identical to baseline).

### Phase 2 (frontend low-risk batch) — SHIPPED

Commit ``124f5f4``. 4 packages updated.

| Package | Before | After |
|---|---|---|
| vite | 8.0.11 | 8.0.12 |
| vitest | 4.1.5 | 4.1.6 |
| @vitest/coverage-v8 | 4.1.5 | 4.1.6 |
| xstate | 5.31.0 | 5.31.1 |

Verification per lessons-learned: vitest run (929 passed),
tsc clean, vite build clean (376ms; only pre-existing
INEFFECTIVE_DYNAMIC_IMPORT warning on eventRecorder.ts).

### Phase 3 (plugin lock refresh) — DEFERRED

`make lock-all-plugins` ran clean but produced **zero
diff**. Cause: the target uses `poetry lock` which
re-validates existing resolutions but doesn't refresh
transitives unless a pyproject changed. The user's
expectation ("the refresh should normally pull patch
transitives that align") was based on a stricter
`poetry update`-like behaviour.

Per-plugin `poetry update` (bare, no allowlist) on a
test plugin **pulled starlette 1.0.0** via FastAPI
0.136.1's relaxed upper bound — a high-risk-deferred
transitive surfacing from a low-risk direct bump. The
test plugin's lock was reverted immediately
(`git checkout` + `poetry install`).

Filed as P5 `PLUGIN-PYDANTIC-COORDINATED-BUMP-01` with
the allowlist constraint explicit
(`poetry update pydantic pydantic-core` per plugin, NOT
bare `poetry update`).

Also filed P5 BLOCKED `STARLETTE-V1-AWAIT-FASTAPI-01`
for the upstream FastAPI release that opens starlette
to >=1.0 as a forced upgrade.

### Phase 4 (medium-risk per-package) — 6 of 7 SHIPPED

User-specified order: urllib3 → requests → propcache →
wcwidth → click → markdown-it-py → mdit-py-plugins.

| # | Commit | Package | Before | After | Notes |
|---|---|---|---|---|---|
| 4.1 | c925b3d | urllib3 | 2.6.3 | 2.7.0 | clean |
| 4.2 | f1addac | requests | 2.33.1 | 2.34.0 | clean |
| 4.3 | 6ddebe8 | propcache | 0.4.1 | 0.5.2 | clean |
| 4.4 | 9f8fc43 | wcwidth | 0.6.0 | 0.7.0 | clean |
| 4.5 | — | click | 8.1.8 | (no change) | BLOCKED by gtts ≥7.1,<8.2 upstream pin; filed CLICK-V8-3-AWAIT-GTTS-01 (P5 BLOCKED) |
| 4.6 | 22d0a19 | markdown-it-py | 4.0.0 | 4.2.0 | clean |
| 4.7 | 11093ee | mdit-py-plugins | 0.5.0 | 0.6.1 | clean |

Per-commit verification (every commit, every package):
- `pytest -q`: 1601 passed / 1 skipped (identical
  baseline, no regressions across 6 commits)
- `mypy app/`: 0 issues / 96 files
- `ruff check app/`: clean

### Phase 5 (high-risk) — NOT SHIPPED (as planned)

5 backlog entries filed instead:

| Item | P | Status | Trigger |
|---|---|---|---|
| **ELEVENLABS** | DEP-05 (existing) | BLOCKED | Schedule dedicated audiobook test session with live ElevenLabs key. **Duplicate** of the audit's proposed `ELEVENLABS-SDK-V2-MIGRATION-01` — DEP-05 already covers it. |
| **CRYPTOGRAPHY-V48-MIGRATION-01** | P3 | open | any CVE in 46.x OR pair with `pip audit` security review |
| **MYPY-V2-MIGRATION-01** | P4 | open | mypy 1.x EOL OR ~6 months latency pressure |
| **STARLETTE-V1-AWAIT-FASTAPI-01** | P5 | BLOCKED | FastAPI ships release pinning `starlette = ">=1.0"` (forced upgrade, not just relaxed upper bound) |
| **PLUGIN-PYDANTIC-COORDINATED-BUMP-01** | P5 | open | plugin CI fails OR backend needs pydantic 2.13+ API plugins also need OR coordinated bump session |
| **CLICK-V8-3-AWAIT-GTTS-01** | P5 | BLOCKED | gtts opens click upper bound past `<8.2` |

### Net session impact

- Backend installed-version movements: 15 (Phase 1) + 6
  (Phase 4) = **21 packages** updated.
- Frontend installed-version movements: **4 packages**
  updated.
- Tests stayed green throughout: backend 1601 / frontend
  929 / mypy + ruff clean.
- 5 backlog entries with explicit trigger language.
- 2 lessons-learned rules captured (poetry update vs
  lock semantics; transitive deps surfacing high-risk
  packages from low-risk direct bumps).

### Why no pyproject.toml changes shipped

User-raised question during close-out: "I noticed only
``poetry.lock`` was updated. Shouldn't ``pyproject.toml``
also be updated?"

Answer: no, **none of the 21 packages bumped this session
are direct dependencies in any ``pyproject.toml``**. They
are all transitive deps (constrained only by their
upstream importers, not by Bibliogon's pyproject).

Quick taxonomy:

- **Transitive dep**: ``urllib3``, ``requests``,
  ``propcache``, ``wcwidth``, ``markdown-it-py``,
  ``mdit-py-plugins``, ``coverage``, ``greenlet``,
  ``idna``, ``jedi``, ``mako``, ``matplotlib-inline``,
  ``packaging``, ``parso``, ``pathspec``, ``pymupdf``,
  ``textual``, ``traitlets``, ``virtualenv``. Pin
  ranges live in upstream packages (e.g. fastapi's
  starlette range, requests's urllib3 range).
  ``poetry update <pkg>`` only touches the lockfile.
- **Direct dep, new version inside caret range**:
  ``types-pyyaml ^6.0.12.20250915`` → 6.0.12.20260510
  (date-versions are numeric patches inside the
  caret). Lockfile-only.
- **Direct dep, new version past caret range**:
  ``python-multipart ^0.0.27`` → 0.0.28 (caret on
  0.0.x is exact). Requires pyproject pin bump.
  Attempted in Phase 1; surfaced a cross-surface
  conflict because the medium-import plugin pins the
  same package; reverted; queued for a paired-bump
  session.

This is the modern Poetry split: ``pyproject.toml``
declares allowed ranges, ``poetry.lock`` records exact
installed versions. Bumping within a range is
lockfile-only; bumping past a range requires the
pyproject pin to widen (which is what would be
required for the 4 deferred high-risk items
``mypy 1.x → 2.x``, ``cryptography 46 → 48``,
``elevenlabs 0.2.x → 2.x``, ``starlette 0.46 → 1.0``).

### Verification of the recurring "two installation paths" finding

The lessons-learned rule "Two installation paths diverge:
`make test` vs per-plugin CI" was *re-validated* this
session. Phase 1 (backend pyproject change to
`python-multipart`) failed at the lock-resolution step
because `bibliogon-plugin-medium-import` pins the same
package tighter. The CI per-plugin matrix would have
red-lined had this shipped. The discipline of
"`make test` ≠ per-plugin CI" continues to pay off —
catching the conflict at lock-time is cheaper than
catching it at CI time.
