# A+ Content plugin

Generates an Amazon A+ Content package from a book already in Bibliogon:
a short description, three bullets, a header module and a three-image
module, each image slot with an alt text and an image prompt. The AI
drafts the copy; a deterministic validator decides whether it passes.
Design and pre-audit findings: issue #825.

Backend only. There is no UI yet; the API contract for the one to come
is in [docs/API.md](../../docs/API.md#a-content-plugin-aplus-825).

## Endpoints

- `POST /api/aplus/{book_id}/generate?language=&force=` - generate, or
  return the cached package.
- `GET /api/aplus/{book_id}?language=` - the last stored package.

Parameters, status codes, the missing-fields response and the cache
rules are documented in `docs/API.md`; `routes.py` is the source.

## How a package is produced

1. `book_context.build_book_context` normalises the Book row: the first
   non-empty of `description` / `html_description` /
   `backpage_description` (HTML stripped), decoded BISAC / category /
   keyword lists, and a genre key. Required fields are checked first
   (`find_missing_fields`); if any is missing, no AI call happens.
2. `prompts.py` builds a system prompt (the rules in plain language) and
   a user prompt (book metadata + the expected YAML shape). The model
   replies with a YAML fragment, same convention as the AI-fill features.
3. `generator.generate_package` parses the reply tolerantly (a missing
   key becomes an empty value, never an exception), runs
   `validation.validate_package`, and retries with the error findings
   appended to the prompt while errors remain: 1 initial attempt plus
   `max_regeneration_retries` (2) from the ruleset. After the last
   attempt the package is returned with its findings, not discarded.
4. `routes.py` stores the result in the `aplus_content` table, one row
   per book and language, keyed by a hash of every input that fed the
   prompt plus the ruleset version. Same input, same version: the stored
   package is returned without an AI call.

## Validation

`validation.py` runs against `rules/ruleset.yaml` only, independent of
the AI provider. Every finding names the field it concerns and carries
a severity:

- Errors: invalid or hidden characters, em/en dash, emoji, length over
  the schema limit, a marketing imperative (per-language phrase list,
  plus a field that opens with an imperative form: `... Sie` in German,
  `-ez` in French, a short list of bare verbs in English), a price or
  shipping claim, a competitor brand, an empty alt text, and any tone
  word escalated for the genre.
- Warnings: the default tone words (violence, theft, weapon, ...).
- Structure: exactly 3 bullets and exactly 3 image entries.

Genre escalation currently exists for `kinderbuch` in all four languages
(`de`, `en`, `fr`, `es`). The genre key comes from `Book.genre`, then
`book_type == "picture_book"`, then a `JUV` BISAC code, then a
children's-book phrase in the title or descriptions.

Bump `version` in the ruleset whenever a rule changes. Cached packages
record the version they were validated against, so a bump invalidates
all of them on the next `generate` call.

## Image style: not wired yet

`image_prompts.py` resolves aspect ratio, target pixel size, model hint
and style flags per slot from the ruleset's `image_style` block, but no
caller uses it. Generated packages carry the model's keywords only.
Tracked in #865.

## Files

| File | Role |
|---|---|
| `plugin.py` | `AplusPlugin`, registers the router |
| `routes.py` | the two endpoints, cache read/write |
| `book_context.py` | Book row -> `BookContext`, genre resolution, missing-field check |
| `prompts.py` | system + user prompt, correction section for retries |
| `generator.py` | generate -> validate -> retry loop, source hash |
| `validation.py` | deterministic rules |
| `rules.py`, `rules/ruleset.yaml` | typed loader + the versioned rules |
| `image_prompts.py` | per-slot image style (unused, #865) |
| `schema.py` | `AplusPackage` and friends |

Core side: `AplusContent` model (`backend/app/models/__init__.py`),
migration `backend/migrations/versions/f7a8b9c0d1e2_add_aplus_content.py`,
plugin metadata `backend/config/plugins/aplus.yaml` (no settings),
`.bgb` backup export + restore of `aplus_content`.

## Tests

```bash
make test-plugin-aplus
```

runs the plugin's own suite (rules, validation, prompts, generator,
image style) in its isolated venv, which has no `app` package. The
endpoint tests and the book-context tests that need the core
(`app.services.html_text`, the AI client) live in
`backend/tests/test_aplus_endpoint.py` and
`backend/tests/test_aplus_book_context.py` and run with `make test-backend`.
