# Chat Journal — Session 2026-06-08

## AI 1b — offline template `aiFill` port (#34 last item)

The final Maximal-Offline (#34) item: port the in-editor "Fill with AI"
template fill to run browser-direct offline. Shipped in 5 atomic green commits
(`c09359dd..90d186d1`), pushed to `main`.

### 1. Status correction up front (10:00)

- A parallel-planner (CCW) CC-Prompt arrived describing "AI v1 / 1a"
  (Dexie AI-config + browser LLM client + single-field generator). But 1a was
  already shipped (`bb761161`, `frontend/src/ai/llmClient.ts` + marketing
  prompts exist). Per the multi-tool-coordination discipline, surfaced the
  drift in chat rather than re-implementing 1a, and proceeded with 1b (the
  user's direct ask + the only remaining #34 item per the handover).
- Pulled `origin/main` first (CCW's repository-pattern refactor arc,
  `ad8dd6ab..ccd884bc`, fast-forward, no AI/frontend overlap).

### 2. Two decisions made before coding

- **JSON not YAML:** the backend aiFill parses YAML fragments from the LLM;
  the frontend has no YAML parser (none transitive). Chose JSON output for the
  offline prompts (native `JSON.parse`, mirrors 1a's marketing-keywords-as-JSON
  precedent) over adding a `yaml` dependency. The apply pipeline (the risk
  surface) is ported verbatim; only the wire format changes.
- **Scope = editor-visible field-classes:** `featured_image_prompt`/
  `inline_image_prompts` (article) and `cover_image_prompt`/`chapter_summaries`
  (book) are serialized by the backend but NOT declared on the frontend
  Dexie/API entity shape. Offline fill covers only the classes whose targets
  exist on that shape (article seo/tags/topic/excerpt; book marketing_copy/
  tags/description_genre). The other three are deferred (ROADMAP follow-up) to
  avoid invisible persistence + a Dexie-schema audit for non-rendered fields.

### 3. Commits

- **C1** `ai/templateApply.ts` (`c09359dd`): `applyField`/`isTemplateValueEmpty`/
  `isColumnPopulated`/`parseAiObject`/`extractBodyText` + 17 tests. Lists are
  native arrays here (not the backend's json.dumps text).
- **C2** `ai/fillTypes.ts` + `articleFillPrompts.ts` + `bookFillPrompts.ts`
  (`2a4e80ca`): JSON-shaped per-class prompts + field-class→target registries
  + 8 tests.
- **C3** `ai/aiFill.ts` (`99242c66`): `aiFillArticle`/`aiFillBook` orchestrator
  — load entity via seam → per-class `aiChat` → parse → apply → persist via
  seam; same `AiFillResponse` shape as online; per-class error isolation.
  9 tests. (One tsc fix: skip-reason maps typed `ApplySkipReasons`, not
  `Record<string,string>`.)
- **C4** AITemplatePanel offline wiring (`3f0e5f66`): branch Fill on
  `offlineGate`, availability via `isAiConfigured`, `FieldClassDialog`
  `availableClasses` whitelist, un-gate Fill (Export/Import stay gated),
  `ui.ai_template.offline_configure_key` in 8 catalogs + reseed, new
  offline-branch component test (existing online test untouched).
- **C5** `e2e/smoke/offline-ai-fill.spec.ts` (`90d186d1`): full offline Fill
  flow against a mocked provider.

### 4. The E2E real run paid off

Ran the spec against a live (Playwright-booted) server. First run **failed** —
not a feature bug: (a) a race where the test navigated away before the async
Settings save landed in Dexie (fixed by waiting for the save toast), and
(b) my assertion expected the English hint but the app boots German by default.
Also made the provider mock return BOTH openai-compat and Anthropic response
shapes so it works regardless of the seeded provider (dropped a fragile
RadixSelect interaction). Re-run: **2/2 passing**, zero `/api`, SEO field
persisted across reload. The unit tests were all green throughout — only the
real browser caught the race ("passing tests != working feature").

### 5. Gates

- Vitest full suite **2867 passed** (245 files); `tsc --noEmit` clean; i18n
  parity 51; offline-ai-fill E2E 2/2 (real run). pre-commit clean on the
  backend i18n changes.

### Live-verify gaps (Aster, real browser)

- AI CORS per provider (real key needed) — unchanged from 1a.
- The offline-ai-fill spec joins the Pre-Release Gate suite Aster runs.

### Deferred (filed in ROADMAP)

- Offline AI field-classes `image_prompts` / `cover_prompt` /
  `chapter_summaries` (targets not on the Dexie/API shape).
- `.biblio.yaml` template export/import round-trip offline (stays gated).
