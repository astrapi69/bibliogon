# Bibliogon v0.19.1: A Book Authoring Tool That Refuses to Outsource Your Manuscript

*Local-first. Open source. Nine releases in ten days.*

---

Bibliogon is a book authoring tool that keeps your manuscript on your own disk. You install it via Docker or a native launcher, you write in a modern browser-based editor, you export to KDP-ready EPUB and PDF, and you own every file the app produces.

This is the opposite trade from what most authoring tools offer. They take your manuscript, your outline, your cover art, and a monthly fee, and they give you back a polished UI and a publish button that works when their servers are up.

Bibliogon's deal is different: you bring Docker, you keep your manuscript on your own disk as SQLite plus a zip archive, you choose which AI provider (if any) gets to see your prose, and in exchange you get a tool that treats your workflow as something you own rather than something you rent.

This week we shipped **v0.19.1**.

## What Bibliogon does today

- **Editor** is TipTap 2 in the browser with 15 official extensions plus 1 community extension. WYSIWYG and a Markdown mode side by side. Storage is TipTap JSON in SQLite, not HTML, not Markdown. Markdown only appears at display and export time.
- **Export** covers EPUB, PDF, DOCX, HTML, Markdown, and project ZIP, delegated to [manuscripta](https://github.com/astrapi69/manuscripta) and Pandoc.
- **Audiobooks** go out as MP3 via Edge TTS, Google Cloud TTS, Google Translate, pyttsx3, or ElevenLabs. A content-hash sidecar file next to each chapter MP3 means unchanged chapters skip regeneration, which matters when a paid engine charges per character.
- **KDP plugin** validates cover dimensions, DPI, and color profile against Amazon's specs before you upload, and checks that ISBN, ASIN, keywords, and categories are populated. Rejection emails are not a satisfying feedback loop.
- **Plugins** are real Python packages discovered via entry points, loaded via [PluginForge](https://github.com/astrapi69/pluginforge), a pluggy-based framework that is its own PyPI project. Third parties can install their own plugins as a ZIP through Settings without touching a shell.
- **AI integration** is multi-provider (Anthropic, OpenAI, Google, Mistral, plus any OpenAI-compatible local endpoint such as LM Studio), lives in the core under `backend/app/ai/`, and writes an `ai-assisted: true` flag into the exported `metadata.yaml` when it was used. Tokens are counted per book. You pick the endpoint; you own the API key.
- **i18n** covers German, English, Spanish, French, Greek, Portuguese, Turkish, and Japanese in the UI and in exported metadata files.
- **Storage** is SQLite for manuscripts plus a filesystem folder for assets. Manuscript content is stored unencrypted at the filesystem level, matching the pattern of desktop authoring tools like Scrivener and integrating naturally with OS-level disk encryption (FileVault, BitLocker, LUKS). Credentials (API keys, service-account JSON) are separately Fernet-encrypted with a per-install secret regardless of filesystem encryption.
- **Accessibility** meets WCAG 2.1 AA per the recent audit.
- **Backups** are `.bgb` zip archives containing the full state: books, chapters, assets, optional audiobook files, metadata. Restore brings everything back.

## What just shipped in v0.19.1

v0.19.1 is a maintenance release, following the content-safety overhaul that landed in v0.19.0.

- **Front Matter and Back Matter section labels** are now translated in all eight supported UI languages. Two strings that had been hardcoded English since day one now pull from the YAML like everything else.
- **A zip-handle leak in the backup import path** is closed. On Windows the leaked handle kept the `.bgb` file locked after an import; on long-running backends it leaked file descriptors. Fixed, with a regression test.
- **Launcher release workflows (Linux, macOS, Windows)** were failing to attach prebuilt binaries to GitHub releases because the default `GITHUB_TOKEN` is read-only. They now declare `permissions: contents: write` at the top level. Tagged releases publish the launcher binary plus a SHA256 checksum as real release assets, not buried in a CI artifact that expires in 14 days.
- **ruff, mypy, and pre-commit** are wired into CI and into the local hook stack. Fourteen pre-existing mypy errors got closed without loosening the type checker's config.

None of those is glamorous. All of them are the kind of thing you notice immediately when it is wrong and never again when it is right.

## Why the cadence matters

Each release is a small, fully-tested step. The cadence means you get fixes within days, not months, and the test gate runs on every commit: 598 backend tests, 409 plugin tests across 9 plugins, 397 frontend Vitest tests, `tsc --noEmit` clean, ruff clean, mypy clean, pre-commit hooks enforced. Over 1,400 automated tests run before any code merges. Each tagged release is a known-green state.

Nine tagged releases landed between April 10 (v0.11.0) and April 20 (v0.19.1). The narrative arc:

- **v0.11 through v0.14:** AI review with multi-provider support, AI-assisted metadata flag in exports, ElevenLabs API key managed through the UI instead of `.env`.
- **v0.15 and v0.16:** Encrypted credential storage, backup history, WCAG 2.1 AA accessibility pass.
- **v0.17 and v0.18:** One-click launcher for Windows, macOS, and Linux with auto-update check. Book and chapter templates (five book builtins, four chapter builtins) driven off new SQLite tables.
- **v0.19.0:** Content-safety overhaul. Autosave awaits the server ack. `beforeunload` / `pagehide` / `visibilitychange` flushes push to IndexedDB. Optimistic locking on `PATCH /chapters` with a 409 conflict dialog. A `chapter_versions` table with a restore flow. Donation integration (Liberapay, GitHub Sponsors, Ko-fi, PayPal).
- **v0.19.1:** the janitor pass you just read.

## What this does not do

Being honest about the gaps matters more than the differentiators.

- **No real-time collaboration.** Local-first rules that out. If two people want to edit the same manuscript, that is a Git-plus-branching workflow, not a Google-Docs-style experience.
- **No mobile app.** The UI adapts down to tablet widths, but you are not going to draft a novel on a phone.
- **Not polished in the Vellum sense.** Exports meet KDP specs and are readable, but the premium visual layouts that make a Vellum book recognizable at a glance are not something Bibliogon tries to compete with. That ground belongs to dedicated typesetting tools.
- **Onboarding is still rough.** The one-click launcher and the Docker one-liner work, but the first-run experience assumes a user who has seen a terminal before.

## Who Bibliogon is for

If you publish on Kindle Direct Publishing or IngramSpark and you care that your cover is actually 300 DPI in the right color profile before you upload, the KDP plugin will tell you that before the upload, not after the rejection email.

If you write in more than one language, the UI is translated into eight languages, and so are the exported manuscripts' metadata files.

If you use AI in your drafting and you want the exported file to carry an honest AI-assistance flag (for compliance, for future platform requirements, or for your own record-keeping), the flag is built in.

If you need your manuscript to stay on your own disk, not in a vendor's S3 bucket, SQLite and local assets are the only thing the app needs.

If you hit a limitation and you know Python, the plugin system is the escape hatch. Write a plugin, ZIP it, install through the UI. No vendor roadmap to petition.

## How to try it

**One-liner (Docker required):**

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

This downloads Bibliogon to `~/bibliogon`, builds the image, and starts the app at `http://localhost:7880`.

**Native launcher (no Docker):**
[Grab the binary](https://github.com/astrapi69/bibliogon/releases/latest) for Windows, macOS, or Linux from the v0.19.1 release. It is unsigned. On macOS this means right-clicking the app and choosing "Open" the first time (Gatekeeper warning). On Windows this means clicking through a SmartScreen warning the first time. Launcher source is in-tree under `launcher/`.

**Docs:**
[astrapi69.github.io/bibliogon](https://astrapi69.github.io/bibliogon/) covers per-platform install guides, plugin development, architecture notes, and the full CHANGELOG.

**Repository:**
[github.com/astrapi69/bibliogon](https://github.com/astrapi69/bibliogon) (MIT license).

## What's next

- Triage the remaining 28 Playwright smoke failures ([issue #9](https://github.com/astrapi69/bibliogon/issues/9)). A three-sample analysis classified all three as pre-existing test-infrastructure drift rather than user-visible regressions. None of the 31 known smoke failures touches the KDP validation flow. The remaining 28 need the same pass before v0.20.0.
- Dedicated sessions for the deferred major dependency bumps (elevenlabs 0.2 to 2.43, starlette 0.46 to 1.0, rich 14 to 15). Routine patch and minor bumps land with releases; major bumps get their own testing cycle.
- Onboarding improvements: better first-run guidance and, eventually, a migration guide for authors coming from Scrivener or Atticus.
- More plugin ecosystem growth. The hook specs are documented; the API is stable.

## Join in

Bibliogon is in active development and contribution is the fastest way to shape it.

- If you try it and hit friction, [file an issue](https://github.com/astrapi69/bibliogon/issues).
- If you write in a language that is not yet translated, open an issue and we can prioritize it.
- If you need a plugin that does not exist, the hook specs are documented in the repo. The plugin-export and plugin-audiobook packages are the most thoroughly worked examples.
- If you want to read the code or the architecture, [CLAUDE.md](https://github.com/astrapi69/bibliogon/blob/main/CLAUDE.md) in the repo root is the single page that orients you.

The one-liner is above. The issue tracker is open. The plugin hook specs are documented and stable.

*v0.19.1 released 2026-04-20. MIT license. Built by Asterios Raptis with substantial assistance from Claude (Anthropic).*
