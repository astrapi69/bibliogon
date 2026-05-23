# Chat journal — 2026-05-12

UNIVERSAL-AI-TEMPLATE-01 Session 1: backend foundation for the
universal AI-template feature (Article + Book). 10 commits across
one session, all backend-only, all green at every step.

## Session frame

The user shipped this as a deliberately multi-turn brief: scope
brief → carry-forward refinement → 13 open-question gate → 12
sub-decision gate → commit-plan gate → execute. Each gate
included STOP-and-confirm before any code. The execute phase
was paused and resumed multiple times for prompt-budget reasons
between heavier commits.

## Entries

### 1. Scope brief + carry-forward refinement (09:11)

- Original prompt: "Universal AI-Template Export-Import for
  Articles and Books." Detailed multi-page spec with three
  workflows (built-in AI / custom local endpoint / external
  YAML round-trip), per-field-class selection, force-override,
  bulk operations. Carry-forward refinement clarified the
  three workflows as first-class equals (not primary +
  secondary) and elevated AI-provider Settings UI.
- Optimized prompt: as-shipped — the brief was already explicit
  about STOP gates and self-clarification rules.
- Goal: complete backend foundation in one session, defer
  frontend to Session 2.
- Result: 13-question pre-inspection report delivered, then 12-
  sub-decision pre-implementation gate, then 10-commit plan,
  then execution.

### 2. Pre-inspection report (09:18)

- Verified that Bibliogon's existing AI-provider abstraction
  supports custom OpenAI-compatible endpoints natively (LM
  Studio is a baked-in preset; `LLMClient.base_url` is endpoint-
  agnostic; `detect_provider` returns `"custom"` for unknown
  URLs). Workflow B reduced to "documentation + Settings-UI
  sugar" rather than new code.
- Audited Article and Book models for fillable surface; flagged
  the brief's assumed fields (`featured_image_prompt`,
  `inline_image_prompts`, `cover_image_prompt`,
  `chapter_summaries`) as not-yet-existing columns.
- Drafted 13 open questions covering schema fields, schema
  versioning, prompts location, bulk-fill execution model,
  provider choice, cost transparency, storage, file extension,
  help-doc scope, inline image count heuristic, Custom-Endpoint
  provider, three-button UX, LM Studio docs.

### 3. 12-sub-decision gate (09:32)

User accepted CC's recommendations with two refinements:
- Q11 elevated to (a)+(b): ship the AI-Provider Settings panel
  in Session 2 alongside docs.
- S4 chapter_summaries reconciliation made lenient: whitespace-
  normalized + case-insensitive title fallback, documented as
  intentional so future maintainers don't tighten it.

Two carry-forward clarifications also baked in:
- Migration docstring on the JSON-list-as-text precedent.
- Commit 9 estimate endpoint must surface per-item breakdown,
  not just totals.

### 4. Commit 1: DB migration + model columns (commit db1a283)

- Original prompt: implicit from the commit plan.
- Result: Alembic revision `e9f0a1b2c3d4` adds four columns
  via `batch_alter_table` (drift-test compatible). First
  iteration used `op.add_column("table", sa.Column(...))`
  which the existing `test_alembic_drift.py` regex doesn't
  recognize. Switched to the `batch_op.add_column(sa.Column(...))`
  convention all other migrations use; drift test passed.
- Tests: no new tests; fixtures pick up the columns via
  `Base.metadata.create_all`.
- Commit: `db1a283`.

### 5. Commit 2: template schema module + serializer (commit 123737a)

- Result: 870-line `app.ai.template_schema` module with
  Pydantic models, header constants, factories for empty +
  per-record templates, YAML serializer + parser,
  body-preview extractor moved from `articles.py`.
- Bug found mid-commit: blanket `exclude_none=True` was
  dropping `current_value: None` from fields, breaking the
  three-keys-per-field invariant. Fixed by switching to
  per-key exclusion of only the optional root keys
  (`reference`, `language`).
- `ArticleOut` schema gained the two new columns with a
  JSON-decoder validator parallel to `tags`.
- Tests: +27 (round-trip identity, UTF-8 preservation,
  schema validation, header invariants, body-preview
  truncation).
- Commit: `123737a`.

### 6. Commit 3: prompt modules (commit 08d2c1d)

- Result: `article_template_prompts.py` + `book_template_
  prompts.py` with one `(system, user)` builder per field-
  class. System prompts carry the cross-cutting invariants
  (YAML only, real UTF-8, respond in article language,
  leave null when uncertain). User prompts carry per-call
  context.
- Tests: +25 covering language presence in system prompts,
  title presence in user prompts, body-excerpt clamping,
  chapter-excerpt clamping at 600 chars for the book
  chapter-summaries prompt, optional-metadata suppression,
  `__all__` export surface.
- Commit: `08d2c1d`.

### 7. Commit 4: per-article ai-template endpoints (commit 8baf378)

- Result: `GET /api/articles/{id}/ai-template`,
  `POST /api/articles/{id}/ai-template`,
  `GET /api/ai-templates/article`. Two-router file pattern
  (per-article + empty) to avoid prefix collision with the
  existing `/api/templates/` namespace.
- Tests: +19 covering header presence, reference-block shape,
  ASCII slug derivation, empty-vs-per-article invariants,
  force-override per S6, AI-null-always-skip, schema_version
  + type validation (400), malformed YAML (400), empty body
  (400), 404 on unknown article, export → import idempotence.
- Commit: `8baf378`.

### 8. Commit 5: per-article ai-fill endpoint (commit 121a941)

- Result: `POST /api/articles/{id}/ai-fill` with 5 field-
  classes. Per-class failure isolated via try/except around
  the LLM call. Token + cost accounting bumps
  `Article.ai_tokens_used` even when no field updated (real
  spend matters more than write count). YAML-fragment parser
  tolerates markdown fences.
- inline_image_count heuristic: H2 count, clamped [1, 5].
- Tests: +21 covering AI-disabled (403), no-content (400),
  unknown field-class (400), empty list (422), per-class
  happy paths, multi-class call (3 LLM calls), per-class
  isolation, token accumulation, cost known vs unknown
  model, force semantics, AI-null-skip, markdown-fence
  parsing, malformed-YAML tolerance.
- Commit: `121a941`.

### 9. Commit 6: per-book ai-template endpoints (commit 846de1f)

- Result: same shape as commit 4 but for Book, with the
  chapter_summaries reconciliation pipeline per S4. Lenient
  title matcher accepts Schreibweise-Variationen. Dropped
  entries surface separately so the UI can render them.
- "all-entries-dropped" is a distinct skip_reason from
  "value-is-empty" — the UI must be able to tell the user
  "5 summaries submitted, 0 matched a chapter" vs. "you
  submitted nothing".
- BookOut gained `cover_image_prompt` + `chapter_summaries`
  with a JSON-decoder validator.
- Tests: +16 covering the full reconciliation matrix.
- Commit: `846de1f`.

### 10. Commit 7: per-book ai-fill endpoint (commit 1c14776)

- Result: `POST /api/books/{id}/ai-fill` with 5 book field-
  classes. Body text aggregated across chapters (no single
  content column). chapter_summaries flows through the
  reconcile pipeline so AI-fabricated chapter_ids are dropped
  before any column write.
- Tests: +17.
- Commit: `1c14776`.

### 11. Commit 8: bulk ZIP export + import (commit 209ae10)

- Result: 4 endpoints in a single router file (mirrors the
  `bulk_delete.py` pattern of one module / two routers).
  Cap MAX_BULK_AI_TEMPLATE = 50 enforced via Pydantic
  max_length on export AND a runtime ZIP-entry counter on
  import. Filename dedup on title collision (`-2`, `-3`, ...).
  Per-entry failure isolation matches the Medium-importer
  response shape.
- Tests: +15.
- Commit: `209ae10`.

### 12. Commit 9: bulk AI-fill SSE + estimate (commit 5a01c4f)

- The heaviest commit by far. Refactored commits 5 + 7's
  endpoints to extract `fill_article_with_ai` /
  `fill_book_with_ai` service functions; the existing
  endpoints became thin wrappers, the bulk worker reuses the
  same logic.
- Per-item cost-estimate endpoint per the carry-forward Q6:
  every item lists every requested field-class with its
  input tokens, output tokens, per-class USD cost; per-item
  totals are the sum; overall totals are the sum across
  items.
- Output-token heuristics per class (200 SEO, 600
  image_prompts, 50/chapter for chapter_summaries, etc.)
  intentionally conservative to avoid surprising the user.
- Start endpoint submits via `job_store.submit`; SSE stream
  drains via `job_store.subscribe`. First test pass failed
  with `RuntimeError: no running event loop` because the
  start endpoint was sync — `job_store.submit` calls
  `asyncio.create_task` which needs an active loop.
  Made the endpoint `async def` per the existing
  `review_chapter_async` precedent in `app/ai/routes.py`.
- Rate-limit pacing reads `ai.rate_limit_seconds` from
  config; tests stub it to 0.
- Tests: +20 covering estimate per-item shape, cost-known
  vs cost-None, missing ID (404), unknown field-class (400),
  cap (422), start returns job_id and completes, full SSE
  event sequence, per-item LLM-error isolation,
  no-content → item_skipped, force propagation,
  ai_tokens_used per-item bump.
- Commit: `5a01c4f`.

### 13. Commit 10: backlog + help-doc stubs + lessons-learned (this commit)

- Help-doc stubs at `docs/help/{en,de}/ai/ai-templates.md`
  with placeholder text marking screenshots + LM Studio /
  Ollama walkthroughs as Session 2 follow-ups.
- `docs/help/_meta.yaml` updated: AI Assistant section gained
  the new `ai/ai-templates` child entry.
- Backlog: filed `UNIVERSAL-AI-TEMPLATE-02` (P2, frontend
  session) and `AI-FILL-CAP-CONFIG-01` (P5).
- Archive: full Session 1 summary moved to
  `docs/roadmap-archive/2026-05.md` under the 2026-05-12
  section.
- Lessons-learned: added "AI-prompts embedded in data files
  beat per-call system-prompts for portability" — the
  three-workflows-share-one-format insight generalizes.

## Statistics

- Commits: 10 (db1a283..5a01c4f + this one).
- Backend tests: 1423 → 1531 (+108).
- Frontend tests: 759 → 759 (no frontend work in this session).
- New files: 10 (4 routers, 3 prompt/schema modules, 5 test
  modules, 1 migration, 2 help-doc stubs).
- Edited core files: `app/models/__init__.py`,
  `app/schemas/__init__.py`, `app/main.py`,
  `app/routers/articles.py`.
- Lines added: ~7800 (per `git diff --stat` against the
  pre-session HEAD).

## Verification round-trip

Manual verification was deferred to Session 2 because no UI
exists yet. Programmatic verification: `make test` green at
every commit; integration tests round-trip through the actual
endpoints with `TestClient` and an in-memory SQLite, so the
export → edit → import path is exercised end-to-end (e.g.
`test_export_then_import_is_a_no_op_with_default_force`,
`test_book_bulk_import_applies_and_drops_phantom_summaries`,
`test_article_start_emits_full_event_sequence`).

## Self-clarification rule outcomes

- All 13 open questions surfaced before commit 1 and answered
  by the user.
- All 12 sub-decisions surfaced after commit-plan delivery,
  answered before commit 1.
- Two carry-forward clarifications baked into the relevant
  commits (1 + 9).
- No silent guesses; every place where a small judgment call
  was made (e.g. "all-entries-dropped" vs "value-is-empty"
  distinction in commit 6) was documented inline in the
  source.

## Status at end of session

- Backend: feature-complete for Session 1. All 6 single-item
  endpoints (3 per type), all 2 bulk-template endpoints
  (export/import per type), all 4 bulk-fill endpoints
  (estimate / start / SSE / poll per type) live and tested.
- Frontend: nothing yet; Session 2 backlog item
  `UNIVERSAL-AI-TEMPLATE-02` carries the full plan.
- Tests: 1531 backend + 759 frontend, both green.
- No new dependencies introduced.
