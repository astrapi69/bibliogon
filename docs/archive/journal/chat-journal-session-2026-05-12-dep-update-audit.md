# Session journal - 2026-05-12 - Dependency audit + phased update

## Context

After the recent feature wave (AI-Templates, Bulk-Delete,
Comments, Test-Infrastructure hardening), consolidation
pass to refresh what's safely updatable. Audit-First per
the spec: categorize before bumping, defer high-risk
without explicit approval.

## Audit findings (committed as docs/audits/dep-update-2026-05-12.md)

- 30 outdated backend (Poetry-level)
- 32 outdated frontend (npm) — 23 are TipTap 2→3 deferred
- 10 plugins, all drifted similarly (Pydantic 2.12.5 vs
  backend's 2.13.3)
- GHA actions + Docker base images all current
- 4 high-risk items required explicit user decision

## What shipped (8 commits)

| # | SHA | Phase | Scope |
|---|---|---|---|
| 1 | b9c2456 | 1 | Backend low-risk batch (15 packages) |
| 2 | 124f5f4 | 2 | Frontend low-risk batch (4 packages) |
| 3 | c925b3d | 4.1 | urllib3 2.6.3 → 2.7.0 |
| 4 | f1addac | 4.2 | requests 2.33.1 → 2.34.0 |
| 5 | 6ddebe8 | 4.3 | propcache 0.4.1 → 0.5.2 |
| 6 | 9f8fc43 | 4.4 | wcwidth 0.6.0 → 0.7.0 |
| 7 | 22d0a19 | 4.6 | markdown-it-py 4.0.0 → 4.2.0 |
| 8 | 11093ee | 4.7 | mdit-py-plugins 0.5.0 → 0.6.1 |

Plus the close-out commit with audit appendix + backlog +
lessons-learned + this journal.

## Surprises encountered

### 1. python-multipart cross-surface conflict (Phase 1)

Phase 1 attempted to bump `python-multipart ^0.0.27 → ^0.0.28`
in `backend/pyproject.toml`. Poetry's resolver refused:
`bibliogon-plugin-medium-import` pins the same package at
`^0.0.27`. Caret on 0.0.x is exact in Poetry semantics, so
the plugin's pin blocks the backend's bump until paired.

Reverted the pin change; Phase 1 shipped the other 15
without `python-multipart`. The conflict matches the
existing lessons-learned rule "Two installation paths
diverge: `make test` vs per-plugin CI" — backend +
per-plugin lockfile validation catches what a backend-only
test misses.

### 2. make lock-all-plugins is a no-op (Phase 3)

The target runs `poetry lock` per plugin. `poetry lock`
validates existing resolutions against pyproject specs; it
does NOT pull patch transitives. Since none of the 11
plugin pyprojects changed, all 11 locks stayed put. The
audit's stated goal (align plugin Pydantic versions with
backend) was not achieved by this target.

New lessons-learned rule "`poetry update` vs `poetry lock`
semantics" captures the distinction.

### 3. Bare `poetry update` pulls high-risk transitives

Pre-flighted `poetry update` (no allowlist) on a single
plugin (`bibliogon-plugin-help`) to validate the
plugin-Pydantic alignment approach. Result:

- ✅ pydantic 2.12.5 → 2.13.4 (wanted)
- ⚠️ fastapi 0.135.3 → 0.136.1 (in-range, fine)
- 🚨 **starlette 0.46.2 → 1.0.0** (explicitly
  audit-deferred high-risk!)

Cause: fastapi 0.136.1 relaxed its starlette upper bound.
A low-risk direct bump pulled the high-risk-deferred
package transitively. Reverted that plugin's lock
immediately (`git checkout` + `poetry install`).

New lessons-learned rule "Transitive deps can surface
high-risk packages from low-risk direct bumps" captures
the pattern + the pre-flight discipline that caught it.

### 4. click 8.1.8 → 8.3.3 blocked by gtts (Phase 4.5)

Phase 4 attempted click in the medium-risk batch. Poetry
refused to move it: gtts (Google Text-to-Speech, used by
the audiobook plugin) pins `click >=7.1,<8.2`. Can't move
past 8.1.x until upstream gtts relaxes its bound.

Filed P5 `CLICK-V8-3-AWAIT-GTTS-01` BLOCKED.

## Phase 5 — high-risk deferrals

5 new backlog entries (1 was redundant; existing DEP-05
already covers elevenlabs):

- **CRYPTOGRAPHY-V48-MIGRATION-01** (P3) — trigger: CVE OR
  pair with pip-audit security review
- **MYPY-V2-MIGRATION-01** (P4) — trigger: mypy 1.x EOL OR
  ~6mo latency pressure
- **STARLETTE-V1-AWAIT-FASTAPI-01** (P5 BLOCKED) — trigger:
  FastAPI pins `starlette ">=1.0"` as lower bound
- **PLUGIN-PYDANTIC-COORDINATED-BUMP-01** (P5) — trigger:
  plugin CI fails OR backend needs Pydantic 2.13+ API OR
  coordinated bump session
- **CLICK-V8-3-AWAIT-GTTS-01** (P5 BLOCKED) — trigger:
  gtts opens click upper bound

All with explicit COMMENTS-COUNT-PERF-01-style trigger
language.

## User-raised question + answer (documented in audit appendix)

> "I noticed only ``poetry.lock`` is updated. Shouldn't
> ``pyproject.toml`` also be updated?"

Answer: no, all 21 bumped packages are transitive deps
(constrained by upstream packages, not by Bibliogon's
pyproject). Direct deps would need pyproject bumps when
the new version exceeds the caret range. Two direct
deps got bumped (`types-pyyaml`, `types-markdown`) but
their new versions were already within the caret, so
only lockfile changed.

The 4 deferred high-risk items WOULD need pyproject pin
widening (e.g. `mypy = "^1.20.0"` → `^2.1.0`) when their
turn comes.

## Counts

| Metric | Before | After | Delta |
|---|---|---|---|
| Backend packages bumped | n/a | 21 | +21 lockfile |
| Frontend packages bumped | n/a | 4 | +4 lockfile |
| Backend tests | 1601 | 1601 | 0 (no regression) |
| Frontend tests | 929 | 929 | 0 |
| Backlog active items | 21 | 26 | +5 |
| Lessons-learned rules | (n) | n+2 | +2 |
| Test wall-time (backend) | ~131s | ~131-134s | within noise |

## Process refinements that worked

- **Easier-to-harder order** in Phase 4 (urllib3 → requests
  → propcache → wcwidth → click → markdown-it-py →
  mdit-py-plugins) built momentum and surfaced the click
  block at #5, not #1. By then the harness was warm.
- **Per-commit verification gate** caught zero regressions
  but provided high confidence. mypy + ruff + pytest at
  every step.
- **Pre-flighting on one plugin** caught the starlette 1.0
  transitive surfacing before bulk-applying. Cheap revert.

## Questions and assumptions

- **Assumption**: 5 backlog entries (not 6) is correct
  because ELEVENLABS is already covered by DEP-05.
  Verified by grep over the existing backlog.
- **Assumption**: the user's "if plugins still lag,
  surface as separate concern" framing accommodated
  Option B in Phase 3. Confirmed via the user's
  follow-up "Option B confirmed."
- **Parked**: python-multipart 0.0.27 → 0.0.28 coordinated
  backend + medium-import bump. Not its own backlog entry
  yet (low-value patch, fold into next paired-bump pass).

## Next sensible step

User decides. Open paths:

- **Audiobook session**: would unblock ELEVENLABS (DEP-05)
  and possibly CLICK (gtts upgrade as part of TTS
  refresh).
- **mypy 2.x session**: dedicated MYPY-V2-MIGRATION-01
  bump with classification of new errors.
- **Take a pause**: 30 lockfile-level updates in this
  session, no regressions; the consolidation is done.
