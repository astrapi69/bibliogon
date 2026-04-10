# Manuscript Tools

The Manuscript Tools plugin helps you revise your text. It checks style, cleans up formatting artifacts, and measures readability. The goal is not to tell you how to write, but to highlight patterns you may have overlooked.

The plugin runs entirely locally. No text is sent to external services.

## Style Checks

Style checks find patterns that disrupt reading flow or make text feel vague: filler words, passive voice, long sentences, word repetitions, excessive adverbs, and redundant phrases. Each finding is a suggestion, not a rule.

- **Filler words**: language-specific catalogs (e.g. "actually", "basically", "really" for English)
- **Passive voice**: marks passive constructions; exceptions for scientific or formal writing
- **Long sentences**: configurable threshold (default: 25 words)
- **Word repetitions**: within a configurable window (default: 50 words), excluding stop words
- **Adverb density**: flags high density of -ly/-lich adverbs per paragraph
- **Redundant phrases**: conservative list ("personal opinion", "future plans", etc.)

## Text Sanitization

Cleans invisible junk from pasted content (Word, Google Docs, browsers): non-breaking spaces, zero-width characters, BOM, empty tags, style attributes, multiple whitespace. Can run manually per chapter or automatically on import.

## Text Metrics

- Word count, character count, paragraphs, sentences, estimated pages
- Flesch-Kincaid readability index (language-specific variants)
- Average sentence length and word length
- Adjective and adverb density
- Estimated reading time (configurable words/minute)
- Filler word percentage and passive voice percentage

All metrics are shown per chapter and as a book overview in the quality tab.

## Configuration

Settings under `Settings > Plugins > Manuscript Tools`: sentence length threshold, repetition window, reading speed, filler word list (per language), auto-sanitization on import, active checks toggle. Settings are stored per book.
