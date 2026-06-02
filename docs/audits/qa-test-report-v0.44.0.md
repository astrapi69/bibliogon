# QA Test Report — Bibliogon v0.44.0

- **Date:** 2026-06-02
- **HEAD at audit start:** `1b8b4f1b` (`docs: post-release journal v0.44.0`)
- **Version:** 0.44.0 (`backend/pyproject.toml`)
- **Tester role:** adversarial QA — test to break, not to confirm.
- **Baseline:** `make` backend suite **2504 passed, 1 skipped** before this session.
- **Working tree at start:** one uncommitted, behaviorally-identical
  ruff-format reflow in `backend/app/routers/chapter_labels.py` (multi-line
  `update(...)` collapsed to one line). NOT authored by this session;
  left untouched (Multi-Tool-Coordination explicit-paths discipline).

> **Scope boundary (read first).** This was a backend- and code-level
> audit run without a live browser. Categories requiring a running app +
> browser were analyzed at the **code level only** and are NOT claimed as
> visually verified: the 12-variant theme matrix, drag-and-drop
> interactions (storyboard/panel/collage reorder), composition-mode chrome
> hiding, typewriter scroll, PDF visual fidelity, and render performance at
> scale. See "Coverage boundary / not executed" at the end. Everything
> marked PASS below was exercised programmatically (pytest / TestClient /
> empirical probes) or read in source with a cited file:line.

---

## Summary table

| Test Area | Method | Result | Findings |
|-----------|--------|--------|----------|
| Data integrity — cascades (Book/Article full graphs, ORM + bulk paths) | empirical pytest probe | **PASS** | 0 |
| Data integrity — comment survival + FK SET NULL | empirical pytest probe | **PASS** | 0 |
| Security — asset/article/KDP upload filename traversal | empirical probe | **FAIL → FIXED** | **C1 (CRITICAL)** |
| Security — uploaded-asset content type (stored XSS) | empirical probe | **RECALIBRATED → LOW** | H1 |
| Security — Zip Slip across extraction sites | code + empirical | **PARTIAL** | M1 (MEDIUM) |
| Security — Danger Zone HMAC reset token | code review | **PASS** | L1 (LOW, replay) |
| Security — plugin-install path validation | code review | **PASS** | 0 |
| Security — SQL injection / schema validation | empirical probe | **PASS** | 0 |
| API — 404 / 422 / wrong-type / bad-enum | empirical probe | **PASS** | L5 (LOW) |
| Story Bible — relationships / auto-detect / export | code review | **PASS** | L3, L4 (LOW) |
| Story Bible — @-mention lifecycle | code review | **FAIL** | M3 (MEDIUM) |
| Comic — cross-page move capacity | code + empirical | **FAIL** | M2 (MEDIUM) |
| Comic — bubble/tail bounds validation | code review | **PARTIAL** | L2 (LOW) |
| Editor — snapshots (restore safety + retention) | code review | **PASS** | 0 |
| Editor — chapter-label delete cleanup | code + cascade probe | **PASS** | 0 |
| Editor — writing-goals daily target (div-by-zero) | code review | **PASS** | 0 |
| KDP — ARC status validation / pricing math | code review | **PASS** | 0 |
| Layout — `layout`/`layout_config` validation | code review | **PASS** | 0 (by design) |
| Tooling — lint hygiene | ruff | **PARTIAL** | L6 (LOW, pre-existing) |
| i18n — translation completeness | advisory test | **ADVISORY** | L7 (LOW) |
| A11y — Radix `Dialog.Content` missing `Dialog.Description` | code sweep | **FAIL → FIXED** | M4 (MEDIUM) |
| Writing goals — negative daily word count | code review | **FAIL → FIXED** | M5 (MEDIUM) |
| Backup `.bgb` round-trip fidelity | empirical export probe | **FAIL → FIXED** | **H2 (HIGH, data-loss-on-restore)** |

**Finding tally:** 1 CRITICAL (fixed), 2 HIGH (H2 fixed this session;
H1 recalibrated to LOW — see below), 5 MEDIUM (2 fixed: M4, M5), 7 LOW.

**Fixed in this session:** C1 (CRITICAL, Stop-Condition), M4 + M5 (MEDIUM,
user-directed priority fixes). All other findings (H1, M1–M3, L1–L8)
documented for review.

---

## CRITICAL

### C1 — Arbitrary file write via upload filename path traversal (CWE-22) — FIXED

**Severity:** CRITICAL. **Status:** fixed in this session per the Stop-Condition
("A CRITICAL security finding — fix immediately"). Regression-pinned.

**Affected sites (all confirmed):**
- `backend/app/routers/assets.py` — `file_path = book_dir / file.filename`
- `backend/app/routers/article_assets.py` — `file_path = article_dir / file.filename`
- `plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py` (`validate-cover`) — `tmp_file = tmp_dir / file.filename`

`import_orchestrator.py` was already SAFE (it uses `_sanitise_rel_path`, which
rejects `..`). `plugin_install.py` was already SAFE (`_validate_zip_paths`).

**Reproduction (book asset, pre-fix):**
1. `POST /api/books` → get `{book_id}`.
2. `POST /api/books/{book_id}/assets` with a multipart part whose
   `filename` is `../../../../../../../../tmp/QA_ASSET_TRAVERSAL.txt`.
3. **Expected:** filename treated as a basename; file stored inside the
   upload dir, or request rejected.
4. **Actual (pre-fix):** HTTP 201; stored `path` =
   `.../uploads/<book>/figure/../../../../../../../../tmp/QA_ASSET_TRAVERSAL.txt`,
   and `/tmp/QA_ASSET_TRAVERSAL.txt` was written with the request body
   (`PWNED`) — i.e. an arbitrary file write outside the upload root.

**Impact:** any client that can reach the API (for a local-first app: the
local SPA, but also any web page in the user's browser via a cross-origin
`fetch` + `FormData` with a script-set `filename`) can write/overwrite files
anywhere the server process can write — config, the SQLite DB, plugin code.
A CSRF → arbitrary-file-write chain. Mitigated in practice by the
no-remote-exposure-by-default posture, but the write primitive is real.

**Fix applied:** new shared helper `app.paths.safe_upload_filename(name)` that
strips every directory component (POSIX `/` and Windows `\`), keeps the final
segment, and raises `ValidationError` (→ HTTP 400) on empty / `.` / `..`.
Applied at all three sites; the persisted `Asset.filename` /
`ArticleAsset.filename` now stores the sanitized basename so served paths
stay consistent.

**Regression pins:** `backend/tests/test_upload_filename_traversal.py`
(10 tests: helper unit cases + book-asset and article-asset end-to-end
non-escape assertions). All green; full backend suite 2504 → **2514** passed.

---

## HIGH

### H2 — Backup `.bgb` data-loss (HIGH) — FIXED — see the dedicated section below.

(The only remaining open HIGH was H2, now fixed. H1 below was recalibrated
to LOW after checking the response headers.)

## H1 (RECALIBRATED to LOW) — uploaded HTML/SVG asset served as `text/html`

**Severity:** ~~HIGH~~ **LOW** (recalibrated). **Status:** not fixed; not
required. **Why downgraded:** the serve endpoints already send
`Content-Disposition: attachment` (from `FileResponse(filename=…)`), verified
on a live response. Browsers therefore **download** an uploaded `.html`/`.svg`
asset rather than render it — direct navigation and `<iframe>` embedding both
trigger a download, not execution; and script inside an `<img>`-loaded SVG does
not run. So the stored-XSS is not actually exploitable via the obvious vectors.
The original HIGH was overscored because the first probe didn't inspect the
`Content-Disposition` header. **Optional hardening (LOW, documented for a
future pass):** add an `X-Content-Type-Options: nosniff` header + a book-asset
upload extension allowlist (mirroring the article-asset endpoint) as
defense-in-depth.

<details><summary>Original HIGH write-up (retained for the record)</summary>

**Reproduction:**
1. `POST /api/books/{id}/assets` with `("evil.html", b"<script>alert(1)</script>", "text/html")`,
   `asset_type=figure`. → HTTP 201 (no content-type / extension allowlist on
   the book-asset endpoint; only `asset_type` is validated).
2. `GET /api/books/{id}/assets/{asset_id}/file` returns the body with
   `Content-Type: text/html; charset=utf-8` (FileResponse guesses from the
   `.html` suffix).

**Expected vs actual:** a "figure" upload should be constrained to image
types (the article-asset endpoint *does* enforce an extension allowlist;
the book-asset endpoint does not). Actual: arbitrary HTML/SVG accepted and
served as active content from the app's own origin.

**Impact:** stored XSS. Because the asset is served same-origin with the SPA
and the API is unauthenticated (local-first), script in a served asset can
drive the full API (read/modify/delete every book and article). Exploitation
requires the victim to navigate to / embed the asset URL.

**Suggested fix:** allowlist content types/extensions on the book-asset
upload (mirror `article_assets._ALLOWED_EXTENSIONS`), and/or serve assets
with `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`,
and/or force a generic `application/octet-stream` for non-image types.

</details>

---

### H2 — Backup `.bgb` does not cover most post-v0.38 models (data loss on restore)

**Severity:** HIGH (silent data loss on a backup → restore cycle).
**Status:** **FIXED** (BACKUP-COMPLETENESS-01, manifest v3.0). The backup now
serializes EVERY mapped column of EVERY content model and a `globals/`
segment (authors + templates), and the importer restores them all in
FK-safe order. Built test-first: `tests/test_backup_full_roundtrip.py`
exports a maximal graph (comic book + article + globals), wipes every table,
imports, and asserts field-level equality for all 23 content models — it
failed comprehensively before the fix and passes after. Implementation:
generic introspection-driven `serialize_row` / `restore_row[M]` helpers
(a new column is captured automatically and can never silently drop again);
asset rows preserve their id (Page/Panel/Entity `image_asset_id` reference
them) and regenerate only the machine-specific path; timestamps + `deleted_at`
now round-trip. Deliberate, documented exclusions: `AudioVoice` (a cache
re-synced at startup) and `GitSyncMapping` (machine-local clone path).
Backend suite 2514 → 2516; mypy + ruff green.

(Original finding, retained for the record:)

**Empirical proof:** built a comic book with a Page + ComicPanel + ComicBubble
+ StoryEntity + ChapterLabel + ChapterVersion (manual snapshot) +
BookPublishingState + ArcReviewer, plus an Article with an ArticleComment,
then called `export_backup_archive` and inspected the `.bgb`. The archive
contained only:
```
manifest.json
books/<id>/book.json
books/<id>/chapters/<id>.json
articles/<id>/article.json   (+ publications.json / assets when present)
```

**Missing from the backup archive entirely** (and the restore side —
`backup_import.py` — has zero references to any of them, so they would not be
restored even if present):
- **Page** — i.e. ALL picture-book + comic-book content (`content_model="pages"`)
- **ComicPanel**, **ComicBubble**
- **StoryEntity**, **StoryEntityPageLink** — the entire Story Bible
- **ChapterLabel** (+ `Chapter.label_id` references)
- **ChapterVersion** — all snapshots (manual AND auto)
- **BookPublishingState**, **ArcReviewer** — KDP Publishing Wizard state
- **ArticleComment** (already noted in lessons-learned)
- **WritingSession** — writing history / streaks

`serialize_book_for_backup` serializes only `Book` scalar columns + chapters;
`_write_book_dir` writes only `book.json` + `chapters/` + `assets/`. The
backup format predates Pages / Story Bible / comics / labels / snapshots /
publishing-state and was never extended as those models shipped (v0.39–v0.44)
— the "new persistent model shipped without backup coverage" variant of the
parallel-surface / half-wired patterns in `lessons-learned.md`.

**Impact:** for a picture-book or comic-book author, a `.bgb` backup → restore
loses **100% of book content** (no pages survive). For a fiction author, the
entire Story Bible, all chapter snapshots, and all per-book labels are lost.
The user only discovers this when restoring — typically after the primary data
is already gone (machine migration, disaster recovery). This is the worst
bug class (silent loss surfacing exactly when the backup is needed).

**Suggested scope (for review):** extend `serializer.py` + `_write_book_dir` /
`_write_article_dir` to emit pages (+panels+bubbles), story entities (+links),
chapter labels, chapter versions, publishing state (+ARC reviewers), and
comments; mirror on the import side; bump the manifest to `3.0` with backward
compatibility for `1.0`/`2.0`; add round-trip fidelity tests asserting every
model family survives export → clear → import. Until then, a user-facing
caveat in the backup help doc ("backups currently cover book metadata,
chapters, articles, publications and assets; picture-book/comic pages, Story
Bible, snapshots, labels and KDP wizard state are not yet included") would at
least set expectations.

---

## MEDIUM

### M1 — Two raw `extractall` calls bypass `safe_extractall` (defense-in-depth) — FIXED

**Severity:** MEDIUM. **Status:** **FIXED**. Both sites now route through
`safe_extractall`: `git_import_backfill.py` (module import) and the
medium-import `preview.py` (deferred local import, matching that plugin's
`app.*` import convention). A crafted `..`/absolute member is now rejected
with a `ValidationError` rather than silently neutralized. git-backfill +
medium-import + KDP plugin tests green; ruff clean.

- `backend/app/routers/git_import_backfill.py:78` — `zf.extractall(tmp_dir)`
- `plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/preview.py:303` — `zf.extractall(tmp)`

`safe_extractall`'s docstring states "Use this everywhere instead of a bare
`zf.extractall(...)`"; these two sites violate that policy.

**Empirically NOT currently exploitable:** CPython's own `ZipFile.extractall`
strips `..` components and absolute/leading-slash paths. Verified on both the
sandbox `python 3.14` and the backend `python 3.12` venv: a crafted archive
with `../../../../tmp/...` and `/tmp/...` members extracted entirely INSIDE
the target dir (no escape). So this is a consistency / defense-in-depth gap,
not a live Zip Slip — but it would become exploitable if CPython behavior ever
changed or if symlink-restoring extraction were added. Route both through
`safe_extractall`.

### M2 — Comic cross-page panel move has no server-side capacity gate

**Severity:** MEDIUM. **Status:** documented.

`plugins/bibliogon-plugin-comics/bibliogon_comics/panels.py` `update_panel`
validates only that the target `page_id` belongs to the same book when moving
a panel — there is **no per-page panel-count / capacity check**. The
"capacity-gated Move to page" described in the v0.40.0 changelog is enforced
**only in the client menu**; a direct `PATCH .../comic-panels/{id}` with a
`page_id` can over-fill any page beyond its grid template's panel count.

**Reproduction (API):** create a comic book, fill page A to its template
capacity, then `PATCH` another panel's `page_id` to page A. The move succeeds;
no 400.

**Impact:** visual overflow / inconsistent grid; no data loss. Suggested fix:
add a server-side capacity gate keyed off the target page's grid template,
mirroring the client gate.

### M3 — @-mention nodes orphan when the mentioned entity is deleted

**Severity:** MEDIUM. **Status:** documented.

`plugins/bibliogon-plugin-story-bible/bibliogon_story_bible/entities.py`
delete-entity handler does a bare `db.delete(entity)` with **no scan/cleanup**
of TipTap mention nodes embedded in `Chapter.content` / `Page.text_content`.
The mention node (`frontend/src/components/storyBibleMention.tsx`) keeps the
deleted entity's `id`/`label`/`entityType`; it still renders as a colored
badge, and clicking it (`handleMentionClick`) tries to open a non-existent
entity (silent failure / 404).

**Impact:** dangling reference UX, no data loss. This is the
"half-wired lifecycle" pattern (state-write — the mention — without a cleanup
path on the referenced entity's deletion). Suggested fix: on entity delete,
scan the book's chapters/pages and strip mention nodes for that entity id
(or downgrade them to plain text); or resolve mention rendering against live
entities and render a "deleted entity" placeholder.

---

### M4 — Radix `Dialog.Content` missing `Dialog.Description` / `aria-describedby` (a11y) — FIXED

**Severity:** MEDIUM (accessibility). **Status:** fixed this session
(user-directed priority fix).

Radix `Dialog.Content` emits a console warning and degrades screen-reader
semantics when it has neither a `Dialog.Description` nor an explicit
`aria-describedby`. The shared `AppDialog` already renders a
`Dialog.Description` (so its consumers were fine), but **16 components render
a raw Radix `<Dialog.Content>`** with neither — including the named
`WritingHistoryModal`:

AiSetupWizard, AudioExportProgress, ChapterTemplatePickerModal,
CreateBookModal, DonationOnboardingDialog, ErrorReportDialog, GitBackupDialog,
GitSyncDialog, GitSyncDiffDialog, RelationshipGraphView,
SaveAsChapterTemplateModal, SaveAsTemplateModal, ShortcutCheatsheet,
TranslationLinks, WritingHistoryModal, comments/CommentPreviewModal.

**Fix applied:** added `aria-describedby={undefined}` to each raw
`<Dialog.Content>`. This is Radix's documented opt-out for dialogs without a
description, and matches the **existing convention** already used by
`WizardShell`, `ImportWizardModal`, and `DashboardFilterSheet`. Chosen over a
hardcoded sr-only `<Dialog.Description>` because adding visible/sr-only text
would introduce hardcoded UI strings (forbidden — strings must come from the
i18n catalogs) for 16 dialogs × 8 languages. tsc clean; prettier applied;
92 Vitest tests across the 7 affected components with test files pass.

### M5 — Writing-goals daily word count can go negative on deletion — FIXED

**Severity:** MEDIUM (data-display correctness). **Status:** fixed this session
(user-directed priority fix).

`backend/app/routers/chapters.py` records writing progress as
`count_words(new_content) - words_before` (a **net** delta) via
`record_progress`, which does `session.words_written += delta`. When a save
deletes more than it adds, `delta` is negative and a day's `words_written`
goes negative — the daily-goal / streak widget then renders a negative count
(and `recent_sessions` / `daily_global_series` sums can be negative).

**Fix applied:**
- `app/services/writing_stats.py::record_progress` now floors `delta` to
  `max(0, delta)` — the metric tracks gross words written, not net document
  size; a pure-deletion save still records 0 (marking the day active) but
  never decrements. This is the single enforcement point for the invariant
  across all current/future callers.
- The two widget-facing day-series reads (`recent_sessions`,
  `daily_global_series`) additionally clamp each day total to `max(0, …)` so
  any legacy negative rows written before this fix also display as 0.
- Regression pins in `backend/tests/test_writing_progress_no_negative.py`
  (3 tests: net-negative save doesn't decrement; pure deletion → 0; day series
  never negative even with a seeded legacy negative row). Existing
  `test_writing_history_stats.py` / `test_writing_goals.py` still green.

---

## LOW

- **L1 — Reset token replay within TTL.** `app/services/reset_token.py` issues
  HMAC-SHA256 tokens with a per-process secret, constant-time
  `compare_digest`, and 5-min expiry — solid. But there is no server-side
  nonce store, so a token is replayable until it expires, despite the
  docstring calling them "one-time". The reset also requires the literal
  `"RESET"` confirmation, so replay only re-triggers an action the user
  already authorized. Low risk.
- **L2 — Comic bubble `anchor` not bounds-validated server-side.**
  `ComicBubbleCreate/Update` bound `width_pct/height_pct/tail_position_pct/
  tail_length_px` with `ge/le`, but `anchor` (`{x_pct,y_pct}`) is a free
  `dict[str, Any]`. A direct API call can place a bubble off-canvas
  (cosmetic; bad PDF/editor placement; no crash/data loss).
- **L3 — Continuity-checker N+1 query.**
  `plugins/.../bibliogon_story_bible/continuity.py` accesses `link.entity.name`
  per link without eager loading → one query per link. Perf only; correctness
  fine. Use `joinedload`.
- **L4 — `StoryEntityPageLink` page_id/chapter_id XOR is route-only.** The
  exactly-one-of invariant is enforced in `links.py` (HTTP 400), not by a DB
  CHECK constraint. Documented design convention (matches `Chapter.chapter_type`
  / `Page.layout`); raw-SQL inserts could violate it.
- **L5 — Null bytes & unbounded length accepted in text fields.** `POST /api/books`
  accepts a title containing `\x00` (HTTP 201) and a 10,000-char title (stored
  in full; `Book.title` is an unbounded `String`/TEXT column). No injection
  (SQLi stored as inert data — `books` table intact after `'; DROP TABLE
  books;--`), but no max-length / control-char rejection. The global
  `BodySizeLimitMiddleware` (default 500 MB) is the only size bound.
- **L6 — Pre-existing ruff B904 in KDP routes — FIXED.** `plugins/bibliogon-plugin-kdp/
  bibliogon_kdp/routes.py` now raises `HTTPException(...) from e` in the
  `build_kdp_package` handler, preserving the cause chain. ruff clean.
- **L7 — i18n untranslated-English advisory.** `test_advisory_untranslated_en`
  flags many catalog values as byte-identical-to-EN-and-English-looking
  (the "...and 89 more" terminal line). Advisory heuristic, always passes;
  represents translation completeness debt in auto-translated catalogs.
- **L8 — EditableTitle published-work warning is client-side only** (no
  server-side block on title edits of published/archived works). Classified
  by-design: the feature is an acknowledgment warning, not a hard lock. Noted
  for completeness; no action recommended unless a hard lock is intended.

---

## Verified GREEN (passed — proof of coverage)

**Data integrity / cascades** (empirical pytest probe, FK enforcement `ON`):
- Book → {Chapters→ChapterVersions, Pages→ComicPanels→ComicBubbles,
  Assets, ChapterLabels, StoryEntities→StoryEntityPageLinks (page+chapter),
  BookPublishingState→ArcReviewers, WritingSessions} — **0 orphans** after
  both `db.delete(book)` (ORM) and the bulk "empty trash"
  (`query(...).delete()`) path.
- Article → {ArticleAsset, ArticleImportSource, Publication} cascade-deleted;
  **ArticleComment SURVIVES** with `responds_to_article_id` SET NULL — as
  designed (`backend/app/models/__init__.py` comments + FK `ondelete`).
- `PRAGMA foreign_keys=ON` confirmed in `app/database.py` connect listener,
  so DB-level cascades fire even where no ORM relationship exists (story
  entities, publishing state, writing sessions, comic panels).

**Security:**
- Danger Zone reset: two-phase (`/reset/prepare` → `/reset`), requires both a
  valid HMAC token AND literal `"RESET"`; constant-time compare; expiry; fail
  closed on malformed input.
- Plugin install: `_validate_zip_paths` rejects `/`-prefixed and `..` members
  before extraction; plugin name validated to `[a-z0-9-]`.
- `import_orchestrator` upload staging sanitizes via `_sanitise_rel_path`
  (rejects `..`).
- SQL injection: SQLAlchemy parameterization — injection strings stored as
  inert data; bad enum (`entity_type`) → 422 via `Literal`.

**API error paths:** non-existent IDs → 404; missing required / wrong type →
422; nested resource under missing parent → 404.

**Editor / KDP:** snapshot restore creates a safety snapshot before
overwrite; auto-snapshot retention trims `is_manual=False` only (manual
exempt); chapter-label delete clears assigned `Chapter.label_id` (explicit
UPDATE + FK SET NULL); ARC `review_status` is `Literal`-validated;
KDP royalty math (35%/70% per region) correct; writing-goals daily target
guards `days <= 0` (no div-by-zero); `Page.layout` validated against the 13
`PageLayout` literals.

**Story Bible:** circular relationships (A→B→C→A) render without infinite
loop (Arc View dedups on unordered pair); auto-detect uses `MIN_NAME_LEN=3` +
`\b…\b` word boundaries (no substring false positives); Markdown export uses
5 bulk queries (no N+1).

---

## Coverage boundary / not executed (transparency)

These QA-prompt categories were **not** run end-to-end in this environment
(no browser / visual diff / scale harness). They are NOT asserted as passing:

- **Theme matrix (12 variants)** — visual readability/contrast across all
  6 palettes × light/dark. (`make verify-theme` exists as the automated gate;
  not run here.)
- **Drag-and-drop & live editor UX** — storyboard reorder, panel reorder,
  collage drag/resize/z-index, composition-mode chrome hide/restore,
  typewriter scroll, context-menu actions firing.
- **PDF export visual fidelity** — bubble positions matching the editor, the
  6 bubble-type renderings (thought circle-chain, shout spike, whisper dashed),
  per-layout PDF placement. Reviewed at code level only.
- **Render performance at scale** — 50+ entities graph, 100-page storyboard,
  30×50 Arc View SVG. Backend N+1 (L3) found by reading; frontend render perf
  not measured.
- **Round-trips** — backup `.bgb` export scope WAS executed (→ finding H2);
  the import/restore side was code-reviewed (confirms the same omission) but
  not run end-to-end. Medium/DOCX import not executed.

**Recommendation:** run `npx playwright test --project=smoke`, `make
verify-theme`, and a manual backup round-trip to close the visual/interaction
gaps above before the next release.

---

## Questions & assumptions

- **Assumption:** the immediate-fix Stop-Condition ("CRITICAL security — fix
  immediately, don't wait for review") overrides the "STOP after the audit
  doc" gate for C1 only. C1 was fixed + pinned this session; H1 (HIGH) and all
  MEDIUM/LOW findings were left for user review per the gate.
- **Multi-tool note:** a parallel session committed + pushed the C1 fix as
  `f470e942` (verified complete — all three sites + helper + the 70-line
  regression test, matching this session's work) and the `chapter_labels.py`
  ruff-reflow as `524d3867`. This session committed Bug M4, Bug M5, and this
  report on top with explicit-path staging (no `git add -A`), per the
  Multi-Tool-Coordination discipline.
- **Threat-model note:** Bibliogon is local-first / unauthenticated by design,
  so C1/H1 severities are scored on the write/script primitive itself, with
  the no-remote-exposure posture noted as the practical mitigation. If a
  remote/multi-user deployment is ever in scope, both rise in real-world risk.
