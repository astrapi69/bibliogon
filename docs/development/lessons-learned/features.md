# Lessons learned: Features and product behaviour

Bulk operations, audiobook, AI providers, half-wired features, parallel surfaces, i18n.

Index of every entry: `.claude/rules/lessons-learned.md`. Moved here from that file unchanged (#1141).

## Bulk-operation limits should be per-operation cost-profile

The bulk-delete feature shipped with a 200-row cap copied from the existing `bulk-export` precedent. First real use surfaced the symptom: with 209 imported articles, "Alle auswählen" tripped the cap and both Export AND Löschen disabled. Export's cap is justified (pandoc per row + asset round-trips → minutes); delete's was not (one DB UPDATE / DELETE per row → sub-second).

Rule: every new bulk-operation must justify its limit against its own cost profile, not copy the neighbour's. Concretely:

- **Compute-heavy operations** (pandoc, TTS synth, image processing, AI calls): cap stays. Picked from "what completes in 60-180 s server-side per batch."
- **DB-bound operations** (soft-delete, hard-delete, status toggle, tag attach): **uncapped** by default. SQL bulk operations scale to thousands of rows trivially; an artificial cap creates the worst-of-both UX where "select all" tells the user they cannot do what they obviously want to.
- **Network-bound external operations** (publish-to-platform, sync-to-git): cap reflects the slowest external call's timeout, not the local processing.

Anti-pattern observed and rejected: "uniform cap across all bulk operations so the UX is consistent". The cost profile is what dominates the UX; pretending all operations have the same profile **is** the inconsistency.

Concrete change from this incident: `MAX_BULK_DELETE` removed from `backend/app/routers/bulk_delete.py`. Pydantic field keeps `min_length=1` (empty body stays a 422) but drops `max_length`. The frontend Löschen button gates on `count < 2` only — no `overLimit` check. Bulk-export's `BULK_LIMIT_HARD = 200` stays unchanged because pandoc's cost-profile is real.

## Bulk-action UX: action-bar + selection-hook decoupling stays useful

The bulk-delete feature shipped fast because the existing `ArticleBulkActionBar` / `BookBulkActionBar` + `useArticleSelection` / `useBookSelection` hooks were already decoupled from any specific operation. The hook holds `Set<string>` of selected IDs plus filter-aware `selectAll(ids)` that takes an explicit list. The bar is pure-presentational, taking the count + handlers. The page wires whatever operation it wants.

Adding bulk-delete meant adding two optional props (`onBulkDelete`, `onBulkDeletePermanent`) to each bar and the corresponding handlers in the page. No restructuring; no risk to the existing bulk-export flow; no changes to the selection hook.

Rule for future bulk operations (bulk-edit-status, bulk-tag, bulk-export-variant, etc.):

- Add optional handler props on the bar. Don't push operation-specific UI into the hook.
- Selection state stays orthogonal to the operations that consume it.
- Filter-aware `selectAll` callers (`filters.filteredArticles.map(a => a.id)`) are the canonical "operate on the visible-after-filter set" pattern. Don't second-guess; future bulk operations will want exactly this.

What NOT to do:
- Don't add per-operation state to the selection hook (e.g. `useArticleSelection` should never know whether the current operation is "delete" vs "export").
- Don't fork the bar into per-operation components (`ArticleBulkDeleteBar` is wrong; one bar that takes operation handlers is right).
- Don't centralize bulk-operation logic into a higher-order component. The page-level handlers (each with its own toast / refresh / error semantics) are the right place. Centralizing it would force every operation to fit one shape.

## Bulk operations earn page-route UX even when single-item siblings use modals

Existing import surfaces in Bibliogon are modals (`ImportWizardModal` opened from Dashboard + ArticleList — single book, single article, single project, single git repo). The new `/articles/import/medium` page deliberately diverges to a top-level route. The deciding factors:

1. **Bulk operations have multi-minute processing time.** A single-item import is sub-second to a few seconds; a 200-post Medium archive with image downloads runs 30-60 seconds (often longer). A modal that locks the screen for that long is hostile.
2. **Structured results need review surface, not just acknowledgement.** Single-item imports produce one outcome ("imported" or "failed"); bulk imports produce a 3-section table (imported / skipped / errored) the user genuinely reads, sometimes for several minutes.
3. **Stable URL matters for help-doc deep links.** "Open Bibliogon → Articles → click Importieren button → select Medium" is multi-step verbal instruction; a direct URL is one click. For features with longer learning curves (the Medium import has 4 settings worth explaining) the help-doc anchor is real value.
4. **Pattern-adherence is not an end in itself.** Diverging knowingly for a use-case-specific reason is fine; diverging by accident is not. The decision was surfaced explicitly to the user — including the audit-finding that the original "matches existing pattern" reasoning was based on a misconception (no `/import` route existed) — and confirmed before any code shipped.

When choosing route vs modal for a new import / batch surface:
- Sub-second processing + single-result outcome → modal, match the import-wizard pattern.
- Multi-second-to-minute processing + structured table outcome + worthwhile help-doc surface → page route, document the divergence in the commit + an archive entry.

## Voice dropdown: NO engine-agnostic fallback

- Previously `BookMetadataEditor` and `Settings` fell back to a hardcoded `EDGE_TTS_VOICES` list when `/api/voices?engine=X&language=Y` returned an empty array. Effect: user picks Google TTS / pyttsx3 / ElevenLabs, the backend cache has no voices for those engines (only Edge is seeded via `sync_edge_tts_voices`) -> frontend dumps 16 Edge-DE voices into the dropdown even though the engine cannot play them. Bug report was "dropdown shows ALL voices instead of only the matching ones".
- Solution: a shared helper `api.audiobook.listVoices(engine, language)` tries `/api/voices` (cache) first, then `/api/audiobook/voices` (live plugin endpoint), then returns `[]`. NO more hardcoded list. Both UI sites render a clear empty state "No voices available for {engine} in {language}" on `voices.length === 0` instead of faking something.
- `frontend/src/data/edge-tts-voices.ts` was deleted entirely. If a user really wants to see Edge-DE voices, Edge is the only engine the backend cache seeds and the dropdown fills through the normal path.
- Backend `voice_store.get_voices` now matches in two steps: if the `language` contains a hyphen (`"de-DE"`), it is an exact case-insensitive match. A bare code (`"de"`) is a prefix match (`de-DE`, `de-AT`, `de-CH`). Previously it always stripped the region suffix, so `"de-DE"` and `"de"` returned the same result - irrelevant for Bibliogon's current data model (Book.language is a bare code), but the strict variant protects plugin tests and future callers.
- Tests: `backend/tests/test_voice_store.py` (8 tests) covers every path (engine isolation, bare vs region, case insensitivity, unknown engine, unknown language, engine-leak regression). `frontend/src/api/client.test.ts` pins that the helper returns NO hardcoded Edge fallback on `[]` from both endpoints - this is the regression insurance against the original symptom.

## Audiobook progress dialog: the SSE listener belongs in the context, not in the component

- Previously the `EventSource` lived in the `AudioExportProgress` modal. As soon as the user minimized or a re-render happened, the listener was rebuilt and events were lost - or worse, the job was gone after `clear()` because the modal was the only place holding live state.
- Solution: the entire SSE lifecycle (open/onmessage/close) now lives in `AudiobookJobProvider`. Phase, event log, current/total/currentTitle, downloadUrl/chapterFiles - everything is in the context. Modal and badge are pure consumers and do not talk to each other.
- Reload recovery: jobId+bookId+bookTitle are mirrored into `localStorage` (`bibliogon.audiobook_job`). On provider mount a `useEffect` checks whether a persisted job exists and reactivates the SSE connection. The badge reappears after F5, the modal stays minimized (no pop-up in the user's face).
- The persisted entry is cleared on the `stream_end` event. Otherwise a reload would bring back a job that already finished.
- Important convention: chapter numbers are pure display logic. `formatChapterPrefix(index, total)` builds "01 | Foreword" / "003 | Foreword" - the TTS engine still only gets the bare chapter title, no number, no pipe. The SSE event carries `{type, index, title, duration_seconds}` as separate fields; the frontend does the formatting. A test in `tests/test_generator.py` pins that `chapter_done` ships a `duration_seconds` field, a Vitest test in `AudioExportProgress.test.ts` pins that the frontend NEVER renders "Chapter X:".
- BookEditor now reads `?view=metadata` from `useSearchParams`, so the badge can call `navigate("/book/{id}?view=metadata")` after completion and the tab is already open. `setShowMetadata` was wrapped into `_setShowMetadata` that keeps the query param and state in sync.

## Generated audiobook files must be persisted

- Before v0.10.x exported audiobook MP3s only existed in the job worker's temp dir. As soon as the user closed the progress dialog the only copy was gone - with ElevenLabs (paid) this is real data and money loss.
- Solution: after a successful `_run_audiobook_job`, all generated files are copied to `uploads/{book_id}/audiobook/` (chapters/ + audiobook.mp3 + metadata.json). The endpoints `GET/DELETE /api/books/{id}/audiobook` plus `/merged`, `/chapters/{name}` and `/zip` expose them again for download.
- Important: persistence runs inside `try/except` and must NEVER fail a successful job. Prefer logging; the file is still downloadable from the temp dir.
- The persistence endpoints live in the backend core (`backend/app/routers/audiobook.py`), NOT in the audiobook plugin. This keeps downloads accessible regardless of plugin state.
- Regeneration warns before overwriting: `POST /api/books/{id}/export/async/audiobook` responds with HTTP 409 + `{code: "audiobook_exists", existing: {engine, voice, created_at, ...}}` as soon as `audiobook_storage.has_audiobook(book_id)` is true. The frontend shows a confirm dialog with the existing metadata and calls the same endpoint again with `?confirm_overwrite=true`.
- Plugin setting `audiobook.settings.overwrite_existing: true` skips the 409 - user request: "there is also a config for the overwrite but the warning should stay", so the frontend confirm is kept as a second safety net.
- Backup: `GET /api/backup/export?include_audiobook=true` includes the persistent audiobook directories. Default is false because MP3 backups quickly grow to 100+MB per book.

## ElevenLabs API key does NOT belong in .env

- The ElevenLabs API key was previously read only from the `ELEVENLABS_API_KEY` env var. That is opaque for users: no UI, no test button, no error message when the key is missing.
- Solution: `audiobook.yaml` now has an `elevenlabs.api_key` block, fed through `POST /api/audiobook/config/elevenlabs` (verified before save against `GET https://api.elevenlabs.io/v1/user`). `tts_engine.set_elevenlabs_api_key()` gets the key on plugin activate and on every POST.
- The env var stays as a fallback - existing installations with `.env` do not break.
- The key is NEVER returned in clear text in GET responses. The frontend only shows `{configured: bool}` and offers a "key stored" indicator + delete button.
- These endpoints live in the backend core like the persistence endpoints, so key management stays accessible regardless of plugin state.

## Audiobook export is async with SSE progress

- The endpoint `POST /api/books/{id}/export/audiobook` must NEVER return an MP3 synchronously. Audiobook generation takes minutes; any synchronous path blocks the request thread and gives the user nothing visible.
- Required shape: the client sends `POST /api/books/{id}/export/async/audiobook`, gets back `{job_id}`, and subscribes to `GET /api/export/jobs/{job_id}/stream` (Server-Sent Events).
- The old sync route `GET /api/books/{id}/export/audiobook` now intentionally responds with HTTP 410 + a pointer to the async path. The regression test `test_sync_audiobook_route_returns_410` fires if anyone turns the endpoint back on.
- Progress events emitted by the generator: `start`, `chapter_start`, `chapter_done`, `chapter_skipped`, `chapter_error`, `merge_start`, `merge_done`, `merge_error`, `done`. The route wrapper adds `ready` (with `download_url`) and `JobStore.update()` appends the synthetic `stream_end` so SSE subscribers exit cleanly.
- Frontend uses the browser-native `EventSource` (no package required). The modal is `modal=true` and cannot be dismissed via Escape/click-outside until the job is in a terminal status - otherwise the user orphans jobs with a stray click.
- Generator callbacks must never kill the export: `progress_callback` calls are wrapped in `try/except` and only log. A broken subscriber must NOT destroy an hour of TTS work.
- Tests must run through `with TestClient(app) as c:`, otherwise FastAPI's lifespan does not fire and the plugin manager never mounts the audiobook/export routes (404 instead of 410). Always mock the TTS engine via `patch("bibliogon_audiobook.generator.get_engine", ...)`.

## Content-hash sidecar files as a "was this already processed?" pattern

- The audiobook generator writes a `.meta.json` sidecar next to each chapter MP3 containing `{content_hash, engine, voice, speed}`. The hash is SHA-256 of the plain text extracted from TipTap JSON. On re-export, `should_regenerate()` reads the sidecar and compares all four fields. A mismatch on any field triggers regeneration; a full match lets the generator reuse the existing file with zero TTS cost.
- This pattern generalizes: any long-running deterministic process where re-running on unchanged input is wasteful can use sidecar fingerprint files. The sidecar stays next to the output artifact, travels with it through copy/persist operations, and is authoritative for "is this output still current?" decisions.
- Key design decision: the sidecar includes ALL parameters that affect the output (content + engine + voice + speed), not just the content hash. Changing from Edge-TTS to ElevenLabs with the same text invalidates the MP3 even though the text is identical. Always fingerprint the full parameter set.
- Pre-audit for the three-mode regeneration dialog assumed a new DB schema was needed for content-hash tracking. The sidecar files already provided it. Lesson: before designing new infrastructure, check whether existing persistence artifacts already carry the information you need.

## AI Review extension (v0.20.0)

### Backup import must check soft-delete state before dedup

- `backup_import._restore_book_from_dir` previously treated any pre-existing `Book.id` in the DB as "already imported" and returned False. That check predates the soft-delete / trash feature: a backup made before trashing silently could not be restored once the books had been moved to trash - the importer saw them in the DB (with `deleted_at` set) and refused to rebuild.
- Fix: when the pre-existing row is soft-deleted, HARD-delete it along with its chapters + assets, then fall through to the fresh-insert path. Do NOT try to revive via per-attribute setattr: the backup JSON does not carry every NOT NULL column (`ai_tokens_used`, `created_at`, `updated_at`), so SQLAlchemy emits an UPDATE that sets those to NULL and the integrity constraint trips. Hard-delete + fresh-insert sidesteps the whole partial-update dance and matches the backup's snapshot semantics.
- Generalizes: any "idempotent by id" import path added before a soft-delete feature becomes silently buggy. Always branch on `deleted_at IS NULL` when deduping.

### manuscripta `run_export` moves `output/` to `backup/` on every call

- `manuscripta.export.book.run_export` copies the existing `project_dir/output/` to `project_dir/backup/` at the start of every invocation and creates a fresh `output/`. A list of per-format output paths collected across a batch-export loop contains stale paths by the time the loop finishes.
- Symptom in v0.19.x: `FileNotFoundError` at `zipfile.ZipFile.write(f, f.name)` inside `/api/books/{id}/export/batch`, referencing a file that existed moments earlier.
- Fix: after each `run_pandoc` call, IMMEDIATELY copy the produced file into a stable staging directory (`tmp_dir/batch/`) and zip from there. Do NOT keep references to files under `project_dir/output/` across subsequent `run_export` calls.

### Pandoc-wrapped metadata.yaml is a multi-doc YAML stream

- The project exporter wraps `metadata.yaml` in Pandoc-style `---` / `---` document markers. PyYAML's `safe_load` expects exactly one document and raises `yaml.composer.ComposerError` on any trailing `---` (even if the second document is empty).
- Fix: use `yaml.safe_load_all(f)` and return the first non-empty document. Handles both the bare and the Pandoc-wrapped shapes in one code path.
- Regression: `smart_import` crashing with 500 on a ZIP that `/api/backup/export` had just produced.

### CSS specificity trap: `h2 + p` loses to `p:not(:first-child)`

- Specificity for `[data-app-theme="classic"] .ProseMirror h2 + p`: (0, 1, 1, 2) - 1 attr, 1 class, 2 elements.
- For `[data-app-theme="classic"] .ProseMirror p:not(:first-child)`: (0, 1, 2, 1) - 1 attr, 1 class + 1 pseudo-class = 2 "classes", 1 element. The pseudo-class pushes the base rule ahead of the adjacent-sibling override.
- When both rules match (a paragraph that directly follows a heading AND is not the first child), the higher-specificity `:not(:first-child)` wins and the heading override never applies.
- Fix: append `:not(:first-child)` to each `h* + p` override. Combined (0, 1, 2, 2) beats the base (0, 1, 2, 1).
- Generalizes: any CSS override against a `:not(:first-child)` base rule needs at least the same pseudo-class weight.

### TipTap `useEditor` does NOT flush `editor.storage` reads to React

- Inline reads like `{editor?.storage.characterCount?.words()}` in JSX do not update reliably on every content transaction. TipTap's built-in re-render fires on selection changes, not every content edit.
- Two viable patterns:
  1. **`useEditorState` selector** (TipTap-idiomatic). Wraps `useSyncExternalStore`, subscribes to the editor's transactionNumber, re-runs the selector per transaction.
  2. **`useState` + `editor.on('update')` listener** (plain React). Manually `setWordCount(...)` on every update event.
- Choose pattern 2 when running under React `StrictMode` + Playwright + Vite dev server. `useSyncExternalStore` under that combination produced stale renders even though storage updates fired (issue #12). The plain-listener path bypasses `useSyncExternalStore` entirely. `frontend/src/components/Editor.tsx` uses pattern 2.
- Cleanup: always pair `editor.on('update', cb)` with `editor.off('update', cb)` in the same `useEffect` cleanup to avoid leaks across hot-reload cycles.

### Prefix testid selectors match every nested testid that shares the prefix

- A selector like `[data-testid^='book-card-']` cleanly matches each card root AND every nested child testid that shares the prefix (`book-card-menu-{id}`, `book-card-menu-delete-{id}`). `toHaveCount(N)` returns `2N` or more per visible card.
- Fix: `[data-testid^='book-card-']:not([data-testid*='-menu-'])`, or give the root a distinct testid like `book-card-root-{id}`.
- Same shape as the `[class^=""]` overmatch antipattern. Always test a prefix selector against the full rendered surface before shipping.

### IndexedDB recovery draft `contentHash` is a MATCH check, not a MISMATCH

- `frontend/src/db/drafts.ts#checkForRecovery` returns a draft iff `draft.contentHash === hashContent(serverContent)` AND `draft.content !== serverContent`. The contract is "this draft was written against THIS server state, local content is newer". Seeding a test draft with `contentHash: '_mismatch_'` will NOT trigger the recovery banner.
- A misleading test comment saying "must differ from server hash" burned multiple sessions before the `checkForRecovery` source was re-read.
- When writing tests that seed IndexedDB, compute the hash of the real server content inside the seed script rather than using a sentinel value.

## German content uses real umlauts

Production German content uses proper UTF-8 umlauts (ä, ö, ü, ß),
NOT ASCII transliterations (ae, oe, ue, ss).

### Where this applies (real umlauts required)

- i18n catalogs (`backend/config/i18n/de.yaml`).
- User documentation (`docs/help/de/**/*.md`).
- Plugin German content (under any `*/content/de/`).
- README German sections (currently none; English-only).
- CHANGELOG German entries (rare; quoted UI strings only).
- Journal entries written in German prose.
- Any other user-facing German text.

### Where ASCII stays

- Source code (`*.py`, `*.ts`, `*.tsx`, `*.js`, `*.jsx`).
- Code comments, docstrings (English convention).
- Variable / function / class / identifier names.
- File names, directory names.
- Git branch names, commit messages.
- This chat with the user (per the user's style preference,
  ASCII-only in chat communication).

The chat-style rule and the production-content rule are
deliberately different. Production text is authored for end
readers; the chat is a working channel.

### Tooling

`scripts/find_umlaut_candidates.py`, `scripts/replace_umlauts.py`,
`scripts/build_in_scope_list.py`, and
`scripts/discover_unknown_umlauts.py` implement a whitelist-based,
reviewable workflow:

1. Run `python3 scripts/build_in_scope_list.py` to regenerate
   `/tmp/in-scope-files.txt` from the policy below.
2. Run `python3 scripts/discover_unknown_umlauts.py` to find any
   ASCII transliterations NOT yet in `KNOWN_WORDS`. Add real
   German words to the whitelist (one entry per declined form);
   add false positives to the script's `NOT_TRANSLITERATIONS`
   set so future runs stay quiet.
3. Run `python3 scripts/find_umlaut_candidates.py` against the
   expanded whitelist; review `/tmp/umlaut-candidates.json`.
4. Run the replacer with `--dry-run` first; review diffs.
5. Apply per-file with `y / N / q` prompts; after 5 clean
   replacements the prompt offers `a` (yes-to-all) — only opt in
   when every prior diff was clean.
6. Re-run the finder to confirm 0 remaining candidates.
7. UTF-8 readback every changed file before committing.

Scope policy (encoded in `build_in_scope_list.py`):

In scope:
- `backend/config/i18n/de.yaml`
- `docs/help/_meta.yaml` (display labels are German prose)
- `docs/help/de/**/*.md`, `docs/journal/**/*.md`,
  `docs/explorations/**/*.md`
- `docs/CHANGELOG.md`, `docs/CONCEPT.md`, `docs/ROADMAP.md`,
  `docs/backlog.md`
- `plugins/*/content/de/**/*.md`,
  `plugins/*/bibliogon_*/content/de/**/*.md`
- `README.md`

Explicitly NOT in scope (do not add):
- `.claude/rules/*.md` — rules are English; only the policy
  examples reference umlauts as illustration.
- Source code (`*.py`, `*.ts`, `*.tsx`) — identifiers stay ASCII.
- Auto-translated non-DE i18n YAMLs (es/fr/pt/tr/ja/el/en) —
  separate diacritic-coverage track (I18N-DIACRITICS-01).

The finder masks Markdown code regions (fenced + inline +
indented). For YAML / config files (suffix `.yaml` / `.yml`), the
indented-code rule is skipped because YAML indentation is data,
not code. Word-boundary regex (`\b...\b`) prevents partial
matches inside compound identifiers.

### Why this matters

ASCII transliteration looks unprofessional to German readers and
can break Pandoc / EPUB export rendering when the surrounding
text uses proper umlauts (the mixed-encoding pattern is the
worst case — same file, two styles, output renders as garbage).

### Known regression pattern

Mixed-encoding files (BOTH real umlauts AND ASCII transliterations
in the same paragraph) are not tooling regressions but author-
style drift: typing in an environment without a German IME, then
copy-pasting UTF-8 text from elsewhere. There is no
heading / code-fence / section boundary to predict it.
Mitigation: the scripts above run cleanly per-session against
any new German prose; the `roadmap-archive-reminder` pre-commit
hook can be extended later to add an umlaut check the same way.

## AI-prompts embedded in data files beat per-call system-prompts for portability

UNIVERSAL-AI-TEMPLATE-01 Session 1 (2026-05-12) shipped a
self-explanatory `.biblio.yaml` template format where every
fillable field carries three keys (`description`, `example`,
`current_value`) and a top-of-file comment block carries the
rules-for-AI text (fill `current_value` only, respond in the
article's language, real UTF-8 characters, leave null when
uncertain). The rules live inside the file rather than being
passed as a system prompt at API call time.

Consequence: the same artefact works across THREE workflows
without any code branching:

1. Built-in AI: Bibliogon's existing AI-provider abstraction
   reads the YAML at runtime, builds its own system+user
   prompts (`backend/app/ai/article_template_prompts.py` /
   `book_template_prompts.py`), and calls the configured
   provider. The rules-in-file are redundant here but harmless.
2. Custom local endpoint (LM Studio / Ollama): same Bibliogon
   code path; `app.ai.llm_client.LLMClient` is endpoint-
   agnostic.
3. External AI via YAML round-trip: the user pastes the YAML
   into Claude.ai or ChatGPT with zero Bibliogon context. The
   rules-in-file are load-bearing here — they are the ONLY
   instruction the AI sees. The AI reads them, fills
   `current_value` per the rules, returns valid YAML, the user
   uploads it back, the import pipeline applies it.

Why this matters more broadly: a feature that depends on
runtime-injected system prompts can only run inside the
application's call path. A feature whose semantics travel
WITH the data artifact can run anywhere — paid cloud APIs,
free-tier playgrounds, local laptops, chat sessions, even
hand-edits by a human author. The same `.biblio.yaml` exported
from Bibliogon can be filled in any of those contexts and
re-imported.

Generalizes to: file formats that consumers might want to
process outside the originating app. If the file carries its
own "what this is + how to fill it" preamble, downstream
tools (AI assistants, scripts, manual editors) work without
out-of-band documentation. Pure data with no embedded
instructions forces every consumer to know the schema, which
is a coordination cost the schema-owner pays forever in
documentation churn.

Concrete artifact constants in `app.ai.template_schema`:
`ARTICLE_HEADER` and `BOOK_HEADER`. Each is a multi-line
comment block written once, regenerated on every export. PyYAML
silently drops comments on import — that's fine because the
header is documentation regenerated downstream, not a contract
the import path enforces.

## Three-workflows-share-one-format pattern (UI side)

UNIVERSAL-AI-TEMPLATE-02 Session 2 (2026-05-12) shipped the
frontend for the three-workflow feature whose backend Session 1
landed. The validating insight from Session 1's lessons-learned
("AI-prompts embedded in data files beat per-call system-prompts
for portability") plays out cleanly on the UI side too:

The same `AITemplatePanel` component drives all three workflows
without branching on the workflow:

- Workflow A (built-in AI): `Fill with AI` button -> internal
  `aiFill` API call.
- Workflow B (custom endpoint): same `Fill with AI` button, no
  code change; the existing AI client routes through whatever
  base_url is configured in Settings.
- Workflow C (external roundtrip): `Export template` +
  `Import filled template` buttons hand the user a `.biblio.yaml`
  and accept it back. Zero new UI surface for workflow C
  compared to A/B.

The component code knows nothing about WHICH workflow the user
is on. It just exposes three first-class buttons and the API
client picks the right backend endpoint. Workflow B is achieved
purely through configuration (Settings AI tab's "Custom"
preset); workflow C is achieved purely through the file format.

Generalises: when a feature has multiple "modes" that share an
underlying data contract, ship ONE UI component and let the
backend / config / file-format layer pick the mode. Branching
the UI by workflow ("if workflow A then show button X else
button Y") produces:

- N × the surface area to test
- N × the i18n strings
- N × the chance for the UI and the backend to drift

The `AITemplatePanel`'s three buttons + the unchanged
`api.{type}.aiFill` call cover all three workflows. No
`workflow: 'A' | 'B' | 'C'` prop anywhere in the component tree.

## SSE-in-context-not-in-modal (re-validated)

The AudiobookJobContext lessons-learned ("the SSE listener
belongs in the context, not in the modal") came up cleanly again
when designing `BulkAiFillJobContext`. The pattern works the
same way:

- Context provider holds the `EventSource` ref in `useRef`.
- `start(jobId, kind)` opens the stream + persists
  `{jobId, kind}` to localStorage.
- `useEffect` on mount checks localStorage and reconnects if a
  job is mid-flight (F5 recovery).
- Stream-end clears persistence.
- Dock + expanded modal are pure consumers that render based on
  context state; minimizing the modal doesn't disturb the SSE
  listener.

The cost is one global Context per long-running job type
(audiobook, bulk-AI-fill, future: bulk export with progress).
The benefit is that the user can navigate freely while the job
runs, the badge persists across route changes, and reloading
the browser doesn't drop the connection. Both surfaces (dock
badge + expanded modal) are trivially testable because they're
just consumers of the context.

When adding the next long-running job type to Bibliogon, the
pattern to follow is: context provider holds the SSE state +
persistence, components consume it, never the other way around.

## User-facing time estimates must scale with input size or be omitted

Surfaced 2026-05-14 from a manual smoke test of v0.31.0.

The Medium-import upload UI shipped with the message
"Verarbeitung auf dem Server … das kann bis zu einer Minute
dauern." (and direct translations in all 7 other catalogs).
The "up to one minute" claim is false for large archives — a
500MB Medium export takes substantially longer than 60s on
the same hardware that handles a 50MB archive in under 10s.
User sees no progress feedback past the minute mark and
assumes Bibliogon has crashed.

Wrong:

- "X seconds" / "X minutes" / "up to N minutes" claims in
  user-facing strings for any operation whose cost scales
  with input size: uploads, imports, exports, bulk
  operations, AI batch calls.

Right:

- Omit the time bound, OR
- Frame the dependency: "Larger archives may take longer."
  / "Bei großen Archiven kann das länger dauern." / etc.
- For operations with truly bounded cost (sub-second SQL
  bulk DELETE, single-record fetch), no time language is
  needed.

A user-facing string with a hard time bound is a promise to
the user. Promising "≤ 1 minute" creates a "false-crash"
impression for any input that breaks the promise. The cost
of the bound is the trust the user loses; the value is near
zero because they would have waited regardless.

This pairs with the existing rule **Bulk-operation limits
should be per-operation cost-profile**. Same principle —
cost depends on input — applied to text rather than caps.

Audit checkpoint: at release time, grep i18n catalogs for
hard time bounds:

```bash
grep -rniE "minute|sekund|second|dakika|分" \
  backend/config/i18n/*.yaml | grep -iE "dauer|takes|tardar|prendre|demor|sürebilir|かかります"
```

False-positives: config-field labels (e.g. "Timeout
(Sekunden)") and ordinal markers (e.g. "First chapter").
True positives: any wait-time claim a user reads while
waiting.

**Concrete artefact**: the v0.31.0 medium-import processing
message in ``ui.medium_import.progress.processing`` was
fixed in the same commit that filed this rule. All 8
catalogs updated in a single sweep, including 6 that had
local-idiom translations of the same false claim (not
passthru-English).

## Destructive row-actions must reconcile collection state

When a row-action (delete, archive, move-to-trash) modifies an
item that may be a member of a multi-select collection state, the
post-action handler MUST reconcile the collection so its consumers
(bulk-action bar, counters, batch-operation forms) never reference
an orphan id that no longer corresponds to a visible row.

Pattern surfaced 2026-05-14: ArticlesList + Dashboard each had a
selection hook (``useArticleSelection`` / ``useBookSelection``)
holding a ``Set<string>`` of selected row ids. A row-delete handler
removed the row from the page-level list state but left the id in
the selection Set. The BulkActionBar reads ``count > 0`` from the
selection hook → bar stays visible → buttons claim to operate on
"1 selected" → but the underlying row is gone. Soft-delete /
permanent-delete handlers (both live-list AND trash-view) all
exhibit the same bug class.

### Rule

Every single-item destructive handler that fires from a list view
backed by a selection hook MUST call the hook's ``remove(id)`` (or
equivalent idempotent delete) after the API call succeeds, BEFORE
the success notification. The order matters: reconcile state first,
notify second, so the user never reads "moved to trash" while the
bar still shows them as the operand.

```typescript
async function handleDelete(item: Item) {
  try {
    await api.items.delete(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    selection.remove(item.id);  // <-- reconcile BEFORE notify
    notify.success(...);
  } catch (err) { ... }
}
```

### Anti-pattern

```typescript
// WRONG — selection still contains item.id after this returns
async function handleDelete(item: Item) {
  await api.items.delete(item.id);
  setItems((prev) => prev.filter((i) => i.id !== item.id));
  // Forgot selection.remove(item.id) here → bar stays at "1 selected"
}
```

### Hook contract

Selection hooks should expose a dedicated ``remove(id)`` method
that is idempotent (no-op when the id is absent), not just
``toggle(id)`` with a guard at the callsite. Reasons:

- ``toggle`` flips state — calling it on an unselected id ADDS the
  id, which is the opposite of what destructive handlers want.
- A dedicated ``remove`` makes the intent obvious at the callsite
  and lets the hook's React state machinery short-circuit
  (return the same Set reference on no-op) to skip a re-render.
- The signature reads better in tests: ``selection.remove(id)``
  asserts the operation; ``isSelected(id) && toggle(id)`` is
  noise that obscures the contract.

### Detection heuristic

When auditing a list page for this bug class, grep for every
mutator on the list state and check whether selection.remove (or
equivalent) appears nearby:

```
grep -E 'setBooks\(|setArticles\(|setItems\(' \
  frontend/src/pages/<page>.tsx \
  | grep -B0 -A2 '\.filter'
```

For each match: confirm a paired ``selection.remove(`` or
``selection.clear()`` call in the same handler. Missing pair is
the bug.

### Other affected operations

Same shape applies to:

- **Bulk operations on the SAME page** that internally use single-
  item APIs in a loop (each successful delete in the loop must
  remove that id from selection so a partial failure leaves a
  clean post-state).
- **Cross-tab updates** received via WebSocket / SSE / polling:
  when the server pushes "item X was deleted", the receiver must
  reconcile its local selection state, not just the list.
- **Filter changes that hide rows**: this is a separate decision
  (clear-on-filter-change vs preserve-and-warn) that both Article
  and Dashboard already handle via ``clearSelection`` /
  ``clearBookSelection`` callbacks bound to filter state changes.
  Pin tests for both patterns when adding a new list page.

### Bibliogon's bar-visibility convention at count===0

Both bulk-action bars (``ArticleBulkActionBar``,
``BookBulkActionBar``) are rendered conditionally on
``selection.count > 0`` from the surrounding page. When the count
drops to zero, the bar UNMOUNTS — no disabled-state, no
placeholder. This matches the widespread convention in Gmail,
Linear, Notion, etc.

This is a UI-rendering decision orthogonal to the selection-
cleanup rule above: the cleanup happens regardless; the
unmounting is a consequence of the count going to 0. Future
bulk-action surfaces in Bibliogon should follow the same shape:

```typescript
{selection.count > 0 ? (
  <XYZBulkActionBar count={selection.count} ... />
) : null}
```

If a future surface wants a different convention (e.g. always
visible with disabled buttons), that's a deliberate exception and
should ship with a doc comment explaining why; otherwise pin to
the convention so the user experience stays consistent across the
app's dashboards.

### Audit recipe for finding all bulk-selection surfaces

```
grep -rln 'useSelection\|useArticleSelection\|useBookSelection' \
  frontend/src/ | grep -v '\.test\.'
```

As of 2026-05-14 there are exactly two such surfaces:
``pages/ArticleList.tsx`` and ``pages/Dashboard.tsx``. Any new
match should immediately be audited against the rule above —
specifically: does every single-item destructive handler in that
page call ``selection.remove(id)`` after the API call succeeds
and before the success toast?

CommentsAdminSection has only a single-row delete and no
bulk-selection checkboxes (the "orphans only" checkbox there is a
FILTER, not a selection — easy to misread on first audit).
ArticleEditor has neither.

## Articles-vs-Books parallel-surface asymmetry

**Pattern class observed 8 times across 3 release cycles.** Each
occurrence: a feature (or fix) lands on one of the parallel
surfaces (Articles list/editor vs Books list/editor) and the
mirror surface lags behind, gets a different shape, or gets
no update at all.

### Concrete occurrences (2026-05 audit cycle)

1. **Bulk-delete cap removal** (v0.31.0). Both Articles + Books
   needed the 200-row cap removed simultaneously. Articles
   adoption lagged briefly until a paired update.
2. **Comments-Count badge** (v0.31.0). Card view shipped first;
   List view parity in a follow-up — same Articles surface but
   different view-modes.
3. **BookEditor zero testids** (UX-Full-Audit G1-F1, 2026-05-15):
   ``ArticleEditor.tsx`` has 38 testids over 1494 LOC;
   ``BookEditor.tsx`` has 0 over 700 LOC.
4. **ArticleFilterBar inline duplication** (UX-Full-Audit G2-F1):
   Articles uses a 200-LOC inline ``ArticleFilterBar`` (in
   ArticleList.tsx) with 6 filter slots; Books uses the shared
   ``DashboardFilterBar`` component with 1 filter slot.
5. **View-mode testid namespace split** (UX-Full-Audit G2-F2):
   ``book-card-{id}`` (grid) vs ``book-list-row-{id}`` (list).
   E2E specs silently skip when wrong view-mode persisted.
6. **BookDashboard list-view missing selection checkboxes**
   (v0.33.0 manual smoke, fixed in commit ``711aef0``).
   ``BookListView`` was rebuilt later than ``ArticleRow`` and
   shipped without ArticleRow's selection-checkbox feature.
   ``BulkActionBar`` appeared on Articles list-view but never on
   Books list-view; bulk-delete on BD list-view was impossible
   for two release cycles before user-smoke surfaced the gap.
7. **Comments-Admin bulk-delete** (Bug 4a, filed 2026-05-16,
   pending implementation). The Comments-Admin section in
   Settings has single-row delete but no bulk-selection +
   bulk-delete affordance, while the parallel AD / BD
   list-views both ship the
   ``BulkActionBar`` + ``useSelection``-hook pattern. Confirms
   Comments-Admin as a third parallel surface to AD / BD for
   bulk-action capabilities; the fix re-introduces parity
   instead of treating Comments-Admin as a separate concern.
8. **Comments trash-lifecycle** (Bug 10, fixed 2026-05-16,
   commits ``f09f0c2..acdee4a``). Articles + Books shipped the
   full trash lifecycle (soft-delete + list-trashed + restore +
   permanent-delete-from-trash + empty-trash) from day one;
   Comments shipped only the soft-delete half in v0.32.0 with
   the rest filed as ``v2`` in the
   ``MEDIUM-COMMENTS-IMPORT-01`` commit 7 docstring. The
   deferred half was never picked up. Production smoke
   surfaced **61 soft-deleted comments stuck in invisible
   purgatory** — the user pressed "Move to Trash", got
   "moved to trash" feedback, and then found no trash to
   look in. Closed by Bug 10: new
   ``/api/comments/trash/list``, ``/api/comments/trash/{id}/restore``,
   ``/api/comments/trash/empty``, ``/api/comments/trash/{id}``,
   ``/api/comments/trash/bulk-restore`` endpoints + a
   ``viewMode`` toggle on CommentsAdminSection + the trash-view
   bulk-action bar. See the "Half-wired feature lifecycle" rule
   below for the generalized pattern (now extended with the
   frontend-shape variant from PB-PHASE4 Session 4).

> **Footnote on Bug 3 (Trash-View-Mode-Settings):** an earlier
> mid-session report tagged Bug 3 as occurrence #7 of this
> pattern class. Reclassified out of this tally: Bug 3 was
> symmetric across AD and BD (both surfaces had the same
> missing per-tab default), not asymmetric between them. It
> belongs to a Settings-Granularity-Pattern (Class B,
> currently single-instance, not yet formalized as its own
> lessons-learned class per the "single instance is incident,
> not pattern" discipline). Tally above reflects the
> corrected classification.

### Rule

**Every parallel-surface feature (Articles ↔ Books) gets an
explicit parity verification step in its development workflow.**
Before merging a PR that touches one of the parallel surfaces:

1. **List the parallel features the change affects** (e.g.
   "this is a delete-confirm dialog change → applies to both
   Articles and Books").
2. **Verify the mirror surface received the equivalent
   treatment** (or explicitly document why it's intentionally
   asymmetric).
3. **Add cross-surface E2E coverage** if the bug class is
   user-visible (yesterday's BulkActionBar fix in ``02553fb``
   shipped Vitest hook tests for both surfaces — the right
   shape).

### Periodic hygiene

**Articles-vs-Books-Parity audit** as quarterly hygiene OR after
any feature wave that touches list/editor surfaces. Audit recipe:

```bash
# Find inline implementations on one side that have a shared
# counterpart on the other.
grep -rln 'useArticleSelection\|useArticleFilters' frontend/src/
grep -rln 'useBookSelection\|useBookFilters' frontend/src/

# Find testid-namespace inconsistencies via column counts.
for f in $(grep -rln 'data-testid' frontend/src/pages/*.tsx); do
  echo "$f: $(grep -c 'data-testid' $f)"
done
```

The 2026-05-15 audit's Articles-vs-Books parity matrix
(``docs/audits/ux-full-audit-2026-05-14.md``) is the template:
13 features compared, 3 confirmed asymmetries documented + 2
historical resolutions noted.

## Half-wired feature lifecycle: a state-write without its inverse-mutation OR its state-consumer is purgatory, not a feature

A "half-wired" feature ships one half of a lifecycle and leaves
the other half (the inverse mutation, the data consumer, or the
renderer) deferred. The user perceives the working half — they
click the button, the API succeeds, the toast confirms — but the
expected downstream effect is invisible, missing, or stuck. The
word for the half-shipped state is **purgatory**: data still
exists, the user already paid the cognitive cost of the action,
but the next step the action implies isn't there.

This pattern has **two distinct shapes**:

- **Backend shape — state-mutation without inverse-mutation
  surface.** Soft-delete shipped without restore. Archive without
  un-archive. Schedule without "see scheduled".
- **Frontend shape — state-write without state-consumer
  (renderer or reader).** Picker writes a field, renderer ignores
  the field. Form persists a value, no UI surface reads it.

Both shapes destroy trust the same way: the user thinks they
acted on the system, and the system appears to ignore them.

### Concrete instances

**1. Bug 10 — Comments soft-delete shipped, restore-UI deferred
   (backend shape).** The MEDIUM-COMMENTS-IMPORT-01 v1 admin
surface (2026-05) shipped soft-delete on ``DELETE /api/comments/
{id}`` and bulk-soft-delete on ``POST /api/comments/bulk-delete``
(``permanent=false``). The original commit's docstring called it
out: *"Hard-delete and re-linkage endpoints are out of scope for
v1; v2 ships them when MEDIUM-COMMENTS-UI-01 builds the admin
view."* The "v2" work was filed in prose, NOT in a load-bearing
backlog item. Production smoke at v0.33.0 surfaced **61 user-
trashed comments stuck in invisible purgatory** — the user had
to ask "where did my comments go?" before the gap was visible.
Closed by Bug 10.

**2. PB-PHASE4 Layout-Picker shipped, layout-renderer deferred
   (frontend shape — closed by Session 4).** Session 3 Commit 4
   shipped LayoutPicker writing the layout field through
``api.pages.update``. PageCanvas (Commit 5) was authored against
a fixed vertical-stack JSX with no per-layout branching; it read
``page.image_asset_id`` and ``page.text_content`` but ignored
``page.layout`` entirely. Visual smoke during the Session 3
go/no-go gate surfaced this as the #1 blocker:

> "Layout-Picker is visual-only, has NO render effect in editor.
> User selects different layouts (image-top-text-bottom,
> image-left-text-right, etc.). Editor displays SAME layout
> regardless of selection. Backend stores layout field, frontend
> renderer ignores it."

Closed by Session 4 Commits 1-3: PageCanvas now consumes
``page.layout`` via a per-layout CSS-Module class + region
wrappers, with per-layout structural + visual differentiation.

**3. PB-PHASE4 ``layout_config`` (originally
   ``speech_bubble_config``) field exists, NO UI writes or
   reads it (frontend shape — fully closed by Session 4 D2a
   default + Session 4c preset write-path).** The
``Page.layout_config`` JSON field (renamed from
``speech_bubble_config`` in Session 4c) has been schema-present
since Session 2 (backend) and frontend-type-present since
Session 3 Commit 1 (``api.pages``). No UI consumed it for
rendering and no UI wrote it. Session 4 audit surfaced this
during PageCanvas inspection — a third instance of the pattern
caught BEFORE it became a user-visible bug, exactly the value of
audit-first discipline.

**This is the FIRST canonical complete-cycle example of the
pattern.** Both halves closed via two coordinated session steps:

- **Read-path** closed by Session 4 D2a: PageCanvas reads
  ``layout_config.anchor_position`` (with fallback to
  bottom-center default) and renders the bubble at that
  position. Without a write surface, this still rendered the
  default for every existing row — the lifecycle was visibly
  "wired" but the user couldn't change it.
- **Write-path** closed by Session 4c: LayoutConfigSpeechBubble
  component ships the 5-preset anchor radio + opacity slider +
  size slider in PageEditor's properties pane. The dispatcher
  routes to it whenever ``page.layout === "speech_bubble"``;
  ``handleUpdateLayoutConfig`` in PageEditor merges partial
  updates and persists via ``api.pages.update`` with optimistic
  state refresh. Same write surface design extends to the 3
  image-based layouts (image_top_text_bottom +
  image_left_text_right + image_full_text_overlay) which got
  their own per-layout configs in the same session.

**Drag-to-position** (the broader interpretation of
"reposition capability") remains as the narrower P5 backlog
item
``PICTURE-BOOK-SPEECH-BUBBLE-DRAG-POSITION-01``. That follow-
up extends the persisted shape (`{x_pct, y_pct}` dict variant
in addition to the preset string) without breaking the
preset path. **Extended bubble properties** (color, border,
typography, etc.) are tracked separately as
``PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`` (P3)
— not part of the half-wired closure; they're a new feature
adding more dimensions to the already-closed lifecycle.

The closure pattern is instructive: an outer "complete the
lifecycle" backlog item can naturally generate narrower
follow-ups when the original scope was broader than the MVP
needs. Filing both the original close + the narrower P5
follow-up makes the closure auditable while preserving the
deferred work as a tracked future task.

**4. PB-PHASE4 ``kinderbuch.css`` shipped, NO code consumed it
   (frontend shape — closed by PB-PHASE4 Session 6 Commit 1
   at 4f3d47d).** The kinderbuch plugin shipped a
``plugins/bibliogon-plugin-kinderbuch/bibliogon_kinderbuch/
templates/kinderbuch.css`` file with CSS rules for 4 of the
5 picture-book layouts. Zero code referenced it (grep
confirmed zero ``.py`` / ``.yaml`` consumers); the file used
HYPHENATED layout names (``image-top-text-bottom``) while the
backend schema used UNDERSCORES (``image_top_text_bottom``)
which would have prevented any future generator from finding
the rules; the file was missing the ``speech_bubble`` layout
(added later in Session 4); and the font choice was Comic
Sans MS, which would not have embedded properly for PDF
output anyway.

Surfaced by the Session 6 Pre-Inspection audit
(``docs/audits/session-6-pdf-export-audit-2026-05-17.md``);
closed by Session 6 Commit 1 (``4f3d47d``) which deleted the
file and fresh-wrote the WeasyPrint-targeted CSS inline in
``picture_book_pdf.py``. The pattern is the same shape as
instance #3 (data-without-consumer) but with an extra layer:
the file existed AS A consumer-shaped artifact (a CSS
template) but no code path ever rendered HTML that referenced
it. Worse than no-consumer: an opaque-consumer that LOOKED
like the right answer to a future contributor.

This instance crystallises the broader pattern: **a UI /
templating asset shipped without a code path that loads
+ applies it is purgatory of the worst kind**, because the
file's existence creates a false signal that the feature
is wired (especially against a 6-month-later contributor who
finds the file via grep). Detection mechanism:

```bash
# Find templating assets with no grep matches in their plugin
# Python / YAML / TypeScript:
find plugins/ -name "*.css" -o -name "*.html" -o -name "*.tex" \
  | while read f; do
      basename=$(basename "$f")
      hits=$(grep -rln "$basename" "$(dirname "$(dirname "$f")")" \
        --include="*.py" --include="*.yaml" --include="*.ts" \
        --include="*.tsx" 2>/dev/null | wc -l)
      [ "$hits" -eq 0 ] && echo "DEAD: $f"
    done
```

Future audits at session-start should grep the touched
plugins for this pattern. The kinderbuch.css case shipped
in v0.13.0 (kinderbuch plugin first release) and lay dormant
through 12+ release cycles before the Session 6 audit caught
it.

### Rule

When a feature ships ANY half of a lifecycle, the deferred half
MUST be filed as a **load-bearing backlog item** with an explicit
blocker relationship to the shipping half:

1. Open a P-tier backlog entry (NOT just a docstring TODO) with
   ID + scope + trigger.
2. Cross-reference in the docstring of the shipping half — so
   anyone reading the code sees the backlog reference, not just
   the prose "v2 will do it".
3. Set the trigger to be **observable from real use** (user
   reports the gap, monitor alert, follow-up audit), not a silent
   "we'll get to it".

Concretely for the two shapes:

- **Backend shape**: every state mutation that introduces a
  "trash"-like intermediate state MUST ship its inverse-mutation
  surface in the same release, OR file an explicit backlog item
  with a trigger.
- **Frontend shape**: every form, picker, or input that WRITES a
  field via API MUST have a renderer/reader that CONSUMES that
  field, OR file an explicit backlog item with a trigger. A
  field that no UI reads after a write is purgatory — the user
  clicked the picker and the choice "disappeared".

### Detection greps

**Backend shape (deferral-in-prose hunt):**

```bash
grep -rnE 'out of scope|v2 ships|deferred to v2|filed for v2|TODO.*v2' \
  backend/app/ frontend/src/ plugins/ \
  --include='*.py' --include='*.tsx' --include='*.ts'
```

Each hit is a candidate. Cross-check whether the deferred half
is in the backlog with a real ID; if not, file one now.

**Frontend shape (picker-without-renderer hunt):**

For every form/picker/input that writes a field via api,
verify the field is READ somewhere (a renderer, a derived
display, an export pipeline):

```bash
# Step 1: find every field written by the frontend api client.
grep -rnE 'api\.[a-z]+\.update\(|api\.[a-z]+\.create\(' frontend/src/ \
  --include='*.tsx' --include='*.ts' | grep -v test

# Step 2: for each field name in the request payload, grep for
# CONSUMERS of that field (read sites, NOT write sites) in the
# component tree:
grep -rn '\.<field>\b' frontend/src/components/ frontend/src/pages/ \
  --include='*.tsx' --include='*.ts'
```

A field that surfaces in step 1 (write site) but has no consumer
in step 2 (read site) outside its own form/picker is a candidate
for half-wired-frontend purgatory. File a backlog item if no
renderer is planned.

### Audit-first value

Instances #2 and #3 above were both surfaced by audit/smoke
processes BEFORE escalating to user-data-loss-class incidents.
The Session 3 user-validation gate surfaced #2 in the very flow
the gate was designed to surface; the Session 4 Pre-Inspection
audit surfaced #3 as a near-miss before another release cycle
could ship it as a third user-visible bug.

**The pattern: half-wired features hide behind successful API
responses + green tests.** The tests assert WRITE returns 200;
the renderer / consumer / inverse-mutation is the only place
the user sees the result. A test that exercises the user's
expected downstream effect (not just the API write) is what
catches the gap.

### Anti-pattern

The ``v1 ships half, v2 ships the other half`` docstring is fine
**IF** v2 has an open backlog item with an ID that anyone
scanning the backlog can find. The failure mode is the docstring-
only deferral that never makes it into ``docs/backlog.md``,
``docs/ROADMAP.md``, or any other tracked list. Out of sight,
out of mind, in production for a release cycle, user reports
"this doesn't work" / "where did my data go" / "the picker has
no effect".

### Pairs with

- "Articles-vs-Books parallel-surface asymmetry" — Bug 10 fires
  under BOTH patterns. The asymmetry rule fires on "Articles +
  Books have it, Comments doesn't"; this rule fires on "Comments
  shipped half the contract". Same fix, two audit lenses.
- "End-to-end behavior tests are not 'kwarg passes through' tests"
  — the test that catches half-wired-frontend is the one
  asserting on the OBSERVABLE OUTPUT of the entire chain (picker
  → write → render), not just the API write.

## Inline-component duplication is the upstream cause of parallel-surface asymmetry

**Pattern class observed 2 times so far (2026-05-15 audit).**
Inline component definitions inside large monolithic page files
amplify the Articles-vs-Books asymmetry pattern above. They have
a cause-effect relationship:

```
[Monolithic component file]
        ↓ blocks
[Component extraction discipline]
        ↓ absence creates
[Duplication across parallel surfaces]
        ↓ amplifies
[Articles-vs-Books asymmetry when updates touch one surface only]
```

### Concrete occurrences

1. **Settings.tsx 2338 LOC** with inline ``function
   PluginSettings(...)`` + inline ``function AuthorSettings(...)``
   (UX-Full-Audit G3-F1 + G3-F2 + G3-F8). The inline structure
   makes per-tab testid additions land as cross-2000-line PRs;
   neither inline component has testids.
2. **ArticleList.tsx 1541 LOC** with inline ``function
   ArticleFilterBar(...)`` ~200 LOC (UX-Full-Audit G2-F1). The
   inline structure made it easy to grow Articles-specific filters
   (6 slots) without considering Books parity (1 slot in the
   shared ``DashboardFilterBar``).

### Rule

**Extract inline component functions to their own files when they
exceed 50 LOC OR span a logical sub-feature** (a panel, a tab
content, a filter bar, etc.). The extraction enables:

1. **Per-component testid additions** as small, scoped PRs.
2. **Cross-surface reuse** (the extracted Articles-side component
   becomes a candidate for the Books side to import or model).
3. **Independent test files** (Vitest unit tests per component vs
   monolithic page tests).

### The compounding insight

**Fixing the monolithic-component-extraction-gap addresses the
root cause of multiple Articles-vs-Books asymmetries
simultaneously.** Extraction work has compounding parity value,
not just code-cleanup value. Backlog items
``PLUGIN-SETTINGS-TESTID-COVERAGE-01`` (Settings extraction +
testids + E2E) and ``ARTICLEFILTERBAR-EXTRACT-01`` (ArticleList
extraction) are the targeted fixes for the two observed
instances.

## Intentional asymmetry between Articles and Books must be documented

The "Articles-vs-Books parallel-surface asymmetry" rule above is
about ACCIDENTAL drift: one surface gets a feature, the mirror
surface doesn't, nobody noticed. The corollary is that some
asymmetries are DELIBERATE — Articles and Books have genuinely
different conceptual shapes, and forcing parity would degrade
the product. When the asymmetry is intentional, document it
explicitly so a future audit doesn't flag it as a regression
and the next contributor doesn't "fix" it by accident.

### The trigger pattern

When you ship a feature on one surface and an audit asks "why
not the other side too?", there are three possible answers:

1. **Accidental drift** — the other side just didn't get it
   yet. Fix per the parallel-surface-asymmetry rule above.
2. **Intentional asymmetry, undocumented** — the other side
   genuinely shouldn't have it for conceptual reasons. The next
   audit will surface the same question, get the same verbal
   "oh right, that's intentional" answer, and the loop repeats.
3. **Intentional asymmetry, documented** — the why lives in the
   commit message + a lessons-learned entry, so the next audit
   sees the documentation and closes the question immediately.

The middle case is the one this rule prevents. The cost of
documentation is small; the cost of re-running the same audit
every quarter is large.

### Rule

When a feature ships on Articles XOR Books and the asymmetry
is intentional:

1. **Commit message must call it out.** A sentence like
   "Books-only by design — Articles use Topic (single enum)
   + Tags (free-text), Books use Categories (free-text JSON
   list) + BISAC; the two domains have different metadata
   shapes" is enough.
2. **Add a one-line note to this section.** Lists the feature,
   which surface has it, and the one-sentence "why" — so future
   audits can grep this section before raising the asymmetry.

### Documented intentional asymmetries

- **Categories + BISAC (Bug 9, shipped 2026-05-16, commits
  ``032a1c7..148be6b``)**: Books-only. Articles use
  ``Article.topic`` (single, settings-managed enum, drives
  the per-platform publishing workflow) and ``Article.tags``
  (free-text). Books use ``Book.categories`` (free-text JSON
  list, KDP-aligned) and ``Book.bisac_codes`` (BISAC 9-char
  codes ``^[A-Z]{3}[0-9]{6}$``, validated for format only —
  see ``BISAC-DATABASE-LOOKUP-01`` for the deferred bundled-
  catalog path). The two domains have fundamentally different
  metadata shapes: an article ships to N platforms each with
  its own tagging norms; a book targets retail catalogues
  (KDP / Apple Books / Kobo) with industry-standard subject
  hierarchies. Forcing the same field set on both would help
  neither. **Canonical concrete example for this rule**: a
  future audit that grep's the accidental-asymmetry tally and
  asks "why aren't categories on Articles too?" should find
  this entry as the answer and close the question without a
  re-investigation. The KDP plugin's metadata checker
  (``plugin-kdp/bibliogon_kdp/metadata_checker.py``) is the
  only place that validates BISAC codes at write-time —
  the backend schema validator (``app.schemas.BISAC_CODE_RE``)
  is the canonical regex and the plugin duplicates it
  intentionally for loose coupling.

- **Authors-Database (Bug 8)**: Books-only at the
  wizard-integration layer in v0.33.0+. The new Authors-DB +
  Settings tab IS global (no Article / Book scoping), but the
  Phase 2 wizard-datalist integration only lands on the
  Article-to-Book conversion wizard. ArticleEditor + BookEditor
  free-text author inputs stay plain text per D8 — the wizard
  is the high-leverage surface (multi-article selection
  surfaces multiple authors at once); single-record editors
  ship the datalist later. Future session promotes the pattern
  to both editors.

### Anti-pattern

Removing or weakening a feature on one surface just to "match"
the other surface, when the surfaces have genuinely different
needs. Symmetry-for-symmetry's-sake is wrong; symmetry-in-
service-of-the-user is right. The asymmetry tally above tracks
the bugs of the second kind (accidental missing parity); this
section catalogues the cases where asymmetry IS the right
answer.

## German typographic quotes in YAML: all-or-nothing, never mixed

Surfaced 2026-05-27 during a help-doc / i18n edit pass. YAML's
double-quoted scalar uses ASCII `"` (U+0022) as both opening and
closing delimiter. Inside such a scalar, an embedded ASCII `"`
ends the scalar. German typographic quotes — opening `„`
(U+201E) and closing `"` (U+201D, the same glyph family as the
English `"` but a distinct codepoint) — are NOT delimiters in
YAML; they are ordinary characters when typed correctly.

The trap: a translator (human OR LLM doing a localisation pass)
types the opening `„` correctly but uses ASCII `"` for the
closing, OR vice versa. The first character that resembles a
YAML delimiter (the ASCII `"`) terminates the scalar EARLY, and
the rest of the line becomes a YAML parse error. Worse: in many
contexts the parser silently truncates the value to whatever
came before the unexpected `"`, and downstream consumers see
half a sentence with no error surfaced.

### Rule

Inside a double-quoted YAML scalar that contains German
typographic quotes:

1. **Both quotes must be the German typographic codepoints**:
   opening `„` (U+201E) AND closing `"` (U+201D). NOT mixed
   with ASCII `"`.
2. **OR** escape every embedded `"` as `\"` if you genuinely
   need ASCII quotes inside the value.

Pick one; do NOT mix.

### Examples

```yaml
# RIGHT — both German codepoints
ui.message: "Klicke auf „Speichern", um fortzufahren."

# RIGHT — fully ASCII-escaped form
ui.message: "Klicke auf \"Speichern\", um fortzufahren."

# WRONG — opening „ is German, closing is ASCII " → terminates
# the scalar after "Speichern, leaving the rest as YAML noise.
ui.message: "Klicke auf „Speichern", um fortzufahren."
```

The third example LOOKS identical to the first in many editors
because most monospace fonts render `"` (U+0022) and `"`
(U+201D) very similarly. Visual inspection is unreliable;
codepoint inspection is authoritative.

### Detection

Grep the i18n catalogs (or any YAML file with translator-
edited scalars) for ASCII `"` immediately following the German
opening `„`:

```bash
# Match opening „ followed eventually by a closing ASCII "
# inside the same scalar value.
grep -nP '„[^"\n]*"' backend/config/i18n/*.yaml
```

Any hit is a candidate for the mixed-quotes bug. Manual review:
is the ASCII `"` actually closing the German `„`? If yes, fix
to either both-German or both-ASCII-escaped.

### Where this fires

- `backend/config/i18n/{de,en,...}.yaml` — primary surface for
  translator-authored quoted scalars.
- Plugin YAML metadata under `backend/config/plugins/*.yaml` —
  same risk class for German `display_name` / `description`
  fields.
- Any docs-as-YAML surfaces (e.g. ``docs/help/_meta.yaml``'s
  display labels).

### Pairs with

- "German content uses real umlauts" (this file) — same family
  of "use proper Unicode where the user reads it" discipline.
  Umlauts are about character correctness; quotation marks add
  the YAML-syntactic dimension where wrong codepoints don't
  just look ugly but actively break the parse.

## Inserting an i18n key into a block that already exists elsewhere → duplicate YAML mapping key

Filed 2026-06-06 (P3c). When adding a key under an existing top-level
namespace (e.g. `ui.offline.*`), the namespace block may already be
defined LATER in the catalog. Blindly inserting `  offline:\n    new_key:`
near the top creates a SECOND `offline:` mapping key under `ui:`. YAML's
last-key-wins then drops your insertion when the seed generator parses it
(the offline-PWA reads keys from the seed JSON, so the key silently
vanishes for non-DE users — and `grep -c new_key seed.json` returns 0
even though the YAML "has" it).

Detection: after inserting, `grep -c '^  <namespace>:'` per catalog must
be 1, not 2. Fix: find the EXISTING block and add the key as a child of
it. Always reseed (`make generate-seed-data`) AND assert the key is
present in the seed JSON, not just the YAML, before committing. Backend
`test_i18n_parity.py` (51) checks key parity ACROSS catalogs but NOT
same-file duplicate keys, so it would not have caught this.

## "Provider X is CORS-blocked in the browser" must be proven with a live preflight, not assumed

Filed 2026-06-19 (#468/#450). Bibliogon gated OpenAI + Mistral as
not-browser-testable (a `BROWSER_TESTABLE_PROVIDERS` exclusion in
`frontend/src/ai/llmClient.ts`, introduced with #450) on the reading that a
403 from `api.openai.com` meant a CORS wall. It did not. A live `curl` with an
`Origin` header showed `access-control-allow-origin: *` on
`GET /v1/models` and a passing `OPTIONS` preflight on
`POST /v1/chat/completions` — the 403 was a **key/account/region-specific
provider response**, not a universal browser block. The sister project
(adaptive-learner, a backendless GH-Pages PWA) tested OpenAI "Verbindung ok"
in the browser the whole time. All 6 providers are reachable browser-direct;
the exclusion was removed and the analysis recorded at
`docs/explorations/openai-cors-browser-direct-analysis.md`.

Rule: a "this API is CORS-blocked from the browser" claim is a **testable
fact**, not a default. Before gating a provider/endpoint as desktop-only for
CORS reasons, prove it with a real preflight:

```bash
# Does the response expose a readable CORS header?
curl -sI -H "Origin: https://example.github.io" https://api.<provider>/v1/models \
  | grep -i access-control-allow-origin
# Does the actual write endpoint pass an OPTIONS preflight?
curl -s -X OPTIONS -H "Origin: https://example.github.io" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  -D - -o /dev/null https://api.<provider>/v1/chat/completions | grep -i access-control
```

A 401/403 **with** an `access-control-allow-origin` header is an auth/account
problem the browser CAN surface, not a CORS block. Classify the failure by the
actual response, not by the status code alone. Pairs with "classify offline AI
connection-test errors honestly" (#446/#456) below.

## A pinned default model id rots when the provider retires it — derive or refresh it

Filed 2026-06-19 (#454). The offline seed default (`seed-settings.json`, the AI
config the backendless PWA loads) pinned `claude-sonnet-4-20250514` as the
default Anthropic model. Anthropic **retired** that snapshot, so a fresh PWA
user's first AI call failed against a 404/model-not-found before they had a
chance to pick a model. Fixed by pinning a current model (`claude-sonnet-4-6`)
and — separately (#451) — loading the model list **dynamically per provider**
with the preset only as a fallback.

Rule: a hardcoded model-id default is a perishable value, same class as the
"pinned default model id" / version-pin rot. Treat it like any other external
constant that an upstream can retire:

- Prefer **dynamic discovery** (query the provider's models endpoint) with the
  static preset as a fallback, not the source of truth.
- When a static default is unavoidable (offline seed), the value MUST be a
  **current, non-dated** alias (`claude-sonnet-4-6`), never a dated snapshot
  (`...-20250514`) that the provider can sunset.
- The default lives in `seed-settings.json` (committed, NOT gitignored like
  `app.yaml`) — so a refresh is a seed edit + `make generate-seed-data`, and
  the offline PWA picks it up. See the memory `[[ai-pwa-offline-architecture]]`.

## One key column per provider — a single `api_key` field clobbers other providers on switch

Filed 2026-06-19 (#460/#456). Bibliogon stored a single `api_key` for "whatever
the active provider is". Switching the active provider in Settings overwrote the
previous provider's key (the user re-typed an Anthropic key, switched to OpenAI,
came back, and the Anthropic key was gone). A related symptom: the connection
**Test** flow saved-before-testing and clobbered a known-good config when the
test failed (#456). Fixed by storing **one key column per provider** plus an
`active_provider` pointer (#460), surfacing all configured providers in a
Settings overview table with a per-row live **Test** (#459/#462), and not
persisting before a successful test.

Rule: when a setting is "the X for the currently selected Y", and Y can change,
store **one X per Y** with a pointer to the active Y — never a single shared X
slot. A shared slot makes every Y-switch a silent data-loss event for the
previous Y's value. The reference design is documented at
`docs/explorations/ai-key-management-adaptive-learner-reference.md`. Pairs with
"User-overlay merge semantics" (a per-key store is the structural fix for
clobber, the same way the union-vs-replace decision is for lists).
