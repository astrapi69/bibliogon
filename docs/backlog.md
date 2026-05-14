# Bibliogon Backlog

Last updated: 2026-05-12 (Dependency audit + phased update landed: audit at docs/audits/dep-update-2026-05-12.md. Phases 1+2+4 shipped (8 commits): 15 backend low-risk patches + 4 frontend patches + 6 of 7 medium-risk packages. Phase 3 surfaced make lock-all-plugins is a no-op without pyproject changes; deferred plugin Pydantic alignment as PLUGIN-PYDANTIC-COORDINATED-BUMP-01 (P5). click 8.1.8 -> 8.3.3 blocked by gtts <8.2 upstream pin; filed as CLICK-V8-3-AWAIT-GTTS-01 (P5 BLOCKED). python-multipart 0.0.27 -> 0.0.28 needs paired plugin bump (medium-import also pins ^0.0.27); deferred. Net 5 new backlog entries: CRYPTOGRAPHY-V48-MIGRATION-01 (P3), MYPY-V2-MIGRATION-01 (P4), STARLETTE-V1-AWAIT-FASTAPI-01 (P5 BLOCKED), PLUGIN-PYDANTIC-COORDINATED-BUMP-01 (P5), CLICK-V8-3-AWAIT-GTTS-01 (P5 BLOCKED). ELEVENLABS 0.2.27 -> 2.x already covered by existing DEP-05.)
Current version: v0.30.0
Open tasks: 27 active (P2..P5) + 2 BLOCKED-on-upstream pointers
Archive: [docs/roadmap-archive/backlog-recently-closed-2026-05-02.md](roadmap-archive/backlog-recently-closed-2026-05-02.md)

Living backlog. Daily-planning view of ROADMAP work. ROADMAP stays
the canonical theme tracker; this file is forward-looking only.

This file lists ONLY open tasks. Closed tasks live in the archive
files; do not re-add closed entries here. If a closed task needs
to come back, create a new ID.

Tasks are sorted by priority tier (P0 most urgent, P5 most
speculative). BLOCKED-on-upstream pointers + non-task waiting
items live in their own section between P5 and the archive link.
Within each tier, smaller-scope and unblocking items come first,
with alphabetical-by-ID as final tiebreaker.

The 5 entries in "ROADMAP cross-reference" below are pointers to
ROADMAP entries; their canonical description lives there. The
backlog is a working list of pointers, not a duplicate definition
store.

---

## ROADMAP cross-reference (curated planning view)

- **AR-01 validation log** — see ROADMAP > P3.
- **DEP-02** (TipTap 3) — see ROADMAP > Blocked / Upstream Wait.
- **DEP-05** (elevenlabs 2.x) — see ROADMAP > Blocked / Upstream Wait.

---

## P0 - Deadline / Blocker / Security

(none)

---

## P1 - Architecture / Hygiene Debt

(none)

---

## P2 - High-Value User Features

- **MEDIUM-IMPORT-V2-01**: dry-run preview UI before bulk import.
  v1 (shipped 2026-05-08) imports every `posts/*.html` from a
  Medium archive in one pass; the user archives unwanted articles
  post-import via the standard dashboard trash flow. v2 should
  show a per-post table (title / date / language / canonical URL)
  with checkboxes so the user can deselect specific posts
  pre-import. Effort: M (frontend table + plumb selection through
  the existing `import_zip` orchestrator). Trigger: first user
  report that the post-import archive flow is too tedious for
  archives with many junk drafts.

- **ASYNC-IMPORT-PROGRESS-01**: real server-side progress for the
  Medium-import flow. The current frontend shows determinate
  progress for the upload phase (XHR `upload.onprogress`), then an
  indeterminate spinner for the server-processing phase because
  the backend endpoint (`POST /api/medium-import/import`) is
  synchronous. For a 200+ post archive with image downloads the
  spinner can run for several minutes. v2 should switch the
  endpoint to the existing async-job pattern (cf. plugin-export
  `/export/async/`) with SSE streaming `chapter_done`-style events
  per imported post. Effort: M (backend job-store integration +
  frontend EventSource subscriber, similar shape to
  AudioExportProgress). Trigger: first user complaint about the
  indeterminate phase, OR when archive sizes routinely exceed 60s
  processing.

- **MEDIUM-IMPORT-V2-02**: AI tag inference for imported articles.
  Medium's HTML export strips tags. v1 imports articles with an
  empty tag list and the user adds them manually. v2 should call
  the existing `backend/app/ai/` core module per imported article
  with title + first paragraph + body excerpt and propose 3-5
  tags, surfaced for review in the dry-run table from v01. Effort:
  S-M depending on tag-quality bar. Trigger: first user report
  asking for it OR v01 ships and the manual-tagging step is a
  visible bottleneck in feedback.

---

## P3 - Infrastructure / Quality

- **I18N-NATIVE-REVIEW-V031-01**: native-speaker review for the
  three v0.31.0 namespaces (``ai_template``, ``bulk_ai_fill``,
  ``comments``) that ship passthru-English in es / fr / el / pt /
  tr / ja. Each affected catalog carries a top-level ``_meta:``
  block with ``review_status``, ``translator``,
  ``translation_date``, ``reference_lang``, and the explicit
  ``pending_namespaces`` list.
  ``backend/config/i18n/REVIEW_STATUS.md`` documents the
  per-language status and the PR-based correction submission
  flow (parallel to the v0.30.0 launcher precedent in
  ``launcher/bibliogon_launcher/locales/REVIEW_STATUS.md``).
  Trigger: native-speaker contact for any of the six pending
  languages, OR pair with LAUNCHER-I18N-NATIVE-REVIEW-01's
  reviewer outreach.
  Filed by D3 pre-release UX audit 2026-05-12.

- **MUTMUT-OVERRIDES-COERCION-COVERAGE-01** (P5): add 5–10
  targeted unit tests for the bool-coercion paths in
  ``app/import_plugins/overrides.py``
  (``_allow_books_without_author_from_yaml``) to pin the
  ~30 mutmut survivors mutmut_5..34. The function reads a
  single bool flag with permissive coercion; current tests
  pin only the strict ``True`` / ``False`` cases. Effort: S
  (~30 min). Trigger: next time ``overrides.py`` changes
  for any reason. Filed by mutmut 2026-05-14 first run.

- **MUTMUT-HANDLERS-OFFICE-WBT-COVERAGE-01** (P5): triage
  the ``handlers.office`` + ``handlers.wbt`` mutmut
  survivor pools (~375 combined) and decide which are real
  test gaps vs. cosmetic-mutation noise. The 60%
  acceptance bar for ``app/import_plugins/`` is already
  met at 77.8%; this is a "raise the floor" investment.
  Effort: M. Filed by mutmut 2026-05-14 first run.

- **MUTMUT-EXPAND-SCOPE-01** (P5): once the
  ``app/import_plugins/`` triage is complete, broaden
  ``[tool.mutmut] paths_to_mutate`` to ``app/services/``
  (next-most-critical per
  ``.claude/rules/quality-checks.md``). The 2026-05-14
  full-``app/`` attempt OOM-killed the dev machine, so
  scope-narrowing stays the default; expansion is a
  deliberate audit. Effort: M. Filed by mutmut 2026-05-14
  first run.

- **BIBLIOGON-DATA-FIX-FRAMEWORK-01**: refactor the six
  one-shot retro-fix scripts under `scripts/` into a generic
  framework. Existing scripts:
  `fix_medium_import_image_nodes.py`,
  `fix_medium_import_featured_images.py`,
  `fix_medium_import_truncation.py`,
  `fix_medium_import_language.py`,
  `fix_medium_import_seo.py`.
  They share a common shape:
  scope query (Article join ArticleImportSource), per-row
  predicate, per-row mutation, dry-run vs --apply, idempotent
  re-run reports zero changes. The same pattern is the
  obvious target for any future Bibliogon data-fix work
  (book imports, asset migrations, etc.). Effort: M (extract
  base class + per-fix subclass + tests). Defer until a
  fifth one-shot is needed; ship the four as one-shots first
  so the abstraction is informed by real cases. Trigger: 5th
  one-shot OR a new contributor needs to write one.

- **D-06-VALIDATION-01**: fresh-machine validation of the
  v0.28.0 cross-platform installer scripts (`install.command`,
  `install.ps1`, `install.cmd`). The scripts shipped unsigned
  per launch decision and were not exercised on a fresh macOS
  user account or fresh Windows 11 install before tagging.
  Trigger: first user report OR access to a clean test machine.
  Effort: S (run each wrapper, capture any Gatekeeper /
  SmartScreen / ExecutionPolicy edge cases). Folds into the
  next point release.

- **PGS-05-FU-01**: real-world unified-commit failure-mode tuning
  (only one of two subsystems active, partial-failure UX). Effort
  S; trigger by user report.

- **AR-BULK-SERIES-HIERARCHY-01**: parent/child series for the
  bulk-export filter. The 2026-05-06 bulk-export ship landed
  series as a flat free-string field on Article (mirrors
  `Book.series`). Hierarchical series ("Cosmos > Astrophysics >
  Stars") was deferred because no user has asked for it and a
  Series model + M2M migration is a multi-session investment.
  Trigger: first concrete user request for sub-series. Effort:
  1-2 sessions for the model + migration + filter UI nesting.
  See `docs/help/{en,de}/articles/bulk-export.md` "Series" note.

- **I18N-DIACRITICS-01**: auto-translated non-DE i18n YAMLs (es,
  pt, tr, possibly fr) ship with inconsistent diacritic coverage —
  some entries use proper Unicode (`géneros`, `Décroissant`,
  `gêneros`), others ASCII-substitute (`Titulo`, `Baslik`). Found
  in Test Phase Session 3 (2026-04-28) cross-language audit while
  fixing DE umlauts. Severity: Medium (readable but inconsistent +
  non-native). Effort: M per language. Cause: `AUTO_TRANSLATED.md`
  banner in `backend/config/i18n/` indicates DeepL/LMStudio passes
  with mixed quality. Fix: re-run translation with current DE
  source as canonical (DE was just cleaned up of all ASCII
  substitutes), human-review each for native diacritic use. Defer
  until DE i18n stable + a native speaker is available per
  language for review.


---

## P4 - Roadmap / Future Phases

- **MYPY-V2-MIGRATION-01**: bump ``mypy`` from 1.20.2 to
  2.x. Major bump of the type checker. mypy 2.0 changed
  several inference defaults and dropped legacy
  behaviours; Bibliogon's existing
  ``[tool.mypy.overrides]`` blocks in ``backend/pyproject.toml``
  + the test-infrastructure-audit-added CI gate
  (``lint-and-type-check`` job) mean a 2.x bump that
  surfaces new errors would red-line CI immediately.
  Effort: M (re-run mypy, classify new errors, add
  overrides or fix source). Trigger: mypy 1.x reaches
  end-of-life status, OR ~6 months of latency pressure.
  Filed by dep-update audit 2026-05-12.

- **D-07**: Phase 2 follow-up — package-manager discoverability.
  After D-06 ships, submit a winget manifest to
  `microsoft/winget-pkgs` and create a Homebrew tap at
  `astrapi69/homebrew-bibliogon`. Effort: ~2 hours of
  implementation, plus reviewer latency (winget-pkgs PR review
  can take days to weeks; do NOT couple to D-06 release timing).
  Trigger: D-06 shipped + first real user feedback to confirm
  the wrappers actually work in the wild. Per discovery report,
  this expands discovery surface meaningfully without changing
  the underlying install path. See
  [docs/explorations/installer-discovery-report.md](explorations/installer-discovery-report.md).

- **AR-BULK-CROSSPAGE-SELECT-01**: cross-page Select-all for the
  bulk-export workflow. Articles dashboard does not paginate
  today, so "Select all = current page" is moot. When pagination
  lands (or articles count grows past comfortable scroll), Select-
  all needs to either select every filtered row across pages or
  surface an "X of N visible; select all N?" affordance. Effort:
  S once pagination exists. Trigger: pagination landing OR article
  counts complaint.

- **LAUNCHER-SELFREPLACE-01**: launcher binary self-replace.
  Currently the pre-install stale-target safeguard tells the
  user "download a newer launcher manually" and opens the
  GitHub release page. A real self-replace mechanism (download
  new binary, atomic replace, relaunch) would close that loop.
  Windows non-trivial: a running binary cannot replace itself
  directly; needs a helper script (e.g. spawn a `cmd.exe`
  background that waits for parent exit, copies new binary
  over old, relaunches). Linux/macOS simpler (`rename` + exec).
  Effort: 1-2 sessions. Defer: no concrete user demand and
  current safeguard already protects against installing a
  stale Bibliogon.

(D-05 closed as won't-fix 2026-05-05; archived in
[docs/roadmap-archive/2026-05.md](roadmap-archive/2026-05.md).)

---

## P5 - Speculative / Nice-to-have

- **STARLETTE-V1-AWAIT-FASTAPI-01** (BLOCKED, upstream):
  bump ``starlette`` from 0.46.2 to 1.0.0 across the
  backend + 11 plugins. Blocked on FastAPI shipping a
  release whose upper-bound for starlette opens to
  ``>=1.0``. Surfaced during the dep-update audit
  2026-05-12 Phase 3: ``poetry update`` (bare) on a
  plugin pulled starlette 1.0.0 because fastapi 0.136.1
  apparently relaxed its starlette range. We reverted
  that plugin's lock; the starlette 1.0 upgrade is a
  cross-surface coordinated bump (FastAPI + Starlette +
  all 11 plugins + backend, all at once) and should not
  ship piecemeal. Trigger: FastAPI ships a release that
  pins ``starlette = ">=1.0"`` as its lower bound (not
  just relaxes the upper bound), making the bump a
  forced upgrade. Filed by dep-update audit 2026-05-12.

- **PLUGIN-PYDANTIC-COORDINATED-BUMP-01**: realign
  plugin Pydantic versions with the backend. Audit
  2026-05-12 found 9 of 11 plugins still at pydantic
  2.12.5 while backend is at 2.13.3 (now 2.13.4 after
  the medium-import plugin's lock got re-resolved
  during the audit). Not a runtime conflict (both 2.x
  compatible), just a "plugins lag backend" doc
  finding. The naive fix (``make lock-all-plugins``)
  is a no-op when nothing in plugin pyprojects
  changed; ``poetry update`` (bare) per plugin pulls
  the latest pydantic BUT also surfaces high-risk
  transitives like starlette 1.0 via fastapi 0.136.1.
  Mandatory: per-plugin ``poetry update pydantic
  pydantic-core`` (allowlist subset, NOT bare). 11
  plugins × 2 packages = 11 commits or one bundled
  commit. Trigger: ANY of (a) plugin CI fails due to
  pydantic version drift, (b) a backend feature needs
  a pydantic 2.13+ API that plugins also need, (c) a
  coordinated dep-update session is planned (where
  starlette + FastAPI + Pydantic bump together as a
  unit). Filed by dep-update audit 2026-05-12 Phase 3.

- **CLICK-V8-3-AWAIT-GTTS-01** (BLOCKED, upstream):
  bump ``click`` from 8.1.8 to 8.3.3 in the backend
  (and transitively across plugins). Blocked on gtts
  (Google Text-to-Speech) opening its pin
  ``click >=7.1,<8.2``. Used by the audiobook plugin's
  TTS adapter path. Trigger: gtts releases a version
  that opens its click upper bound to ``<9`` or
  ``<8.4``. Filed by dep-update audit 2026-05-12
  Phase 4.5 (click was in the medium-risk batch but
  poetry refused to move it due to the upstream pin).

- **MEDIUM-COMMENT-MANUAL-ENTRY-01**: manual "Add
  comment" UI in the article editor that creates an
  ``ArticleComment`` with ``imported_from = "manual"``
  rather than ``"medium"``. The schema already supports
  this via the ``imported_from String(50)`` column; no
  migration needed. Trigger: user demand for capturing
  comments-on-my-articles in Bibliogon for archival.
  Surfaced 2026-05-12 after the user verified Medium's
  HTML export is "your data only" by design — replies
  others left on the user's articles are not included
  in the export, and Bibliogon cannot import what
  Medium doesn't expose. The manual-entry workflow is
  the only forward-compatible path to archive incoming
  comments. Scope hint: editor sidebar gains an "Add
  comment" button next to the existing
  ``ArticleCommentsPanel`` heading; on click opens a
  small modal collecting author + body_text +
  optional published_at + optional responds_to_url
  (the URL of the source thread the user is
  transcribing from). The ``responds_to_article_id``
  is pre-filled with the open article's id. Effort: S
  (one new component + one POST endpoint that the
  comments router currently lacks; the GET / DELETE
  paths exist already).

- **COMMENTS-COUNT-PERF-01**: switch
  ``Article.comments_count`` from a ``len()``-on-relationship
  property to a JOIN-counted subquery against
  ``article_comments``. Trigger: per-article comment counts
  routinely above ~50, where SQLAlchemy materialising every
  row just to count it becomes wasteful. Today the property
  ships with a ``len()`` over the relationship list filtered
  by ``deleted_at IS NULL``; acceptable while typical counts
  stay 0-5. The subquery rewrite is a drop-in replacement on
  the model side; no schema change, no API change. Filed
  alongside MEDIUM-COMMENTS-UI-01 commit 1.

- **TESTCLIENT-HARMONIZE-01**: harmonise the 89 backend
  ``TestClient`` instantiation sites onto the lifespan-aware
  fixture pattern. Test-infrastructure audit 2026-05-12
  finding 0.4: 23 files use module-level
  ``client = TestClient(app)`` (no ``with``, so the FastAPI
  lifespan never fires and plugin routes are not mounted),
  34 files use the fixture-with-``with`` pattern correctly,
  3 files use inline-per-test. The lessons-learned rule
  "Tests must run through ``with TestClient(app) as c:``"
  documents the lifespan requirement but the heterogeneity
  persists. Trigger: a real "plugin route returns 404 in
  test" surprise from a no-lifespan file, OR a session
  dedicated to test-fixture cleanup. Refactor blast radius:
  large (89 sites, hidden state risks from shared
  session-scope clients). Filed by test-infrastructure
  audit 2026-05-12.

- **WALKER-HYPOTHESIS-01**: introduce Hypothesis
  property-based tests for the Medium-import walker
  (``plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/walker.py``).
  Test-infrastructure audit 2026-05-12 finding 0.7
  (Hypothesis option): zero ``@given`` usages today; the
  walker's example-based + regression-pin coverage is
  adequate. Candidate invariants if promoted:
  ``imageFigure`` count equals source ``<img>`` count;
  body-text length never changes more than 1% across
  re-parses; ``ParsedPost.is_comment`` is stable across
  whitespace-only HTML variations. Trigger: a third
  walker bug class slips through example-based tests
  (already had two: ``find`` vs ``find_all``,
  ``imageFigure`` vs ``image``). Effort: M, payoff
  dependent on bug rate. Filed by test-infrastructure
  audit 2026-05-12.

- **TESTCONTAINERS-EVAL-01**: evaluate Postgres-via-
  Testcontainers for backend integration tests.
  Test-infrastructure audit 2026-05-12 finding 0.7
  (Testcontainers option): Bibliogon ships SQLite as
  default and intended production DB (CLAUDE.md); no bug
  history of SQLite-vs-Postgres divergence; adopting
  Testcontainers would add 5-30s startup per CI run for
  zero documented payoff. Trigger: production-DB
  migration to Postgres, OR a documented SQLite-vs-Postgres
  divergence bug surfaces in production. Filed by
  test-infrastructure audit 2026-05-12.

- **MEDIUM-IMPORT-EXCERPT-AUTOFILL-01**: auto-populate
  ``Article.excerpt`` on Medium import, mirroring the existing
  seo_title / seo_description defaults shipped in commit
  ``2062393``. Trade-off: excerpt is conceptually similar to
  seo_description (both summarize the article), so duplicating
  the subtitle into both might feel redundant; alternatively,
  excerpt could derive from the first paragraph of body text
  with the existing heuristic-fallback rejection we applied to
  seo_description. No user complaint yet — the seo_description
  default covers the dashboard-tile use case. Promote to P2 if
  a user reports an empty-excerpt issue on imported articles.

- **AR-BULK-ASYNC-PROGRESS-01**: async bulk export with progress
  UI for selections >50 articles. The 2026-05-06 ship runs the
  request synchronously with a 180s server-side Pandoc timeout,
  which is fine for the typical workflow (<50 articles). For
  larger combined PDF runs the user sees a frozen browser tab
  until completion. Future work: convert to the async-job pattern
  used by audiobook export (background worker + SSE progress
  stream + persisted artifact). Effort: 1-2 sessions. Trigger:
  first user report of perceived hang, OR a real-world selection
  that exceeds 180s.

- **D-02 follow-ups**: macOS Intel universal2 build + code signing.
  Effort: M each. Deferred until user demand.

- **LAUNCHER-I18N-NATIVE-REVIEW-01**: native-speaker review for
  the three pending-review launcher i18n catalogs (pt, tr, ja)
  shipped in v0.30.0. Each catalog carries a
  `_meta.review_status: "pending native speaker"` block;
  `launcher/bibliogon_launcher/locales/REVIEW_STATUS.md`
  documents the per-language status and the PR-based
  correction submission flow. The
  `test_pending_review_catalogs_carry_marker` parity test
  enforces the marker contract, and `test_user_validated_*`
  enforces that markers are removed in the same change that
  promotes a language to validated. Trigger: native-speaker
  contact for any of pt/tr/ja, or a user-reported correction
  PR. Effort: S per language for an experienced reviewer
  (95 keys, mostly mechanical drift detection).
  - **Public surface:** GitHub issue
    [#18](https://github.com/astrapi69/bibliogon/issues/18)
    is the call-for-reviewers, labeled `help wanted` +
    `good first issue` + `documentation`. A passing-by
    pt / tr / ja speaker can find it without grepping the
    repo. Corrections land via PR per the flow in
    REVIEW_STATUS.md.
  - **Decision threshold:** 2026-08-07 (3 months after the
    v0.30.0 release). At that point an explicit decision
    lands on each marker: drop-the-marker (accept as
    canonical, with or without a review having happened),
    or continue-waiting. The threshold is also documented
    as a watch-list item in the v0.30.0 retrospective.

---

## Blocked / Upstream Wait

Items waiting on external triggers. Re-audit monthly via
`make check-blockers`. Do not attempt to advance these without an
unblock signal. ROADMAP entries (DEP-02, DEP-05, DEP-09, SEC-01)
are listed in the cross-reference at the top of this file; the
table below covers backlog-only waiting items + a quick-poll
summary.

| Item | Blocked on | Unblock condition |
|------|-----------|-------------------|
| DEP-02 (TipTap 3) | Upstream npm publish of `@sereneinserenade/tiptap-search-and-replace@0.2.0` | npm publish (default); path B (`prosemirror-search` adapter ~50-80 LOC) available on explicit go-ahead |
| DEP-05 (elevenlabs 2.x) | Real paid-API verification (substantial 0.2.27 -> 2.45.0 jump, careful audit required) | Schedule a dedicated audiobook test session with a live ElevenLabs key |
| PGS-04-FU-01 | First user report of cross-language structural divergence | User report |
| Manual launcher smoke tests (#2/#3/#4) | Real hardware (Windows / macOS / Linux) availability | Hardware access |
| Manual content-safety smoke (#8 Part 2 beforeunload) | Aster's local browser | Manual run |
| Manual UI smoke (#5) | Aster's local browser | Manual run |

---

## Maintenance / hygiene

Recurring upkeep, low priority but worth scheduling:

- **Test count verification** before any release. Run the
  per-plugin iteration from `ai-workflow.md` "Numeric claims
  verification". Don't grep.
- **`poetry show --outdated` + `npm outdated`** before each
  release per release-workflow.md Step 4b.
- **`npm audit --audit-level=high`** monthly (next: 2026-06-02).
- **Help docs review**: every shipped feature must update
  `help.yaml` and the help/{lang}/ pages. Audit on each release.
- **ROADMAP cleanup**: refresh the header line + "next active
  theme" sentence on each release. Move any item shipped outside
  its theme back into the right theme entry.
- **Dependency currency** per `lessons-learned.md`: only stable
  releases, no beta/RC/alpha. 2-week soak for new majors.
- **Systematic audit pass** quarterly (per
  `ai-workflow.md` "Test coverage audits → When to run"). The
  drop-in prompt lives at
  [.claude/prompts/audit.md](../.claude/prompts/audit.md);
  paste into a fresh Claude Code session at the repo root. It
  triages against documented standards in 4 sections (Test
  Validity / Code Quality / Infrastructure / Documentation)
  and is read-only — no code is modified.

---

## How to use this file

- Pick from the highest non-empty tier when starting a session
  and there's no user-driven priority override; consult ROADMAP
  for the canonical task description on cross-referenced items.
- When a session defers a sub-item, add it under the matching
  tier with a `*-FU-NN` ID and one-line "why deferred".
- When an item ships, **delete the row** from this file. The
  CHANGELOG / ROADMAP archive records the history; the backlog
  is forward-looking only.
- When the top tier changes, re-rank explicitly in this file
  before starting work, not implicitly during a session.
- Don't grow past 50 items. If it grows, split by category into
  themed files (`docs/backlog/dependencies.md`, etc.).
