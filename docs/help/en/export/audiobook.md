# Audiobook Export

## Overview

The Audiobook plugin turns your chapters into spoken MP3 files using Text-to-Speech. It sits on top of the Export plugin and since v0.11 delegates all TTS work to [manuscripta](https://github.com/astrapi69/manuscripta).

Generation runs asynchronously in the background. A progress dialog shows each chapter's status via Server-Sent Events while you keep working. Finished files are persisted under `uploads/{book_id}/audiobook/` so they survive browser reloads and backend restarts.

## TTS Engines

Bibliogon ships adapters for several engines with different tradeoffs:

- **Edge TTS** (default): Microsoft's free cloud TTS. Large voice selection, online only, no account needed.
- **Google Cloud TTS**: Standard, WaveNet, Neural2, Studio and Journey quality tiers. Requires a service account JSON which is stored Fernet-encrypted in `config/google-credentials.enc`. Free monthly quota, then paid.
- **ElevenLabs**: High-quality, very natural voices. Paid. The API key is stored in `audiobook.yaml` via Settings > Audiobook, validated against the ElevenLabs API before being saved.
- **pyttsx3**: Offline, uses the OS-native speech synthesis. No internet needed, lower quality.
- **Google Translate TTS (gTTS)**: Free fallback, minimal quality, no account needed.

You can pick the engine globally in Settings > Audiobook and override it per book in the book metadata editor.

## Per-Book Configuration

As of v0.11 every audio-specific setting lives on the book itself, not as a plugin-global default. Open **BookEditor > Metadata > Audiobook** to configure:

- Engine, voice, speed, merge mode, filename prefix
- **Overwrite existing files**: When enabled the content-hash cache is ignored on the next export and every chapter is regenerated. Default off.
- **Skip chapter types**: Checkbox list of all 26 chapter types, grouped into "Present in this book" and "Other types". Selected types are dropped from the synthesis pipeline. Marketing types (also_by_author, excerpt, call_to_action) are selected by default so audiobooks don't ship with a "buy my next book" pitch.
- **Announce chapter number**: When enabled the TTS speaks an ordinal intro ("First chapter", "Second chapter") before each chapter. Default off.

All settings are persisted via the metadata editor's global Save button - there is no per-field auto-save.

## Content-Hash Cache

Every generated chapter gets a sidecar `.meta.json` with a hash over `(content, engine, voice, speed)`. On the next run, chapters whose hash still matches are reused from the persisted audiobook directory instead of being re-synthesised. That saves both time and API credits for paid engines. The per-book "Overwrite existing files" flag disables the cache when you explicitly want a full regeneration.

## Dry Run and Cost Estimate

The dry-run mode generates a short sample MP3 from the first non-skipped chapter that has content, and returns a cost estimate for the full export in the response headers. Use it before your first expensive ElevenLabs or Google Cloud run to hear the voice and ballpark the price.

## Output Modes

The merge mode controls which files get produced:

- **merged**: A single MP3 for the whole book.
- **separate**: One MP3 per chapter.
- **both**: Both per-chapter files and a merged output.

All files can be downloaded individually or as a ZIP, and remain available after a browser reload or backend restart. If a persisted audiobook already exists, the UI warns with a confirm dialog before overwriting (unless the per-book "Overwrite existing files" flag is deliberately set).
