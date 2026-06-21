# module-ai

Frontend offline counterpart of the backend AI routes (`/api/ai/*`).

- **Offline status:** Partial (browser-direct generation yes for CORS-capable
  providers; backend-only AI artifacts no).
- **Implemented:** browser-direct chat completions against the user's own
  provider key (stored in IndexedDB). Powers the offline editor generate /
  rewrite, article SEO-meta generation, chapter review, Story Bible / Storyboard
  extraction, book marketing copy, and the `.biblio.yaml` template fill. The
  single storage-mode-aware dispatcher is `aiComplete`.
- **Backed by:** `src/ai/{aiComplete,llmClient,reviewPrompts,metaPrompts,marketingPrompts}.ts`
  (app-coupled via the storage seam; re-exported, not relocated).
- **CORS reality:** only Google (Gemini), Anthropic (opt-in browser header),
  LM Studio, and a user-controlled `custom` endpoint serve CORS headers for
  browser-direct calls. OpenAI and Mistral do not, so AI features are *disabled
  with an honest reason* for them in Dexie mode (feature-strategy, policy #78).
  `providerSupportsBrowserTest()` is the single source of truth.
- **Missing:** the backend-only AI artifacts — the streaming SSE chapter-review
  download, the server token/cost estimate, and the `.biblio.yaml`
  Export/Import file round-trip (`ai-template-file-io`, desktop-only) — have no
  browser equivalent.
