# AI Templates (Articles + Books)

Bibliogon's AI templates let you fill the metadata fields of an
Article or Book — SEO title, tags, image-generation prompts,
back-cover blurbs, chapter summaries, and so on — without typing
everything by hand. The same `.biblio.yaml` format powers three
equally first-class workflows; pick whichever fits your setup.

> Screenshot: AI Template panel in article editor sidebar showing
> the three buttons "Fill with AI", "Export template", "Import
> filled template", with the field-class dialog open from "Fill
> with AI" listing the checkboxes for SEO / Tags / Topic / Excerpt
> / Image prompts.

## The three workflows

### Workflow A — Built-in AI

You configure an AI provider (Anthropic, OpenAI, Google, Mistral)
in Settings → AI Assistant, then click **Fill with AI** in the
article or book editor. Bibliogon calls the provider directly,
parses the YAML response, and applies the fields. The cheapest
flow ergonomically; costs whatever the provider charges per
request.

### Workflow B — Custom local endpoint

Point Bibliogon's AI settings at LM Studio, Ollama, or any
OpenAI-compatible local server. The **Fill with AI** button uses
your local model instead of a paid cloud API. No API key needed
for most local setups; latency depends on your hardware. See the
[LM Studio walkthrough](#lm-studio-walkthrough) and
[Ollama walkthrough](#ollama-walkthrough) below.

### Workflow C — External AI via YAML round-trip

Export an empty (or partially filled) `.biblio.yaml`, paste it
into Claude.ai or ChatGPT, get the filled YAML back, then upload
it via **Import filled template**. Zero API configuration on the
Bibliogon side; works with any AI service that can read and
return YAML.

## The template format

Every `.biblio.yaml` is self-explanatory. Every fillable field
carries three keys: a human-readable `description`, a realistic
`example`, and the `current_value` (which the AI fills). The top
of the file carries the rules-for-AI block — fill `current_value`
only, respond in the article's language, use real UTF-8
characters, leave fields null when uncertain. Those rules travel
WITH the file so workflow C works with any AI you happen to use
that day.

> Screenshot: a `.biblio.yaml` opened in a code editor showing
> the top-of-file comment block (rules for AI assistants 1-7)
> followed by the reference block (id, language, body_word_count,
> body_preview) and the first two fillable fields (title and
> seo_title) each with description + example + current_value.

## Field-classes

When you click **Fill with AI**, you pick which categories the
AI should fill. Each class is one LLM call.

### Articles

- **SEO** — SEO title (max 60 chars) and meta description
  (150-160 chars).
- **Tags** — 5-10 lowercase tags reflecting the article's
  topics.
- **Topic** — One-word or short-phrase primary topic.
- **Excerpt** — 200-300 character conversational summary for the
  article list.
- **Image prompts** — Stable-Diffusion-style prompts: one hero
  image + one per H2 section (capped at 5 by default; override
  in the dialog).

### Books

- **Marketing copy** — back-cover description + author bio +
  Amazon-style HTML description.
- **Tags** — 5-10 marketplace keywords.
- **Description & genre** — internal description + primary
  genre.
- **Cover prompt** — Stable-Diffusion-style prompt for the book
  cover.
- **Chapter summaries** — one-sentence summary per existing
  chapter, matched by chapter id.

## Per-record workflows

The article and book editor sidebars each carry an **AI Template**
panel with three buttons:

- **Fill with AI** — opens the field-class dialog. Pick which
  classes the AI should fill, optionally enable "Overwrite
  existing values" to force-update populated fields, click Fill.
- **Export template** — downloads the current record's
  `.biblio.yaml`. Open it in any editor, fill it manually, or
  paste it into an AI chat.
- **Import filled template** — drop a filled `.biblio.yaml`
  back in. The template's `reference.id` must match the target
  record. Force toggle works the same as Fill.

> Screenshot: Article editor sidebar with the AI Template panel
> mounted between PublicationsPanel and the Export section, all
> three buttons visible, panel collapsed (default layout).

By default, fields that already have a value are skipped. The
"Overwrite existing values" toggle in both the Fill and Import
dialogs lets you replace them.

### New from template

Both dashboards have a **New from template** button that
generates an empty `.biblio.yaml` in the language you pick. Fill
it manually or via AI, upload it, and a fresh record is created
with all the template fields applied.

> Screenshot: Articles dashboard header with the primary "Neuer
> Artikel" button next to the secondary "New from template"
> button, and the New-from-template dialog open with the language
> picker (defaulted to "de") and the empty drop zone.

## Bulk workflows

For batches up to 50 records, the bulk-action bar on each
dashboard exposes an **AI** dropdown with three items:

- **Export templates (ZIP)** — packs one `.biblio.yaml` per
  selected record into a ZIP. Edit them however you like and
  bring them back.
- **Import filled templates (ZIP)** — uploads a ZIP and applies
  each entry to its target record (matched by `reference.id`).
  Per-entry failures (parse error, unknown id, schema mismatch)
  surface in the response without killing the whole batch.
- **Fill with AI...** — the bulk AI-fill flow. Pick the field-
  classes, see a per-item cost breakdown before confirming, then
  watch the persistent dock report progress as the worker runs.

> Screenshot: Articles dashboard with 3 articles selected, the
> bulk-action bar visible at the top with the "AI" dropdown
> opened showing the three items, and the secondary Delete
> dropdown beside it for comparison.

### Pre-flight cost estimate

The **Confirm AI-fill estimate** dialog shows every item the
worker will hit and what each will cost. Below 10 items the per-
item table is inline; at or above 10 it's behind a "Per-item
breakdown" disclosure to keep the dialog compact. Totals always
show items, LLM calls, input tokens, output tokens, model name,
and estimated USD cost. The model name comes straight from your
AI Settings.

> Screenshot: the BulkAiFillConfirmDialog with 5 selected
> articles, the totals strip showing 5 items / 5 LLM calls /
> 4000 input tokens / 1000 output tokens / gpt-4o / $0.0125,
> and the inline per-item table below with one row per article
> listing input/output tokens and per-item cost.

If the configured model isn't in Bibliogon's pricing table,
costs render as "—" with a "Cost is unknown because the
configured model is not in the pricing table" disclaimer. The
job still runs; only the cost estimate is unavailable.

### Progress dock

After **Start AI-fill**, the dock takes over. It lives bottom-
left and shows the live progress bar plus the title of the
currently-processing item. Click it to expand the full per-item
modal with totals (items / updated / tokens / cost) and a
scrollable list of every item, color-coded by status
(running / done / skipped / error). Errors show the per-item
message inline; you can keep working in other parts of Bibliogon
while the job runs.

> Screenshot: the bulk-AI-fill dock minimized in the bottom-left
> corner of the dashboard showing "AI-fill: 3/5" with the
> progress bar at 60% and the current item title underneath,
> while the rest of the dashboard remains interactive.

> Screenshot: the bulk-AI-fill modal expanded showing the totals
> strip at the top and the per-item list with 5 rows: 3 marked
> done (green check) with token + cost stats, 1 running (blue
> spinner), 1 queued (no glyph).

After completion you can dismiss the dock, refresh the dashboard
to see all the updated metadata, or click into individual
records to verify the fill.

If you reload the browser while a job is running, Bibliogon
reconnects to the same job via localStorage and the dock comes
back. The job keeps running on the server regardless of whether
your browser is open.

## AI Settings

Open **Settings → KI-Assistent** (AI Assistant) to configure
your provider.

> Screenshot: Settings page with the KI-Assistent tab selected,
> showing the provider dropdown (set to "OpenAI (GPT)"), the
> Base URL field, the Model field, Temperature + Max tokens
> inputs, the masked API key field with the eye toggle, and the
> "Test connection" button.

The provider dropdown carries six options:

- **Anthropic (Claude)** — default Sonnet model, requires an
  Anthropic API key.
- **OpenAI (GPT)** — default `gpt-4o`, requires an OpenAI API
  key.
- **Google (Gemini)** — default `gemini-2.0-flash`, requires a
  Google API key.
- **Mistral** — default `mistral-large-latest`, requires a
  Mistral API key.
- **LM Studio (local)** — defaults to `http://localhost:1234/v1`,
  no API key needed. See [LM Studio walkthrough](#lm-studio-walkthrough).
- **Custom (OpenAI-compatible)** — leaves Base URL and Model
  empty so you can type your own. Use this for Ollama, vLLM,
  self-hosted gateways, or any OpenAI-compatible endpoint we
  don't have a preset for.

Picking a named preset auto-fills Base URL + default Model and
clears the API key. Picking **Custom** does not overwrite your
existing values — it just labels the dropdown so other settings
make sense.

**Test connection** verifies the endpoint is reachable and the
key (if any) authenticates. Test before saving so you don't
spend tokens on a misconfigured client.

## LM Studio walkthrough

LM Studio is a desktop app (macOS / Windows / Linux) that runs
local LLM models with an OpenAI-compatible API. Free, fully
local, and the lowest-friction "Workflow B" setup.

### 1. Download and install

Get LM Studio from <https://lmstudio.ai>. Install for your OS,
launch.

### 2. Download a model

The Home tab shows recommended models. Pick something Bibliogon-
friendly — Llama 3.1 8B Instruct, Qwen 2.5 7B Instruct, or any
instruct-tuned model in the 4-8B range works well for metadata
generation. Click Download.

> Screenshot: LM Studio Home tab with a model search for "qwen
> 2.5 7B instruct" showing the result + Download button.

### 3. Start the local server

Switch to the **Developer** tab (or "Local Server" in older
versions). Pick the downloaded model from the dropdown at the
top, click **Start Server** (the green play button). LM Studio
reports `Server running on port 1234` and lists the OpenAI-
compatible base URL.

> Screenshot: LM Studio Developer tab with the model loaded,
> Server Status showing "Running on port 1234", and the API
> endpoint URL `http://localhost:1234/v1` visible in the right-
> hand panel.

### 4. Configure Bibliogon

Open Bibliogon → Settings → KI-Assistent. Pick **LM Studio
(local)** from the provider dropdown. The Base URL auto-fills to
`http://localhost:1234/v1`. Leave Model empty (LM Studio
provides whatever is loaded) or type the model name LM Studio
shows. Click **Test connection** — you should get a green
"Connection successful" toast. Click **Save**.

### 5. Use the AI features

Click **Fill with AI** anywhere in Bibliogon. The local model
responds; no API key needed, no per-request cost, fully offline
after the model download.

Trade-off: a 7B model produces shorter, less polished metadata
than GPT-4o. For SEO + tags it's fine. For marketing copy you
may want to swap to a larger local model (Mixtral 8x7B if your
hardware can handle it) or use Workflow A with a paid provider.

## Ollama walkthrough

Ollama is a CLI-first alternative to LM Studio, popular on
servers and headless setups. Same end result.

### 1. Install and pull a model

```bash
# macOS
brew install ollama

# Linux
curl https://ollama.ai/install.sh | sh

# Pull an instruct model
ollama pull llama3.1:8b-instruct
```

### 2. Start the server

```bash
ollama serve
```

Ollama listens on `http://localhost:11434` by default. The
OpenAI-compatible endpoint sits at `http://localhost:11434/v1`.

> Screenshot: terminal showing `ollama serve` running with the
> startup banner "Listening on 127.0.0.1:11434" and a subsequent
> `ollama list` output confirming the pulled model.

### 3. Configure Bibliogon

Open Settings → KI-Assistent. Pick **Custom (OpenAI-compatible)**
from the provider dropdown. Type into Base URL:
`http://localhost:11434/v1`. Type into Model: `llama3.1:8b-instruct`
(or whatever you pulled). Leave API key empty.

> Screenshot: Bibliogon Settings AI tab with provider set to
> "Custom (OpenAI-compatible)", Base URL field showing
> `http://localhost:11434/v1`, Model field showing
> `llama3.1:8b-instruct`, API key empty, Test connection button
> just clicked with a green checkmark.

Click **Test connection**, then **Save**. **Fill with AI** now
routes through Ollama.

## Schema reference

For deeper technical details — the YAML structure, per-field
backend pipeline, force-override semantics, chapter-summaries
reconciliation rules — see the per-record API endpoints listed
in `/openapi.json`. The same shape powers both the per-record
and bulk flows.

## Troubleshooting

**"AI features are disabled" toast.** Open Settings →
KI-Assistent and check the "KI-Funktionen aktivieren" toggle at
the top.

**"Cost is unknown" disclaimer in the bulk estimate.** The
model you configured isn't in Bibliogon's pricing table. The
job runs fine; only the USD estimate is hidden. Add your model
to `backend/app/ai/pricing.py` if you're running a local copy.

**Bulk AI-fill 422 "cap is 50".** Each batch caps at 50 records.
Split the selection or run two batches.

**chapter_summaries entries dropped.** The AI invented a
`chapter_id` that doesn't exist on the book. The reconciliation
tries `chapter_id` first, then falls back to a whitespace-
normalized case-insensitive title match; anything still
unmatched lands in `dropped_chapter_summaries`. Re-run with
the corrected template, or set the right `chapter_id` manually
in the YAML.

**Workflow C: "Template type is 'book'; this endpoint accepts
only article templates".** You uploaded a book template to the
article endpoint (or vice versa). The `type` field at the top
of the YAML must match the record kind.
