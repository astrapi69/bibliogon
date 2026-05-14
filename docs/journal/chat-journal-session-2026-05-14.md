# Chat journal — 2026-05-14

v0.32.0 UX-Polish session. Three findings from a manual smoke
test of v0.31.0 land as user-facing improvements: Medium-import
button-state fix (F1), two-tier comment classifier + reciprocal
reclassify endpoints + reclassify UI (F2a/b/c), and an editor
"Copy" split-button (F3). One extended session; close-out lands
in a follow-up.

## 0. Pre-inspection STOP gate (11:23)

- Original prompt: a structured /loop-style brief with three
  findings (button-state, comment heuristic, copy button) and
  five open questions for the user. Real ZIP fixture handed off
  at `tmp/medium-export-*.zip` for the corpus audit.
- Optimized prompt: the user-authored prompt was already the
  right shape — pre-inspection mandatory, real-data audit
  required for Finding 2, audit results in the report not just
  "tests pass".
- Goal: surface enough data so each of the three findings has a
  defensible answer, then ask the five open questions.
- Result: 209-file Medium corpus extracted and run through both
  the current heuristic (8 detections) and two candidate refined
  heuristics. v1 (multi-signal scoring) produced 12 detections
  with 1 false positive (Vollmond image-poem). v2 (require
  conversational marker AND no article-shape disqualifiers)
  produced 11 detections with 0 false positives, 0 lost
  detections, and caught the user's reported edge case ("This is
  a powerful and unsettling reframing..."). Toolbar audit found
  7 conditional tail buttons — adding an 8th was the placement
  call for F3. Pre-inspection report surfaced all five questions.

## 1. User answers all five open questions (11:25)

- Result: minimal fix for F1; v2 heuristic + reciprocal Option B
  endpoints for F2; reciprocal both directions; copy-with-title
  in both Markdown + plain text; v0.32.0 (not v0.31.1) — the
  reciprocal endpoints add new API surface, minor-bump per
  SemVer. Implementation notes for each phase plus a UX
  refinement: kebab menu (not primary toolbar button) for
  destructive data-move action.

## 2. Phase 1 — F1 button-state fix (11:26)

- Original prompt: "Proceed with Phase 1 (F1 button-state fix)."
- Goal: auto-clear file on Medium-import success.
- Result: one-line `setFile(null)` after `setResult(response)`
  in MediumImportPage.tsx + a Vitest pinning both the
  auto-clear-on-success and the keep-file-on-failure
  behaviours. Frontend Vitest 931 → 933.
- Commit: `db2af43`.

## 3. Phase 2a — Two-tier comment classifier (11:43)

- Goal: ship v2 heuristic; data-validate against 209-file corpus
  before docstring + audit doc.
- Result: `_classify_as_comment` refactored into two tiers
  (strict + extended conversational-marker rule), with a single
  `_scan_doc` helper that walks the doc once for tier-1 signals
  plus the per-paragraph text tier-2 needs. Audit doc at
  `docs/audits/medium-comment-heuristic-2026-05-14.md`. 10 new
  tier-2 walker tests pin closing-question detection, second-
  person opener detection, opening-question detection, the
  Vollmond-class regression (no marker → article), heading /
  codeBlock / imageFigure disqualifiers, list-allowed-in-
  comments, the 2000-char hard cap, and the mid-body-question
  windowing rule.
- Surprise caught by verification: my pre-inspection report
  said "197 / 12" on the corpus; running the COMMITTED v2
  walker against the corpus showed 198 / 11. Arithmetic drift
  (209 - 11 = 198, not 197). Audit doc + docstring corrected
  before the commit. Promoted to a lessons-learned rule:
  "Real-corpus audit catches arithmetic drift before it ships".
- Commit: `95c72c8`.

## 4. Phase 2b — Reciprocal reclassify endpoints (11:50)

- Goal: ship POST `/api/articles/{id}/reclassify-as-comment` +
  POST `/api/comments/{id}/reclassify-as-article` as a
  transactional move (atomic delete + insert, never half-state).
- Result: pure service module at
  `backend/app/services/reclassify.py` holds the field-
  translation functions; routers stay thin. Article → Comment
  flows author / language / content_json (→ body_text +
  body_json) / canonical_url / created_at (→ both created_at
  and imported_at) / updated_at / deleted_at; pulls
  `imported_from` + `source_filename` from
  `article.import_source` when present, falls back to
  `"manual"`. Comment → Article auto-derives the title from the
  first 200 chars of body_text (word-boundary trim + "..." when
  truncated). 14 integration tests cover happy path both
  directions, target linking, external URL pointer, 404 / 400
  paths, provenance preservation, title truncation + empty-body
  stub, import-source re-creation skip for native comments,
  atomicity, and an Article→Comment→Article round-trip.
- Backend full suite: 1648 → 1662 (+14).
- Commit: `3288ba5`.

## 5. Phase 2c — UI actions for reclassify (12:00)

- Goal: two user-facing surfaces (kebab menu in ArticleEditor +
  per-row button in Comments admin).
- Result: ArticleEditor header gets a Radix DropdownMenu kebab
  with "Move to comments" item; CommentsAdminSection gains a
  per-row "Move to articles" button next to the trash icon.
  Both use simple confirm dialogs (the move is reversible via
  the reciprocal direction, so TypeToConfirm would be wasted
  friction). Success path fires `notify.bulkAction` for the
  deep-link toast — `(message, onAction, label)` shape fits
  exactly. 6 new Vitest tests in CommentsAdminSection.test.tsx
  (the reciprocal direction); the ArticleEditor surface gets a
  1-test Vitest smoke that pins the kebab renders + load path
  works.
- Cost surface caught: Radix DropdownMenu inside happy-dom is
  brittle for the "open menu → click item" interaction.
  ~30 min burned trying `fireEvent.click`,
  `fireEvent.pointerDown` + `fireEvent.pointerUp`,
  `userEvent.click`, `act()` wrappers — none stable. Settled on
  Vitest for the trigger-renders surface only; full open-menu
  flow covered by `e2e/smoke/reclassify.spec.ts`. Promoted to a
  lessons-learned rule: "Radix DropdownMenu + happy-dom is
  brittle for Vitest".
- Frontend Vitest: 933 → 938 (+5 — CommentsAdminSection
  reclassify suite + 1 ArticleEditor kebab smoke).
- Commit: `bb4a820`.

## 6. Phase 3 — Editor Copy split-button (12:06)

- Goal: ship the user-facing Copy button per F3 spec
  (Markdown default + plain-text alternative).
- Result: new `utils/tiptap-markdown.ts` with `editorToMarkdown`
  + `editorToPlainText` (the Markdown converter extracted from
  Editor.tsx; the plain-text converter is new). New
  `documentTitle` + `documentSubtitle` props on Editor pass
  through to the Toolbar's Copy handler — Markdown emits
  `# Title\n\n*Subtitle*\n\n{body}`; plain text emits
  `Title\nSubtitle\n\n{body}`. Plain-text rendering keeps lists
  and blockquote prefixes, surfaces link references as
  `text (url)` (with a guard to avoid duplicating bare-URL
  links), and substitutes images with `[Image: alt — caption]`.
  Placement: Toolbar tail right after the spacer; the
  chevron-split visually anchors Copy as a single action with
  one disclosure. Hidden in markdown-edit mode (the textarea
  already shows the Markdown source). 27 util tests + 7
  Toolbar tests + 1 Playwright spec
  (`e2e/smoke/copy-toolbar.spec.ts`).
- BookEditor's existing `chapterTitle` flows through via
  `documentTitle ?? chapterTitle` fallback — zero changes to
  BookEditor.
- Promoted to a lessons-learned rule:
  "Split-button (default + chevron disclosure) for primary +
  alternative outputs".
- Frontend Vitest: 938 → 972 (+34 — 27 util + 7 Toolbar).
- Commit: `3cedf78`.

## 7. Phase 4 — Close-out (12:07)

- Goal: CHANGELOG entry, release notes file, lessons-learned
  rules, journal entry, version bump prep.
- Result: this entry. v0.32.0 CHANGELOG section landed above
  v0.31.0; release notes at `changelog/releases/v0.32.0.md`
  follow the v0.31.0 template (prerequisites + Action required
  + What's new + Fixed + Internal + Verifying downloads).
  Three new lessons-learned rules:
  - "Radix DropdownMenu + happy-dom is brittle for Vitest"
  - "Split-button (default + chevron disclosure) for primary +
    alternative outputs"
  - "Real-corpus audit catches arithmetic drift before it
    ships"
- Tag / push / GitHub release deliberately deferred; the user
  reviews the close-out before pushing the artifacts.

## Session summary

- 5 feature commits (v0.32.0 work proper) + 1 close-out commit
  (this journal + CHANGELOG + lessons-learned).
- Test deltas:
  - Backend: 1648 → 1662 (+14, all in F2b)
  - Frontend Vitest: 929 → 972 (+43; +2 F1, +5 F2c, +34 F3,
    plus 2 fixtures cleanup)
  - Walker plugin: 41 → 51 walker tests (+10 F2a tier-2 cases)
- 2 new E2E specs (reclassify, copy-toolbar) ready for Aster
  to run.
- 3 new lessons-learned rules.
- 0 STOP-blocking questions during implementation — user
  answered all five open questions upfront after the
  pre-inspection STOP gate, and the subsequent phases each
  surfaced their sub-decisions in the user-facing messages
  before code.

The session followed the "pre-inspection STOP gate then ship
per confirmed answers" workflow cleanly. F2a's arithmetic-
drift catch and F2c's Radix-happy-dom brittleness were the
two surprises that turned into lessons-learned rules; both
got documented before the close-out so the next session
benefits.

---

## Session continuation: CI-hygiene + mutmut audits (later same day)

Five additional work blocks landed after the v0.32.0 work
documented above. Closed in one extended session; tagged here for
completeness.

### 1. MUTMUT-OVERRIDES-COERCION-COVERAGE-01 (closed)

13 targeted unit tests added to
``backend/tests/test_overrides_yaml_loader.py`` covering every
branch of ``_allow_books_without_author_from_yaml``. Score lift
visible in the next mutmut run as 2156/2770 → 2179/2770 (77.8%
→ 78.7%). Commit ``c1eea87``.

### 2. MUTMUT-HANDLERS-OFFICE-WBT-COVERAGE-01 (closed)

Full triage of the office + wbt survivor pool (333 mutants).
Deleted dead ``_is_zip_epub`` (14 mutants gone), pinned
``_hard_delete_book`` overwrite paths in both handlers (24
mutants), tightened the primary_cover rejection test (3-4
mutants). Per-function verdict table in
``docs/audits/mutmut-2026-05-02-import.md``. Commit ``fd94117``.

### 3. MUTMUT-EXPAND-SCOPE-01 (closed)

Broadened mutmut scope to ``app/services/`` alongside
``app/import_plugins/``. Fresh run: 7526/9832 = 76.5% combined.
New ``test_platform_schema.py`` (21 tests) closes the 54-mutant
no-tests pool on the AR-02 Phase 2 platform validator. Three sub-
follow-ups filed (BACKUP-PROJECT-IMPORT-MUTMUT-01,
BACKUP-SERIALIZER-MUTMUT-01, GIT-BACKUP-MUTMUT-01). Commit
``0c8d24d``.

### 4. CI-hygiene Node 24 sweep (8 commits)

Standard GitHub Actions bumped to Node-24-native majors. Initial
sweep was 7 commits (``36dc56d..341dc82``) based on release-note
prose. Follow-up audit caught two pins (``upload-artifact@v5``,
``configure-pages@v5``) that still declared
``runs.using: 'node20'`` in their action.yml despite release-note
"Node 24 support" wording. Corrective commits ``098a54a`` +
``4bb79b0``, plus a lessons-learned correction (``413e7bb``) and
backlog filings. The
``FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`` env-var stayed in place,
now genuinely defensive.

### 5. Test-isolation regression + closing rules

The ``test_platform_schema.py`` autouse cache-clear fixture used
``return None`` instead of ``yield``, leaving the fake-schema
result in ``functools.lru_cache`` between test files. Cross-file
pytest ordering poisoned ``test_publications.py`` → 5 failures
caught by CI (Coverage run 25866316011), invisible to local
single-file runs. Hotfix ``48d3ffe`` flipped the fixture to
``yield`` for bidirectional clear. New lessons-learned section
(``f0c4be1``) + new backlog item ``TEST-ISOLATION-MODULE-STATE-01``
(P3) + ``CLAUDE.md`` "In-memory caches (third isolation layer)"
guidance for the institutional knowledge.

Plus periodic-audit reminder filed:
``GH-ACTIONS-PERIODIC-AUDIT-01`` (P5), trigger 2026-08-14 or any
GitHub-platform deprecation announcement.

### Session-end state

- Tip commit: this commit (closing-session housekeeping).
- ``main`` ahead of upstream until pushed.
- Open backlog tasks: 30 active (P2..P5) + 2 BLOCKED-on-upstream.
- CI green on the hotfix push (CI + Coverage both success at
  ``48d3ffec``).
- Three lessons-learned rules added today (action.yml
  authoritative for runtime, External GH Action drift,
  in-memory caches survive test boundaries).

Session tagged closing.

---

## Session continuation #2: UX-Full-Audit Group 1 (Core Editors)

Third major block of the day after v0.32.0 work + the CI-hygiene
sweep. User requested a systematic UX audit of the full Bibliogon
frontend (8 routes, 5 surface groups), explicitly Audit-B style
(running Bibliogon + 209-corpus + Playwright walkthrough), with
STOP gates between each surface group.

### Setup recorded for resume

```bash
# 1. Backend + frontend already running on :8000 / :5173 via the
#    user's local `make dev` (do NOT re-start without checking
#    `ss -tlnp | grep -E ':(8000|5173)'`).
# 2. Corpus already imported. Idempotency check (skip-on-reimport):
curl -F "file=@tmp/medium-export-2b0d2a60a17096f8a5eda39b89fe9722e92245fab55862dc870ab3754baeaaf4.zip" \
  http://localhost:8000/api/medium-import/import \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('imported:', d['imported_count'], 'skipped:', d['skipped_count'])"
# Expected after first import: imported: 198, skipped: 0
# Expected on re-import:       imported: 0,   skipped: 198
#
# 3. Run the audit walkthrough:
cd e2e && npx playwright test tests/ux-audit-group1.spec.ts --project=chromium --reporter=line
# Expected: 4 passed, 1 timed out (the BookEditor case — G1-F2 evidence)
```

### Group 1 — Complete

Findings: 4 IMPROVEMENT + 1 DEFER, 0 BLOCKER.

| ID | Severity | Title |
|---|---|---|
| G1-F1 | IMPROVEMENT | BookEditor lacks ALL testids (0 in 700 LOC vs 38 in ArticleEditor) |
| G1-F2 | IMPROVEMENT | BookEditor no empty-state UX for 0-chapter books |
| G1-F3 | IMPROVEMENT | No shared `<EmptyState>` component (4 ad-hoc impls) |
| G1-F4 | DEFER | Toolbar copy testid naming inconsistency |
| G1-F5 | DEFER | Save-badge i18n verification deferred to Group 4 |

Artifacts:
- `docs/audits/ux-full-audit-2026-05-14.md` (partial — Groups 2-5
  pending)
- `docs/audits/ux-full-audit-2026-05-14-screenshots/` (6 PNGs)
- `e2e/tests/ux-audit-group1.spec.ts` (walkthrough spec)

### Decision deferrals (per user direction)

- **Backlog filing for G1-F1/F2/F3 deferred until full audit
  complete** — Group 4's cross-cutting findings may re-prioritize
  Group 1 items.
- **Lessons-learned candidate parked for close-out**: the
  Articles-vs-Books asymmetry pattern now has 3 occurrences in
  today's data (bulk-delete cap removal, comments-count badge
  parity, BookEditor zero-testids). Candidate for a periodic
  parity-audit hygiene rule.

### Pause

3-4 more hours of audit deferred to a future session. Resume
cost is ~30s (dev backend + corpus import idempotent); the audit
spec + screenshots are reproducible.

Session re-closing.
