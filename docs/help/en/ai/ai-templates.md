# AI Templates (Articles + Books)

> Status: ships in v0.31.0+ (Session 1 backend landed; Session 2
> frontend in progress). Screenshots and the LM Studio / Ollama
> walkthroughs land with Session 2.

## What it is

Bibliogon's AI templates let you fill the metadata fields of an
Article or Book - SEO title, tags, image-generation prompts,
back-cover blurbs, chapter summaries, and so on - without typing
everything by hand. Three workflows are supported, all using the
same `.biblio.yaml` template format:

1. **Built-in AI** — Click "Fill with AI" in the article/book
   sidebar. Bibliogon calls your configured provider (Anthropic,
   OpenAI, Google, Mistral) and applies the result.
2. **Custom local endpoint** — Point Bibliogon's AI settings at
   LM Studio, Ollama, or any OpenAI-compatible local server. The
   "Fill with AI" button uses your local model instead of a paid
   cloud API.
3. **External AI via YAML round-trip** — Export an empty (or
   filled) template, paste the YAML into Claude.ai or ChatGPT,
   get the filled YAML back, and re-import. No API key needed.

All three produce the same `.biblio.yaml` and apply through the
same import pipeline.

## The template format

A `.biblio.yaml` is self-explanatory: every fillable field
carries a `description`, a realistic `example`, and the
`current_value` (which the AI fills in). The top of the file
has the rules-for-AI block - so the same file works when you
hand it to any AI, no Bibliogon context required.

> Screenshots and a complete example file will land with the
> Session 2 frontend ship.

## Field-classes

Pick which categories to fill. You don't have to fill them all
at once.

**Articles**

- `seo` — seo_title + seo_description
- `tags` — 5-10 lowercase tags
- `topic` — single primary topic
- `excerpt` — 200-300 char conversational summary
- `image_prompts` — featured image prompt + inline section
  prompts (one per H2 heading, capped at 5)

**Books**

- `marketing_copy` — backpage_description, backpage_author_bio,
  html_description (Amazon-style)
- `tags` — keywords for marketplace search
- `description_genre` — internal description + genre
- `cover_prompt` — Stable-Diffusion-style cover prompt
- `chapter_summaries` — one-sentence summary per chapter

## Bulk operations

For larger batches (up to 50 items at a time):

- **Bulk export templates** → ZIP with one `.biblio.yaml` per
  record. Edit them however you like.
- **Bulk import templates** → ZIP back in. Each entry is matched
  to its record by `reference.id`.
- **Bulk fill with AI** → kicks off a background job. Watch
  progress live via the SSE stream. Before you confirm, the
  **estimate dialog** shows the per-item cost breakdown for the
  field-classes you selected, plus the total.

## Force override

By default, AI-fill skips fields that already have a value. To
overwrite existing content, enable "Force override" in the
dialog (or pass `?force=true` to the API).

> Walkthroughs for the LM Studio Local Server setup and Ollama's
> `ollama serve` mode land with the Session 2 ship of this page.
