# Manuscript Tools

The Manuscript Tools plugin helps you revise your text. It checks style, cleans up formatting artifacts, and measures readability. The goal is not to tell you how to write, but to highlight patterns you may have overlooked.

The plugin runs entirely locally. No text is sent to external services.

## Style Checks

Style checks find patterns that disrupt reading flow or make text feel vague: filler words, passive voice, long sentences, word repetitions, excessive adverbs, and redundant phrases. Each finding is a suggestion, not a rule.

- **Filler words**: language-specific catalogs (e.g. "actually", "basically", "really" for English)
- **Passive voice**: marks passive constructions; exceptions for scientific or formal writing
- **Long sentences**: configurable threshold (shipped at 30 words; 25 is the built-in fallback when the setting is absent)
- **Word repetitions**: within a window of 50 words, excluding stop words (per-book override only; there is no plugin setting for it)
- **Adverb density**: flags high density of -ly/-lich adverbs per paragraph
- **Redundant phrases**: conservative list ("personal opinion", "future plans", etc.)

## Text Sanitization

Cleans invisible junk from pasted content (Word, Google Docs, browsers): non-breaking spaces, zero-width characters, BOM, empty tags, style attributes, multiple whitespace. Runs automatically on import.

> **Planned for a future version.** Triggering sanitization manually per chapter, and previewing what it would change before applying it, do not exist yet. Today the cleanup happens only as part of an import.

## Text Metrics

- Word count, character count, paragraphs, sentences, estimated pages
- Flesch-Kincaid readability index (language-specific variants)
- Average sentence length and word length
- Adjective and adverb density
- Estimated reading time (200 words/minute, fixed)
- Filler word percentage and passive voice percentage

All metrics are shown per chapter and as a book overview in the quality tab.

## The Quality tab

Open a book, go to **Book metadata → Quality** to see the full report. Beyond the raw metrics it adds four things that help you read the numbers, not just collect them.

### Chapter comparison table

Every chapter is a row, every metric a column (words, sentences, Flesch, filler %, passive %, adverb %, long sentences). Cells are colour-coded like a traffic light so outliers stand out at a glance, and the table has a totals row at the bottom. The navigable metrics (filler, passive, adverb, long sentences) are clickable: a click jumps the editor to the first matching finding in that chapter. A value more than twice the book average is flagged with a tooltip telling you how it compares.

### Genre / Flesch benchmark

Below the summary, a benchmark scale plots your book's average Flesch reading-ease score against four reference bands (Easy / Readable / Demanding / Academic) and four genre markers (Fiction / Non-fiction / Scientific / Children's). It answers the question the bare number cannot: "Is this readability right for the kind of book I am writing?" A children's book and a scientific monograph live at opposite ends of the scale, and both can be correct.

### Nested-sentence candidates (Schachtelsatz-Kandidaten)

A per-chapter, collapsible list of the longest and most deeply-nested sentences in your manuscript. Each entry shows the opening words of the sentence plus its word count and the number of subordinate clauses. These are sentences that might benefit from being split — a suggestion, never a rule. The list is ranked client-side, so it works the same offline.

### Analysis-scope disclaimer

A short notice at the bottom of the report states plainly what it does and does not do: it analyses **stylistic** features, not content. Argument quality, factual accuracy, tone consistency, and chapter structure are NOT checked. The report is a complement to a human edit, not a replacement for one. A second note next to the word count explains exactly what is counted (every word in the body text including headings; formatting is not counted), so the number is honest and may differ slightly from other editors.

### Download the report

Two buttons at the top of the tab export the full report as **Markdown** (`.md`) or **PDF** — the chapter table, the averages, the Flesch benchmark, and the nested-sentence list all travel with it.

## Configuration

Two settings under `Settings > Plugins > Manuscript Tools`, and they apply to every book:

- **Sentence length threshold** (`max_sentence_length`)
- **Auto-sanitization on import** (`auto_sanitize_on_import`)

The **filler word lists** and the **allowlist** of terms excluded from every check are YAML files inside the plugin package, at `content/fillers/{lang}.yaml` and `content/allowlist/{lang}.yaml`. Edit them there; they are read at app start.

A book can also carry its own thresholds (`ms_tools_max_sentence_length`, `ms_tools_repetition_window`, `ms_tools_max_filler_ratio`), which override the global defaults. Resolution order is request > book > plugin > built-in default.

> **Planned for a future version.** There is no field for the per-book thresholds in the book metadata yet. They are honoured once set, but setting them currently requires the API or an imported backup.
