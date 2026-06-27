# Session journal - 2026-06-27

## Offline grammar-check & translation via the browser-direct AI providers (#661)

- Original prompt: "Offline Grammar/Translation via KI-Provider" - grammar-check
  and translation are gated as server-bound (LanguageTool / DeepL through the
  backend). All 6 AI providers are browser-capable, so both can run offline via
  the AI path. Switch the gate from needs-backend to AI-key-required.
- Goal: a browser-direct, offline-capable grammar correction + translation in
  the editor, gated on the user's AI key, working in the backendless Dexie PWA.

### What shipped

1. **`frontend/src/ai/aiTextTools.ts`** - `aiCorrectGrammar(text)` +
   `aiTranslate(text, targetLang, sourceLang?)`. Browser-direct via the existing
   `llmClient` (`getAiConfig`/`isAiConfigured`/`aiChat`), low temperature,
   strips a stray Markdown code fence, returns the rewritten text only. Throws
   `AiClientError` when no usable key. Unit test: 7 cases.
2. **`frontend/src/components/editor/AiTextTools.tsx`** - self-contained editor
   row: two buttons (Grammatik (KI) / Übersetzen (KI)) + a result panel
   (apply-to-selection / copy / close), a target-language picker for translate
   (8 UI languages). Operates on the selection (full text fallback). Rendered
   only in Dexie mode (online the backend LanguageTool/DeepL path applies and
   the browser has no provider key). Component test: 11 cases.
3. **Feature gates** - new `AI_GRAMMAR` / `AI_TRANSLATE` ids in the `NEEDS_KEY`
   bucket (key-dependent: active with a key, disabled + `requires_ai_key`
   without; three-state visibility per policy #78). They are the offline AI
   alternative that COEXISTS with the desktop-premium backend `GRAMMAR` /
   `TRANSLATION` gates, not a replacement.
4. **i18n** - 15 new `ui.editor.ai_*` keys across all 8 catalogs + the offline
   seed mirrors (`seed-i18n-*.json`).
5. **Feature-screenshot** - a best-effort dexie-mode capture block.

### Why new gate ids instead of repurposing GRAMMAR/TRANSLATION

Audit of all callers (the "audit all callers of a touched gate" rule): the
existing `GRAMMAR` gate drives the backend LanguageTool spellcheck button and
`TRANSLATION` drives `ArticleTranslatePanel` (whole-article DeepL, server-side
new-article creation). Both genuinely need the backend; flipping their gate to
key-dependent would (a) make `ArticleTranslatePanel` try `/api` in Dexie+key
mode (breaks the zero-`/api` offline gate + its tests) and (b) misroute the
LanguageTool button. The browser-direct AI key is also stripped from the
settings response online, so these tools can only work browser-direct in Dexie
mode. Parallel `ai-grammar` / `ai-translate` gates give the offline capability
cleanly while the backend surfaces stay the desktop-premium path - exactly the
coexistence described in #661.

### Verification

- `aiTextTools` 7, `AiTextTools` 11, `featureConfig` 13 (incl. the new
  key-dependent gate test) - all green.
- `tsc --noEmit` clean; ESLint clean on the new files; CSS tokens verified.
- Editor + page tests (BookEditor/ArticleEditor) green - AiTextTools returns
  null in API mode, so existing surfaces are untouched.

Branch: `claude/offline-grammar-translation-ki-wnfj85` -> PR against `develop`.
