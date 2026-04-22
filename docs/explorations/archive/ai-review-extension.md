# AI Review Extension

Status: Shipped in v0.20.0 (2026-04-20). Archived.
Last updated: 2026-04-22
Source: pre-audit findings + UX review.

---

## 1. Context

Bibliogon already ships AI chapter review as a **core** feature, not a
plugin (`backend/app/ai/`). Today's review supports a flat focus list
(`style`, `coherence`, `pacing`, `dialogue`, `tension`), runs synchronously,
returns inline JSON only, and is not persisted.

Need: three explicit, user-friendly review modes - stylistic, internal
consistency, simulated beta-reader - with persisted Markdown reports the
author can re-open after closing the panel. Constraint: AI is core, so
extend it, do not duplicate via a new plugin.

## 2. Existing state

Pre-audit confirms what already exists. Implementation reuses:

- LLM client: [backend/app/ai/llm_client.py:26](../../backend/app/ai/llm_client.py#L26)
- Review endpoint: `POST /api/ai/review` in [routes.py:217](../../backend/app/ai/routes.py#L217)
- System-prompt builder: `_build_review_system_prompt` in [routes.py:171](../../backend/app/ai/routes.py#L171)
- Marketing language map (reusable): [routes.py:313](../../backend/app/ai/routes.py#L313)
- Frontend handler: `handleAiReview` in [Editor.tsx:572](../../frontend/src/components/Editor.tsx#L572)
- Async job store: [backend/app/job_store.py](../../backend/app/job_store.py)
- File-delivery precedent: `uploads/{book_id}/audiobook/` mirrors the
  recommended `uploads/{book_id}/reviews/`
- Existing focus values: `style`, `coherence`, `pacing`, `dialogue`, `tension`

## 3. Resolved decisions

### 3.1 Feature naming

No new feature name. Existing `ai_review` is extended with new focus
values and new output modes. UI keeps the "AI Review" label. No
migration, no deprecation.

### 3.2 API key storage

Stay on plaintext YAML at `backend/config/app.yaml` (`ai.api_key`). No
keyring integration in this scope. Keyring migration for ALL AI-related
keys (Anthropic + ElevenLabs + DeepL + LanguageTool) is tracked as a
separate ROADMAP item under security/hygiene. Mixing two storage
patterns inside one feature creates inconsistency.

### 3.3 Sync vs async execution

Asynchronous. New review calls go through `app.job_store.JobStore` with
SSE progress updates. The existing synchronous `POST /api/ai/review`
stays for backward compatibility (removal out of scope).

New endpoint: `POST /api/ai/review/async` returns `job_id`. SSE
endpoint: implementation session decides between sharing the existing
`/api/export/jobs/{job_id}/stream` (rename recommended) or mounting a
new `/api/ai/jobs/{job_id}/stream`.

### 3.4 Focus values vs new endpoints

Single endpoint, extend the existing `focus[]` array. New values:

- `style` (already exists - maps to "Style review")
- `consistency` (NEW - within-chapter contradictions, distinct from
  existing `coherence` which checks logical flow)
- `beta_reader` (NEW - open-ended simulated-reader feedback)

Existing values (`coherence`, `pacing`, `dialogue`, `tension`) stay
available for power users and back-compat.

### 3.5 Output: inline + downloadable

Both. Inline output in the existing AI panel stays unchanged. New
capability: the generated Markdown is additionally written to disk and
exposed via a download endpoint.

Download endpoint: `GET /api/ai/review/{review_id}/report.md` returns
`FileResponse`. Filename pattern:
`{review_id}-{chapter_slug}-{YYYY-MM-DD}.md` for human readability.

### 3.6 Focus naming for UI

User-facing labels chosen for clarity, not technical precision:

- `style` -> "Style" (DE: "Stil")
- `consistency` -> "Consistency" (DE: "Konsistenz") - shorter and more
  intuitive than `consistency_internal`
- `beta_reader` -> "Beta Reader" (DE: "Testleser") - avoids the
  negative connotation of "critical" and matches publishing-industry
  jargon

### 3.7 UI pattern: radio buttons (single-select)

The three primary focus values are mutually exclusive radio buttons.
User selects exactly one per review call.

Multi-focus stays supported by the backend (`focus[]` is still an
array) but is NOT exposed in the primary UI. Power users combine via
direct API calls.

Rationale: single-select matches the user's mental model ("I want a
stylistic review") and produces clearer structured reports than
combined-focus calls.

### 3.8 Review persistence

Reviews persist to disk under
`uploads/{book_id}/reviews/{review_id}-{chapter_slug}-{timestamp}.md`.

Rationale: reviews cost real money (API tokens). Losing them on browser
refresh is unacceptable UX.

MVP UI surface: none. No history panel, no review browser. Files exist
on disk; users re-access via the download endpoint with a known
review_id, or via a future history UI.

No database table for reviews in MVP. Filename is the metadata.

### 3.9 Cascade delete on chapter removal

When a chapter is deleted, all review files in
`uploads/{book_id}/reviews/` matching that chapter's slug are deleted.

Implementation: chapter-slug in the review filename is the link.
Deletion walks the reviews directory, matches on filename prefix
containing the chapter slug, removes matches.

This is the only viable option given MVP lacks a review-listing UI.
Orphaned review files would accumulate invisibly.

### 3.10 Chapter-type context in prompt

`chapter_type` injected into the system prompt. Prompt builder prepends:
`"You are reviewing a {chapter_type_label}. {chapter_type_guidance}"`

`CHAPTER_TYPE_GUIDANCE` dict maps all 31 ChapterType values to short
guidance strings (e.g. `dedication` -> "brief, personal, keep feedback
minimal and tone-focused"; `chapter` -> "narrative prose, standard
review criteria"). Unknown values fall back to generic prose guidance.
Guidance strings follow the book's language (3.12).

Token cost: ~30-50 extra per call, negligible.

### 3.11 Non-prose chapter-type warning

For non-prose types (`title_page`, `copyright`, `toc`, `imprint`,
`index`, `half_title`, `also_by_author`, `next_in_series`,
`call_to_action`, `endnotes`, `bibliography`, `glossary`), the AI panel
shows an inline warning above the start button. Non-blocking; user can
proceed.

Warning language: **book's language** (`book.language`), not UI
language. Warning is content-related, matches review output language,
avoids dedicated UI i18n keys. Pattern matches terse AI panel style;
NOT a confirm dialog (those reserved for destructive ops).

Examples:
- EN: "This section is not typical prose. Review feedback may be
  limited."
- DE: "Dieser Abschnitt ist kein typischer Prosa-Text. Das Review
  koennte eingeschraenkt sein."

### 3.12 Language support: all 8

Pre-audit suggested DE/EN MVP with fallback. Rejected.

All 8 supported Bibliogon languages (DE, EN, ES, FR, EL, PT, TR, JA)
get explicit prompt support. Implementation: extend the existing
`lang_map` dict at [routes.py:313](../../backend/app/ai/routes.py#L313)
(already explicit for marketing prompts) and reuse from the review
prompt builder.

Effort: ~10 LoC. Full language parity at near-zero cost. No silent
degradation for non-MVP-language books.

### 3.13 Token cost estimation

UI shows estimate inline on review button:
`"Start Review (~5,000 tokens, ~$0.075)"`

MVP method: character heuristic (`chars / 4 ~= tokens`). No new dep.
Precise counting (`tiktoken` / Anthropic `count_tokens`) is post-MVP.
Cost uses a small hardcoded pricing dict next to
[providers.py](../../backend/app/ai/providers.py), updated on provider
price changes.

### 3.14 Async UI pattern

While review runs (5-60s):
- Spinner; panel stays visible (no editor takeover)
- Rotating status messages: "Preparing review...", "Analyzing text...", "Generating report..."
- No real progress bar (LLM token streaming does not map to percentage)
- User can close panel; review continues via JobStore; result re-appears on reopen or via toast

Status-message language: book language (3.11 rationale).

## 4. Implementation skeleton

1-2 sessions. NOT a multi-session blueprint.

**Backend:** add `consistency`, `beta_reader` to focus enum + prompt
mapping; add `chapter_type` to `ReviewRequest` + `CHAPTER_TYPE_GUIDANCE`
dict; reuse `lang_map` from marketing path for all 8 langs in review
builder; new `POST /api/ai/review/async` -> `JobStore.submit(...)`;
worker writes Markdown to `uploads/{book_id}/reviews/`, publishes
events; new `GET /api/ai/review/{review_id}/report.md` -> `FileResponse`;
chapter-delete hook in [routers/chapters.py](../../backend/app/routers/chapters.py)
walks reviews dir + deletes slug-prefixed files.

**Frontend:** three radio buttons in AI panel review tab; inline
non-prose warning above start button; cost estimate on button (chars/4
+ pricing dict); SSE subscribe in `handleAiReview`, rotating status
messages, render result on `review_done` event with download button.

**Tests:** extend [test_ai_review.py](../../backend/tests/test_ai_review.py)
with new focus values, chapter_type prompt injection, all-8-lang
coverage; new tests for async flow + FileResponse download + cascade
delete.

**i18n:** new UI keys in 8 langs for radio labels, "Start Review",
"Download Report". Warning + status messages live as code constants
per book language (see 3.11, 3.14), NOT in i18n YAML.

## 5. Out of scope

- Keyring API-key storage (separate ROADMAP item)
- Review history UI / review browser
- Multi-focus UI (backend supports, UI does not expose)
- Multi-chapter review (single chapter per call)
- Review comparison / diffing
- `tiktoken` precision upgrade
- Inline TipTap comment marks
- Custom review-type plugins
- Budget / monthly cost caps
- Third-party review-engine support

## 6. Cross-references

- [backend/app/ai/routes.py](../../backend/app/ai/routes.py) - existing review endpoint to extend
- [backend/app/ai/llm_client.py](../../backend/app/ai/llm_client.py) - LLM client reused as-is
- [backend/app/job_store.py](../../backend/app/job_store.py) - async job pattern
- [docs/explorations/desktop-packaging.md](desktop-packaging.md) - desktop distribution affects keyring relevance (out of scope here)
- [.claude/rules/architecture.md](../../.claude/rules/architecture.md) - AI-as-core precedent
- [docs/CONCEPT.md](../CONCEPT.md) - offline-first principle preserved via `ai.enabled` flag
