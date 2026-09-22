# API reference - high-level overview

Bibliogon exposes two API layers: a core with CRUD endpoints for
books, chapters, assets and system functions, and one router per
active plugin under that plugin's prefix.

> **Source of truth:** the exact, current endpoint list including
> request and response schemas is provided by the FastAPI OpenAPI
> documentation in the running backend:
>
> - Interactive: [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI)
> - JSON: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)
>
> This file is only a high-level overview. It is intentionally not
> maintained per endpoint (maintenance debt) and is only touched on
> larger structural changes.

---

## Core API

Groups under `backend/app/routers/` (router prefix in parentheses):

| Router              | Prefix                                          | Purpose                                               |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `books`             | `/api/books`                                    | Book CRUD, trash, per-book audio/ms-tools config      |
| `chapters`          | `/api/books/{id}/chapters`                      | Chapter CRUD and reordering                           |
| `assets`            | `/api/books/{id}/assets`                        | Asset upload, serving, cover upload                   |
| `audiobook`         | `/api`                                          | Audiobook persistence, engine config, dry run         |
| `covers`            | `/api`                                          | Cover validation and download                         |
| `backup`            | `/api/backup`                                   | `.bgb` export/restore, smart import, `compare`        |
| `licenses`          | `/api/licenses`                                 | License activation and management                    |
| `settings`          | `/api/settings`                                 | App settings, plugin settings, theme                  |
| `plugin_install`    | `/api/plugins`                                  | Plugin ZIP installation, discovery, health            |
| `ai`                | `/api/ai`                                       | Core AI: chat, generate, review (sync + async), marketing text, providers |

Example endpoints (not exhaustive):

- `GET /api/books` - list all books
- `PATCH /api/books/{id}` - book metadata including TTS settings,
  audiobook overwrite flag, audiobook skip chapter types and
  per-book ms-tools thresholds
- `POST /api/books/{id}/chapters` - create a chapter
- `GET /api/backup/export` - full-data backup as `.bgb`
- `POST /api/backup/compare` - compare two `.bgb` files
- `POST /api/books/{id}/export/async/{fmt}` - start an async export job
- `GET /api/export/jobs/{id}/stream` - Server-Sent Events progress feed
- `POST /api/books/{id}/audiobook/dry-run` - sample preview + cost preview

### AI review extension (v0.20.0)

The `/api/ai/` router hosts the multi-provider AI features. The review path supports both synchronous (legacy) and async flows:

- `POST /api/ai/review` - synchronous chapter review; accepts `chapter_type` so the system prompt can tailor feedback per section (e.g. dedication vs chapter).
- `POST /api/ai/review/async` - submit a review as a background job. Returns `{job_id, review_id}`. The worker persists a Markdown report to `uploads/{book_id}/reviews/{review_id}-{chapter-slug}-{YYYY-MM-DD}.md`.
- `GET /api/ai/jobs/{job_id}` - poll current status, progress and (when terminal) the inline review.
- `GET /api/ai/jobs/{job_id}/stream` - Server-Sent Events feed of progress events (`review_start`, `review_llm_call`, `review_done`, `stream_end`).
- `DELETE /api/ai/jobs/{job_id}` - cancel a running review.
- `GET /api/ai/review/{review_id}/report.md?book_id=...` - download the persisted Markdown report.
- `POST /api/ai/review/estimate` - rough input-token + USD cost estimate (uses a chars/4 heuristic and a small per-model pricing dict).
- `GET /api/ai/review/meta` - UI metadata: all focus values, the three primary UI focus values, non-prose chapter types, supported languages, chapter types. The frontend reads this to drive the radio buttons + non-prose warning without hardcoding.

Review focus values: `style` (existing) plus `consistency` (new: within-chapter contradictions, distinct from `coherence` which checks logical flow) and `beta_reader` (new: simulated first-read feedback). Legacy values (`coherence`, `pacing`, `dialogue`, `tension`) stay on the API for power users but are no longer exposed in the UI.

Cascade on chapter delete: when a chapter is removed, all review Markdown files whose filename contains the chapter's slug are deleted alongside the chapter row.

---

## Plugin routers

Every active plugin can register its own endpoints. The prefix is
always the plugin name:

| Plugin         | Prefix              | Purpose                                          |
| -------------- | ------------------- | ------------------------------------------------ |
| export         | `/api/books/{id}/export` + `/api/export/jobs` | EPUB/PDF/DOCX/HTML/Markdown/project, async jobs with SSE |
| audiobook      | `/api/audiobook`    | Engine config (ElevenLabs, Google), voices       |
| ms-tools       | `/api/ms-tools`     | Style checks, sanitize, readability, metrics     |
| translation    | `/api/translation`  | DeepL + LMStudio, book and chapter translation   |
| grammar        | `/api/grammar`      | LanguageTool check, language list                |
| kdp            | `/api/kdp`          | KDP metadata, cover validation, changelog        |
| kinderbuch     | `/api/kinderbuch`   | One-image-per-page layouts                       |
| help           | `/api/help`         | Shortcuts, FAQ, in-app help content              |
| getstarted     | `/api/get-started`  | Onboarding guide, sample book                    |
| git-sync       | `/api/git-sync`     | Git-backed import + sync for write-book-template repos |
| medium-import  | `/api/medium-import`| Bulk import of Medium HTML export ZIP            |
| comics         | `/api/comics` + `/api/books/{id}/comic-*` | Comic-book panels + per-panel speech bubbles (CRUD, reorder, cross-page move); identity probe `/api/comics/info` |
| story-bible    | `/api/story-bible`  | Per-book fiction entities: type registry, CRUD, page/chapter links, relationships, auto-detect, continuity check, Markdown export |
| learnset       | `/api/learnset`     | Export a book as an adaptive-learner learn set (schema-validated scaffold ZIP) |
| promotion      | `/api/promotion`    | Portfolio board: per-book retail-format status, store URLs, ASIN, universal link, CSV import with dry-run |
| aplus          | `/api/aplus`        | Amazon A+ Content: AI-generated package (validated + cached) and the author's editable document, per book and language (see below) |

Examples:

- `POST /api/export/async/audiobook` - start audiobook generation as
  an async job (respects Book.audiobook_overwrite_existing and
  Book.audiobook_skip_chapter_types)
- `POST /api/ms-tools/check` - style check with per-request thresholds
  or per-book overrides via `book_id`
- `POST /api/audiobook/config/elevenlabs` - save the ElevenLabs key
  and validate it against the API
- `POST /api/medium-import/import` - upload a Medium HTML export ZIP
  (`multipart/form-data` with `file=<zip>`); response is a per-file
  outcome summary (imported / skipped on canonical-URL dedup /
  errored). See [docs/help/en/import/medium.md](help/en/import/medium.md)
  for the user-facing recipe.

### A+ Content (plugin-aplus, #825)

Source: `plugins/bibliogon-plugin-aplus/bibliogon_aplus/routes.py`,
behaviour pinned by `backend/tests/test_aplus_endpoint.py` (generation)
and `backend/tests/test_aplus_document_endpoint.py` (editable document).
The UI is the A+ Content section of the book metadata editor (#887).

`POST /api/aplus/{book_id}/generate?language=<code>&force=<bool>`

- `language` (optional): one of `de`, `en`, `fr`, `es`. Defaults to the
  book's `language`. Anything else is a 400.
- `force` (optional, default `false`): skip the cache and call the AI
  again.
- Order of checks: AI disabled in settings -> 400. Unknown or trashed
  book -> 404. Required fields missing -> **200** with a
  `MissingFieldsResponse` (`{book_id, missing_fields: [{field, reason}]}`)
  and **no AI call**. Required today: `author`, and at least one of
  `description` / `html_description` / `backpage_description`. This is a
  structured response, not an error, so a UI can prompt for exactly
  those fields.
- Cache: the response is stored in `aplus_content` (one row per
  `book_id` + `language`). A repeat call returns the stored package
  when the `source_hash` (title, subtitle, author, language, resolved
  description text, genre key, BISAC codes, categories, keywords) and the
  ruleset version both still match. Editing any of those fields, or
  bumping the ruleset version, invalidates it. `force=true` bypasses it.
- AI provider unreachable, auth or timeout failure -> 502 naming the
  cause (`ExternalServiceError`).
- Generation runs up to 3 attempts (1 + `max_regeneration_retries: 2`
  from the ruleset) while hard-error findings remain. After the last
  attempt the package is returned **and cached** with its remaining
  findings. A 200 therefore does not mean the copy is clean: read
  `validation` and treat any entry with `severity: "error"` as
  blocking.

`GET /api/aplus/{book_id}?language=<code>`

- Returns the last stored package for the book + language (default:
  the book's language, else `en`) as stored, plus the derived
  `rendered` string per image slot. It does not check whether the book
  has changed since; only `POST .../generate` does.
- 404 when the book is unknown or nothing was generated for that
  language yet.

Package shape (`bibliogon_aplus/schema.py`, `AplusPackage`):

```
short_description: str
bullets: [{heading, body}]                       # exactly 3 expected
module_header: {title, text, image, alt_text}
module_three_images: [{title, text, image, alt_text}]   # exactly 3
validation: [{field, severity: "error"|"warning", message}]
meta: {book_id, language, model, ruleset_version, generated_at}
```

Each `image` (the header and every tile, #865):

```
image:
  prompt: "<descriptive keywords from the model, comma-separated>"
  aspect_ratio: "97:60"      # header; tiles "1:1"
  size: "970x600"            # header; tiles "300x300"
  style_flags: ["photorealistic", "editorial", "no text overlay"]
  rendered: "<prompt> --ar <aspect_ratio> <style_flags joined by spaces>"
```

`aspect_ratio`, `size` and `style_flags` come from the ruleset's
`image_style` block, resolved for the book's genre key: a `kinderbuch`
gets the illustration flags (`friendly illustration`, `warm colors`,
`children's book art style`, `no text overlay`), everything else the
default set. `rendered` is derived on every response and never stored,
so the form can change without a data migration; an empty `prompt`
renders as `""`. Rows cached before the image block existed (ruleset
version `2`) come back from `GET` without `image`; the next `POST`
regenerates them because the ruleset version no longer matches.

`validation[].field` names the offending slot (`short_description`,
`bullets[1].body`, `module_three_images[0].alt_text`, ...). Limits and
rules come from `bibliogon_aplus/rules/ruleset.yaml` (currently version
`3`): 300 / 160 / 1000 / 200 characters for short description / bullet
heading / bullet body / alt text; em or en dash, emoji, hidden or
control characters, per-language marketing imperatives (a phrase list,
plus an imperative opening: `... Sie` in German, `-ez` in French, a few
bare verbs in English), price or shipping claims, competitor brand
names and empty alt text are errors;
tone words (violence, theft, ...) are warnings, escalated to errors
when the resolved genre key is `kinderbuch`.

Genre key resolution (`book_context._resolve_genre_key`):
`Book.genre` (lowercased) > `book_type == "picture_book"` > a
`JUV`-prefixed BISAC code > a children's-book phrase in title, subtitle
or any description field. Only the first tier is reliable; the rest are
fallbacks for books nobody has tagged (#830, #839, #854).

Editable document (#891): what the author ships, filled by hand, from
an AI result, or both. Stored in `aplus_documents`, separate from the
generation cache, so a regeneration never overwrites manual edits.

- `GET /api/aplus/{book_id}/document?language=<tag>`: the document, or
  404 when none exists yet.
- `PUT /api/aplus/{book_id}/document?language=<tag>`: create or replace.
  Body `AplusDocumentBody`: `content_name`, `short_description`,
  `bullets` (`[{heading, body}]`, max 10) and `modules` (max 20), each
  `{id, template, module_title, slots: [{title, text, image_prompt,
  alt_text}]}` (max 10 slots). `template` is a slug (`^[a-z0-9_]{1,40}$`);
  the template catalog lives in the frontend. Fields have no length
  limit: the editor shows the ruleset limits as counters, a draft over
  a limit still saves. Returns the stored document plus `book_id`,
  `language`, `updated_at`.
- `DELETE /api/aplus/{book_id}/document?language=<tag>`: 204.
- `language` defaults to the book's language. Any plain language tag
  is accepted (not only the four AI languages); a malformed one is 400.
  Unknown or trashed book is 404.

`aplus_content` and `aplus_documents` rows are part of the `.bgb`
backup (export + restore).

---

## Error handling

All endpoints use the shared `BibliogonError` hierarchy. The global
exception handler in `backend/app/main.py` maps to HTTP codes:

- `NotFoundError` -> 404
- `ValidationError` -> 400
- `ConflictError` -> 409 (e.g. `audiobook_exists` confirm)
- `ExportError`, `PluginError` -> 500
- `ExternalServiceError` -> 502 (Pandoc, LanguageTool, TTS backends)

In debug mode (`BIBLIOGON_DEBUG=true`) the response additionally
contains a `traceback` entry that the frontend embeds in the
"Report issue" button.
