# Chat journal — 2026-05-12 (Session 2)

UNIVERSAL-AI-TEMPLATE-02 — frontend for the AI-template feature
whose backend Session 1 landed earlier the same day. 10 commits
across one extended session, all green at every step.

## Session frame

Same gate-by-gate pattern as Session 1. F-question pre-inspection
(9 questions) confirmed with two refinements before code shipped.
Each commit paused for budget reasons and resumed in a fresh
turn. The user supplied "proceed" / "resume" between commits;
no implementation work happened without explicit confirmation
of the prior gate.

## Entries

### 1. F-question pre-inspection (09:11)

- Original prompt: "proceed" — picking up Session 2 from the
  plan in Session 1's commit 10 backlog entry.
- Goal: 9 F-questions resolved before any code.
- Result: F1 (extend existing AI tab), F2 (sidebar placement
  below metadata editor), F3 (ship from-template endpoints in
  Session 2 not deferred), F4 (hybrid threshold w/ inline
  constant), F5 (persistent dock not full-screen modal), F6
  (ai_template: i18n block × 8), F7 (descriptive screenshot
  anchors), F8 (lmstudio note translated), F9 (~30-40 tests +
  3 smoke specs) — all accepted with two refinements
  (INLINE_BREAKDOWN_THRESHOLD = 10 inline constant; screenshot
  anchors descriptive enough for reproduction by any
  maintainer).
- Plus two parked items: BULK-AI-FILL-LIVE-COST-01 (defer),
  temperature/max_tokens disclosure (verify against existing
  ai_wizard in commit 9 — dismissed because the existing AI
  tab already covers both).

### 2. Commit 1 — API client (`026674a`, 09:18)

- Added TypeScript types mirroring every Session 1 response
  shape: ApplySkipReason, AiFillResponse, BulkAiFillEstimate,
  BulkAiFillEvent (discriminated union), etc.
- 14 new methods under `api.{articles,books}` nested
  namespaces (aiTemplate.{export,import,empty}, aiFill,
  bulkAiTemplate.{export,import}, bulkAiFill.{estimate,start,
  streamUrl,status}).
- Blob downloads use fetch directly (binary bypasses the JSON
  wrapper); ZIP uploads via FormData; ApiError surfaces on
  non-2xx.
- 22 new Vitest tests.

### 3. Commit 2 — FieldClassDialog + DropZone (`2299e41`, 09:32)

- FieldClassDialog: Radix Dialog with article + book variants,
  force toggle, clamped inline-image-count override.
- TemplateImportDropZone: drag-drop + click-picker + mode-aware
  (.biblio.yaml vs .zip) extension validation, inline error on
  reject.
- 28 new tests covering checkbox state, force toggle, file-
  drop, validation rejection + recovery.
- One TS signature mismatch on `vi.fn()` mock fixed via
  intersection-type cast.

### 4. Commit 3 — AITemplatePanel (`2148203`, 09:45)

- Three first-class buttons (per F2): Fill / Export / Import.
- Three toast variants per outcome (success / partial / info).
- Book chapter-summaries dropped-list surfaces as follow-up
  info toast.
- 15 new tests. `vi.hoisted()` pattern for the `notify` + `api`
  mocks because vi.mock is hoisted before module-level const
  declarations.

### 5. Commit 4 — Article editor sidebar + from-template (`41396be`, 10:00)

- Backend: POST /api/articles/from-ai-template (201 +
  ArticleOut). Reuses `_apply_template_to_article` from
  Session 1 commit 4 with force=True since every column starts
  empty on a fresh row.
- Frontend: AITemplatePanel mounted in ArticleEditor sidebar
  between PublicationsPanel and the export section per F2.
- Frontend: NewFromTemplateButton (two-step download-empty /
  upload-filled dialog) added to the Articles dashboard.
- 9 backend tests + 11 frontend tests.
- The book backend endpoint is filed for commit 5; the typed
  surface lands here so frontend code doesn't churn.

### 6. Commit 5 — Book editor + from-template (`60b6f1e`, 10:18)

- Backend: POST /api/books/from-ai-template with author
  validation delegated to existing
  `_allow_books_without_author` / `_validate_author`.
- Frontend: new "AI Template" tab (8th) in BookMetadataEditor,
  NewFromTemplateButton on Books dashboard.
- New `onRefresh?` prop on BookMetadataEditor lets the AI panel
  trigger a parent re-fetch after Fill / Import.
- 10 backend tests + 1 frontend tab-count test updated.
- Initially had a hacky `onSave({_refresh_only: true})`
  workaround; reverted in favor of the proper `onRefresh`
  prop.

### 7. Commit 6 — Bulk action bar AI buttons (`e149c19`, 10:30)

- AI dropdown on both ArticleBulkActionBar and
  BookBulkActionBar (sparkles trigger, cap-disabled above 50).
- New `BulkTemplateImportDialog` reusable component (ZIP-only
  intake, three-shape toast: all-failed / partial / success).
- Dashboard wiring for both flows.
- 17 new tests. Radix DropdownMenu's pointer-event open gesture
  doesn't reproduce in happy-dom, so the bar tests pin
  prop-threading without driving the menu open (the Playwright
  smoke in commit 10 covers the actual menu open + click).

### 8. Commit 7 — BulkAiFillJobContext + dock (`2687a0f`, 10:48)

- SSE listener in the context per the AudiobookJobContext
  lessons-learned (modal/dock are pure consumers).
- localStorage F5-recovery: persisted {jobId, kind} reconnects
  on mount.
- BulkAiFillDock: minimized bottom-left badge with progress
  bar + currentTitle; expanded full per-item modal with totals
  strip + status glyphs (Loader2/CheckCircle/Clock/AlertCircle).
- 19 new tests (13 context + 6 dock).
- Mounted in App.tsx alongside the existing audiobook
  provider.

### 9. Commit 8 — Bulk-fill confirm dialog (`440a9d3`, 11:18)

- `BulkAiFillConfirmDialog` calls /estimate, renders per-item
  cost breakdown per Q6.
- `INLINE_BREAKDOWN_THRESHOLD = 10` declared inline at the top
  of the file per F4's refinement so UX can adjust without
  hunting through component logic.
- Totals strip (items, calls, input/output tokens, cost,
  model). Cost-unknown disclaimer when the configured model
  isn't in the pricing table. Estimate error inline keeps the
  dialog open + Start disabled.
- Confirm calls /start, hands off to BulkAiFillJobContext,
  closes itself; dock takes over.
- Dashboard glue: AI dropdown's "Bulk AI fill" item opens
  FieldClassDialog → confirm dialog → start.
- 10 new tests.
- Bug fix mid-commit: `t` (i18n helper) in effect deps caused
  perpetual cancel + refetch in tests because the mock returns
  a fresh `t` per render. Removed from deps with
  `eslint-disable-next-line` + comment. Lessons-learned entry
  filed.

### 10. Commit 9 — AI-Provider Custom preset + i18n × 8 (`5b95615`, 11:32)

- New "custom" preset in aiProviders.ts (empty defaults,
  preset-select handler skips auto-fill for custom).
- Provider dropdown labels routed through
  `t("ui.settings.ai_provider_${pid}", preset.label)`.
- i18n × 8: new ai_provider_* keys + ai_template + bulk_ai_fill
  blocks (~149 lines each). EN + DE fully translated, other 6
  catalogs carry EN per the AUTO_TRANSLATED convention. 48 i18n
  parity tests pass; the 16 advisory "untranslated heuristic"
  warnings are non-blocking.
- The parked temperature/max_tokens question dismissed: the
  existing AI tab already covers both.
- 1 new test (custom-preset shape).
- aiProviders.test.ts pre-existing assertions updated (5
  providers -> 6, custom-base_url exemption).

### 11. Commit 10 — Help docs + smoke spec + journal (this commit)

- Full help docs in EN + DE: replaced Session 1's scaffold
  stubs with comprehensive content covering all three
  workflows, field-classes, per-record + bulk flows, cost
  estimate UI, dock + F5 recovery, AI Settings configuration,
  LM Studio + Ollama walkthroughs with shell snippets, schema
  reference, troubleshooting. 18 descriptive screenshot
  anchors per F7's "reproducible by any maintainer"
  refinement.
- New Playwright smoke `e2e/smoke/ai-template-roundtrip.spec.ts`
  covering workflow C end-to-end on the article side: sidebar
  panel render, export download, import dialog, New-from-
  template dialog, bulk AI dropdown trigger. Workflows A + B
  need a real or mocked LLM and live in a separate session.
- Backlog: archived UNIVERSAL-AI-TEMPLATE-02 to the
  2026-05.md monthly bucket. Filed BULK-AI-FILL-LIVE-COST-01
  under P5.
- Lessons-learned: three entries — useEffect deps + i18n test
  mocks (the bug fixed in commit 8), three-workflows-share-
  one-format UI pattern, SSE-in-context-not-modal
  re-validation.

## Statistics

- Commits: 10 (026674a..this commit).
- Backend tests: 1531 → 1550 (+19 from commits 4 + 5).
- Frontend tests: 759 → 882 (+123 over the session).
- New frontend files: 9 (4 dialogs/panels, 1 context, 1 dock,
  3 test files associated; plus 1 reusable button).
- New backend code: 2 endpoints (POST /api/{articles,books}/
  from-ai-template).
- Edited backend files: `app/routers/{article,book}_ai_template.py`
  (added the from-ai-template endpoint), `app/schemas/__init__.py`
  (cover_image_prompt + chapter_summaries already in BookOut from
  Session 1 commit 6).
- i18n catalogs: all 8 updated (+149 lines per catalog from
  ai_template + bulk_ai_fill blocks; +7 keys per catalog from
  ai_provider_*).
- Help docs: 2 files (EN + DE) replaced; ~530 lines per locale
  including LM Studio + Ollama walkthroughs.
- Playwright smoke: 1 new file with 5 tests.
- New dependencies: none.
- Lines added: ~10,000 (per `git diff --stat` against the
  pre-Session-2 HEAD).

## Verification round-trip

Frontend `npx tsc --noEmit` clean after every commit. Frontend
`npx vitest run` green after every commit (882 final). Backend
`make test` green at commits that touched backend (4, 5). i18n
parity test green after the bulk catalog update in commit 9.
Playwright smoke ships in commit 10 for the user to run against
the live dev server.

## Self-clarification rule outcomes

- All 9 F-questions surfaced and answered before commit 1.
- Two refinements (F4 named constant, F7 descriptive anchors)
  baked into commits 8 and 10 respectively.
- Two parked items resolved during the session:
  temperature/max_tokens dismissed (already covered),
  BULK-AI-FILL-LIVE-COST-01 filed as P5 in commit 10.
- One mid-commit bug surfaced (i18n `t` in effect deps) +
  documented in lessons-learned.
- No silent guesses; every judgement call surfaced inline.

## Status at end of session

- Frontend: feature-complete. AITemplatePanel renders in
  article + book editors; both dashboards expose New-from-
  template + bulk AI dropdown + bulk fill flow with progress
  dock.
- Backend: 2 new endpoints from commits 4 + 5; rest unchanged
  from Session 1.
- i18n: 8 catalogs in full parity; EN + DE primary, others
  EN-text with the AUTO_TRANSLATED convention.
- Help docs: comprehensive, with LM Studio + Ollama
  walkthroughs and 18 screenshot anchors waiting for the user
  to capture.
- Tests: 1550 backend + 882 frontend, both green at every
  commit.
- Smoke spec: 1 file with 5 tests covering workflow C.
  Workflows A + B (live LLM or mocked) deferred to a follow-up
  session once the test infra carries the right route mocks.
- No new dependencies.
