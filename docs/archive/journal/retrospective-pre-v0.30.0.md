# Retrospective: pre-v0.30.0

Period: v0.27.0 (2026-05-06) → HEAD (2026-05-07)
Generated: 2026-05-07
Author: Claude Code

The period covers four calendar days, three tagged releases (v0.27.0, v0.28.0, v0.29.0), and 48 commits on `main`. v0.30.0 will be the next release tag and is the trigger for this retro: the post-tag-but-pre-release window is the right time to look back, not after another release locks the period in.

## What shipped

| Theme | Concrete delivery | Reference | Effort |
|-------|-------------------|-----------|--------|
| Versioning + release | v0.27.0 + v0.28.0 + v0.29.0 cut on three consecutive days; lock-step propagation via `make sync-versions` for each | `5520439`, `6073593`, `4a48263` | M (per release) |
| Test isolation + fs safety | DEP-DBPATH-01 cycle: warning (v0.27.0) → precedence flip (v0.28.0) → full removal (HEAD) | `7595ee4`, `f1b3a51` | S each; full cycle = M |
| Bulk export | Articles bulk-export shipped v0.27.0; books bulk-export shipped v0.28.0 with parity to articles + 200-book hard limit + ZIP-only by design | `ae76e12`, `ca83e8f` | M |
| Launcher first-run UX + i18n | Welcome dialog + Docker-missing flow + Settings language picker (v0.27.0) → full English-dialog extraction (v0.28.0) → 6 new languages (el / fr / es / pt-pending / tr-pending / ja-pending) + parity tests + REVIEW_STATUS.md (HEAD) | `38af8a1`, `3840832..fc1859c` | L |
| Cross-platform installer | `install.command` (macOS Finder), `install.ps1` (PowerShell mirror), `install.cmd` (Windows double-click) | `2b45654` | M |
| Documentation refresh | Drift sweep for v0.29.0 state; README-de umlaut sweep; 5 new bilingual help pages (books bulk-export, cross-platform installers, architecture, contributing, deployment, api-reference); plugin dev guide refreshed for Vite 8 | `ee2de75..7c30e0e` | L |
| Audit cleanup (P1) | 5 P1 violations of `code-hygiene.md` / `architecture.md` closed: 3 native `confirm()` → `useDialog`, 2 bare `fetch` → `api.ai.testConnection()` | `5e37d3d..d1e4bbf` | M |
| Vite 8 + uuid security | Vite 7 → 8 (DEP-09) + vite-plugin-pwa 0.21 → 1.3 (SEC-01); `uuid ^11.1.1` clearing `GHSA-w5hq-g745-h8pq` | `93a5ed3`, `5671cde` | M |
| Toolchain alignment | `@types/node` ^22 → ^24 + tsconfig `target/lib` ES2020 → ES2022 cascade | `330ba69` | S |
| Pre-v0.30.0 dep sweep | fastapi 0.135 → 0.136 (lock-step backend + 10 plugins), uvicorn 0.44 → 0.46, python-multipart 0.0.26 → 0.0.27, ruamel-yaml 0.18 → 0.19, in-range patches via `npm update` and `poetry update` | `a7cee7d`, `0a9cfd3`, `08a47ab` | S |
| EL/ES/FR i18n self-validation | 4 register / idiom corrections after user review: 2 EL (containers → κοντέινερ; φυλλομετρητής → πρόγραμμα περιήγησης), 1 FR (`Compris, continuer` → `J'ai compris`), 1 ES (`Internet` → `internet`) | `fcc8a2a` | S |
| Code-signing decision | Cross-platform installer scripts ship **unsigned** per documented launch decision; Gatekeeper / SmartScreen warnings spelled out in user docs (en + de) | `f211e02` | S |

Test count trajectory: backend 1278 → 1299 (+21), frontend 688 → 712 (+24), launcher 147 → 196 (+49), Playwright smoke 188 → ~191. 117 new tests across the period; suite still runs in ~70 s for backend, ~4 s for vitest, ~7 s for launcher.

## What worked

### Pre-inspection report → STOP gate → implementation

Concrete instance: the docs+i18n session prompt explicitly required a pre-inspection report before any code change. The report surfaced a critical issue (`_current_lang()` only resolved de/en, not the 8 declared languages) before any per-language catalog landed. Without the pre-inspection, the per-language commits would have shipped catalogs that the OS-locale resolver could not actually pick up.
Why it worked: the report is a standalone artifact (a markdown table per audited area, with a STOP gate). The user reads it, confirms scope, then implementation begins. The STOP gate makes the pre-flight findings load-bearing rather than advisory.

### Lock-step propagation by tooling, not checklists

Concrete instance: every release in the period (v0.27.0, v0.28.0, v0.29.0) used `make sync-versions` to propagate `backend/pyproject.toml` to 14 other version-bearing files. `make sync-versions-check` + `verify_version_pins.sh <version>` ran clean before each tag. Zero version drift between subsystems shipped — the `2026-05-04 v0.26.0..v0.26.3 hotfix cluster` (immediately pre-period) burned four point releases on mechanical CI gates that this discipline would have caught earlier.
Why it worked: the rule is "do not hand-edit any version field except `backend/pyproject.toml`" and the tool's output diff is self-evidently correct. Verify-script regression detectors (no hardcoded `__version__` outside `_build_info`, no resurrected `COMPATIBLE_VERSION`, etc.) catch new literals at PR time, not release time.

### Pattern reuse: articles bulk → books bulk

Concrete instance: AR-BULK-BOOKS-PARITY-01 (commit `ae76e12`) shipped books bulk export by mirroring the articles bulk-export shape decided in v0.27.0. Frontend `BookBulkActionBar.tsx` mirrors `ArticleBulkActionBar.tsx`; backend `plugins/bibliogon-plugin-export/bibliogon_export/routes.py:bulk_router` mirrors `app/routers/article_bulk_export.py:router`. The deliberate scope deltas (3 formats vs 4, ZIP-only vs ZIP-or-combined, no series filter) are documented inline in the route source so a future maintainer reads the divergence rationale next to the code.
Why it worked: the second instance of the same pattern surfaces the genuine vs accidental differences. The decision to NOT add combined-multi-book mode for books has the rationale captured at the call site, not in a separate doc that drifts.

### Per-language commits in i18n work

Concrete instance: ST13 through ST18 in the docs+i18n session (`77a29ef..10a7b09`) shipped one language per commit, atomically revertable. When the JA commit (`10a7b09`) broke an existing test (`test_unknown_locale_falls_back_to_en` was using "ja" as a sentinel for "unknown language"), the fix landed in the same commit alongside the catalog rather than as a follow-up. Every commit in the run was independently green.
Why it worked: the per-language atomic-revertability isolates risk. If TR turned out to need a fundamental rework, only the TR commit gets reverted, not the whole 6-language run.

### Sentinel + warning, not silent fallback

Concrete instance: DEP-DBPATH-01 step 3 (`f1b3a51`) removes `BIBLIOGON_DB_PATH` as a path override but keeps a warning that names the ignored value at startup. Users with the var still in env get an explicit signal that their DB has moved, not a silent fallback to the platformdirs default. The warning will be removed in a later release once existing deployments have migrated.
Why it worked: silent state changes are the enemy of trust in deprecation cycles. The "warning-only-no-effect" middle step is friendlier than either "still works invisibly" (step 1) or "hard-fail" (step N+2).

## What struggled

### `ja` test sentinel collision

A pre-existing test (`test_unknown_locale_falls_back_to_en`) used the literal string `"ja"` as a placeholder for "unknown language that should fall back to en". When the launcher gained a real Japanese catalog in commit `10a7b09`, the test failed in CI on the same commit. The fix was mechanical (swap the sentinel to `"zh"` with a comment explaining the swap) but the failure was a sequencing accident — the per-language commits were running cleanly until the one that happened to alias the sentinel. Sentinel choice is a documented anti-pattern in test design ("don't use realistic-looking values as sentinels"); this was an instance of it. The fix-in-place was the right call, but a future-proof sentinel like `"xx"` or `"???"` would have avoided the collision entirely.

### `mkdocs build --strict` does not fail on orphan pages

`mkdocs build --strict` exits 0 even when the build log includes "The following pages exist in the docs directory, but are not included in the nav configuration." That's an INFO-level message, not a WARNING, so `--strict` ignores it. Two pages (`articles/bulk-export.md` and `install/docker-desktop.md`) sat orphan in the public docs site for the v0.27.0 and v0.28.0 release cycles before the docs+i18n drift audit caught them. The tracking pattern works (`docs/help/_meta.yaml` lists the page; `mkdocs.yml` nav does not) but the gate that should have flagged the divergence does not. v0.30.0 will not fix this, but the gap is a real friction point.

### Hunting the books-bulk-export route

Building the books bulk-export help page (`b63e7d4`) required finding the actual route shape. The first 4 greps for `bulk-export` in `backend/app/routers/` returned nothing; the 5th grep widened to `plugins/` and found it at `plugins/bibliogon-plugin-export/bibliogon_export/routes.py:815`. The route lives in a plugin (correctly per the architecture rule "everything else via plugins") but the search-friction shape is real: a contributor reading "the books endpoint" naturally looks under `backend/app/routers/`. No fix is warranted (the architecture is right) but the friction is documented evidence that plugin-owned endpoints need a discovery aid — perhaps a comment in `backend/app/routers/books.py` listing the plugin-owned sibling routes.

### `discover_unknown_umlauts.py` heuristic noise

The German content sweep workflow flags any token containing `ae|oe|ue|Ae|Oe|Ue` outside code regions as a potential ASCII transliteration. The script's `KNOWN_WORDS` map covers ~400 entries; the `NOT_TRANSLITERATIONS` allowlist covers ~30 valid German words flagged as suspicious. Every new bilingual help page in the docs+i18n session added 1-6 new false positives (`Massen`, `wessen`, `beisteuert`, `Zertifizierungsstelle`, `meinungsstark`, `Produktionssetup`, `quer`, `Kurzfassung`, `Konsequenzen`, etc.) that needed allowlisting. The workflow handled it cleanly but the heuristic noise is real cost — each new DE prose page adds ~5 minutes of triage. A morphological-stem-based heuristic instead of substring-match would catch fewer false positives, but the cost / benefit tradeoff has not been worked.

### Pillow version drift between backend and launcher

`backend/pyproject.toml` is at `pillow ^12.0.0`; `launcher/pyproject.toml` is at `pillow ^11.2.1`. The launcher uses pillow only for icon-generation at build time (PyInstaller-bundled, separate venv) so the drift is functionally harmless. But it's an instance of "two subsystems pin the same external dep at different majors" without an explicit rationale captured in a doc. The pre-v0.30.0 dep sweep flagged this and deferred per the major-bumps-get-their-own-session rule, but the drift was already present before the sweep audit caught it. A regression detector for shared-external-dep pin alignment would catch new drifts faster than a manual audit.

### TipTap 3 wait, third release

DEP-02 has been BLOCKED for the entire period. v0.27, v0.28, v0.29 all shipped without addressing it, and v0.30.0 will be the fourth release that doesn't touch it. The upstream npm publish trigger has not fired. Path B (the `prosemirror-search` adapter, ~50-80 LOC) is on the table but not yet authorized. The wait is correct — Path A is zero-effort; Path B builds debt that vanishes the moment Path A unblocks — but the indefinite-wait pattern is its own friction. At some point (next re-audit 2026-06-02) the cost of waiting dominates the cost of shipping Path B.

## What changed in approach

### "Single conceptual change → single session" as default framing

The hotfix cluster `v0.26.0..v0.26.3` (immediately pre-period) was four point releases that each tried to fix one mechanical CI gate. The lessons-learned response was the **MANDATORY pre-tag verify chain** (`make test`, `tsc`, `vitest`, `playwright smoke`, `ruff`, `mypy`, `pre-commit run --all-files`, `pyinstaller spec --clean`). Every release in this period followed the chain. Zero CI-gate hotfix-cluster regressions occurred. The discipline is sticking.

### Pre-inspection reports moved from inline-in-chat to standalone artifacts

The docs+i18n session report (8 sections, ~1500 words) was delivered as a markdown report with a STOP gate before any code change. Same pattern for the EL/ES/FR self-validation sample (delivered to `/tmp/i18n-validation-sample.md`). The artifact-style pre-inspection makes scope decisions reviewable independently of the implementation conversation. Inline-in-chat pre-inspections worked for small scopes but scaled poorly for the 21-commit docs+i18n session.

### Continuous archival, in step with the closing commit

Every session in this period closed its `[x]` items into `docs/roadmap-archive/2026-05.md` in the same commit (or the immediately-following docs commit) that closed the work. The archive file gained five distinct "Archived 2026-05-07" sections during the period (one per session). The discipline is friction-light because `scripts/archive_completed_task.py` exists, but the bigger driver is the post-commit habit: writing the archive entry while the work context is still in head.

### Bilingual i18n pattern with native-speaker review markers

The v0.30.0 launcher catalogs ship pt / tr / ja with explicit `_meta.review_status: "pending native speaker"` blocks. The pattern is a deliberate response to the trade-off between "block on outreach" (slow, blocks 5 already-validated languages) and "ship anyway" (silent quality drop). The marker is machine-enforced by parity tests (`test_pending_review_catalogs_carry_marker`, `test_user_validated_catalogs_have_no_meta_marker`), human-readable in `REVIEW_STATUS.md`, and zero-impact on runtime (the marker is a top-level dict that `i18n.t()` ignores). The same pattern is applicable to any future trust-but-flag situation.

## Open patterns to watch

### TipTap 3 timeline (next re-audit 2026-06-02)

The wait has gone on for 4 calendar days within the period and predates v0.27.0. If the upstream npm publish has not happened by the next monthly check-blockers run, the cost of building Path B starts to look reasonable. Threshold: if 2026-06-02 still shows BLOCKED, surface Path B as an explicit decision point in the v0.31.0 planning conversation rather than continuing to wait by default. Who notices first: `make check-blockers` cron run.

### Native-speaker review timeline for TR / PT / JA

The `_meta.review_status` markers shipped on 2026-05-07. Native-speaker outreach is a separate process the user owns (per Q5 in the launcher i18n session). No specific deadline. Threshold: if no native-speaker corrections have landed by 2026-08-07 (3 months), surface as either "drop the marker (accept as canonical)" or "continue waiting" — neither is wrong, but the indefinite-marker-with-no-action state should not be unlimited. Who notices first: the user, or a monthly backlog review.

### Test suite growth rate vs. duration

117 new tests landed in 4 days. The backend suite still runs in ~70 s; vitest in ~4 s; launcher in ~7 s; smoke Playwright suite around 2.5 min. Threshold: if backend `make test` exceeds 120 s or vitest exceeds 10 s, time to look at slow tests + parallelization. Who notices first: `make test` runtime in the pre-tag verify chain.

### `mkdocs --strict` orphan-page gate gap

Two orphan pages slipped past `--strict` for two release cycles before the docs+i18n drift audit caught them. Threshold: if any future docs orphan persists past one release cycle, the workflow needs a hook that grep-fails on the INFO-level "not included in nav" message in the build log. Who notices first: the next docs drift audit (manual; no automated trigger).

### Backlog growth vs. closure rate

The period closed 5+ P3/P4 items (Launcher localization, DEP-09, SEC-01, DEP-DBPATH-01 cycle, AR-BULK-BOOKS-PARITY-01) and added 1 (LAUNCHER-I18N-NATIVE-REVIEW-01). Net closure-positive. Threshold: if a future month sees ratio invert (more added than closed), flag in the next retro. Who notices first: backlog `Last updated` line and ROADMAP `Open tasks` count.

### Recently-bumped deps in this sweep

`ruamel-yaml 0.18 → 0.19`, `uvicorn 0.44 → 0.46`, `python-multipart 0.0.26 → 0.0.27` are the largest version-range moves in the pre-v0.30.0 sweep. All three are widely used internally (yaml_io, every uvicorn worker, every multipart upload). Threshold: any test failure or runtime warning that names one of these libraries in the next 1-2 releases should be triaged before it cascades. Who notices first: the next pre-tag verify chain run.

## Concrete commitments for v0.30.0+

### Pre-inspection-report-as-standalone-file stays the default

What: large multi-area sessions deliver a markdown pre-inspection report (file + STOP gate) before code changes. Inline-in-chat pre-inspections are reserved for small scopes (≤3 files, ≤1 commit).
Why: the docs+i18n session demonstrated that a 1500-word report with 8 sections is too big to thread through chat without losing the load-bearing decisions.
How enforced: prompt habit. The next "large scope" session prompt should explicitly ask for the file-and-STOP pattern by name.
Failure mode if abandoned: scope decisions get re-litigated mid-implementation, leading to half-built features that need rework.

### Sentinel-collision-resistant test values

What: tests using literal strings as sentinels for "unknown / not-supported / future" state should pick values that cannot become real values. Concretely: `"xx"`, `"zz"`, `"???"` for language codes, never real ISO codes that the project might one day support.
Why: the `ja` collision in commit `10a7b09` was a sequencing accident that broke an unrelated test in the middle of a 6-language run. Catching it required reading the failure context; the same shape is a future trap.
How enforced: ad-hoc; mention in `coding-standards.md` "Tests" section the next time the file is touched. Could be promoted to a ruff custom rule but the cost / benefit doesn't justify a custom plugin yet.
Failure mode if abandoned: the next wave of i18n / feature-flag / locale work will hit the same shape.

### Plugin-owned route discoverability comment

What: when a route lives in a plugin module rather than `backend/app/routers/`, add a single comment in the natural-search-target module pointing to the plugin route file. Concretely: `backend/app/routers/books.py` should have a comment near the top noting that `POST /api/books/bulk-export` lives in `plugins/bibliogon-plugin-export/bibliogon_export/routes.py`.
Why: hunting the books-bulk-export route during the docs+i18n session cost real time. The architecture is correct (plugin-owned), but the discovery aid is missing.
How enforced: do this in v0.30.0 as a tiny commit; document the convention in `architecture.md` "Backend / Plugins" section so future plugin-owned routes follow it.
Failure mode if abandoned: future contributors hit the same search friction; documentation pages get written without the route shape they should describe.

### `mkdocs --strict` orphan-page gate

What: extend the pre-tag verify chain (or the existing docs build step) to fail when `mkdocs build --strict` log contains "not included in the nav configuration" outside an explicit allowlist (currently `SCREENSHOTS-TODO.md`).
Why: orphan pages slipped past `--strict` for two release cycles. The discipline of "every help page goes in `_meta.yaml` AND `mkdocs.yml`" is correct but unenforced.
How enforced: a one-line `grep -v` filter on the mkdocs build output, exit non-zero on match. Add to the docs/build target.
Failure mode if abandoned: future contributors add help pages that show up in-app but not on the public docs site; the divergence accumulates.

### "Pre-release dep sweep" stays a discrete commit, not a release blocker

What: the dependency-currency sweep happens in dedicated commits (per-subsystem) ahead of the version-bump release commit. Major-bump deferrals are explicitly listed in the sweep commit message.
Why: the pre-v0.30.0 sweep landed in 3 clean commits (`a7cee7d`, `0a9cfd3`, `08a47ab`) with the deferral list inline. Each commit is independently revertable if a regression surfaces in the verify chain. Folding them into the release commit would couple "I want to roll back the new uvicorn" to "I want to roll back the release".
How enforced: continue the convention from this period. Document in `release-workflow.md` Step 4b ("Dependency currency check") that the sweep is a pre-release commit pattern, not a release-step substep.
Failure mode if abandoned: rollback granularity collapses; a single dep regression forces a release rollback.
