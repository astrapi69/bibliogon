## [0.14.0] - 2026-04-13

### Added
- **Multi-provider AI integration (AI-01 to AI-05):** Unified LLM client supporting Anthropic (Claude), OpenAI (GPT), Google (Gemini), Mistral, and LM Studio (local). Anthropic adapter for the native /v1/messages endpoint. Provider selection dropdown with auto-filled base URLs and model suggestions. Connection test with 7 error categories. AI enable/disable toggle (default: off).
- **AI-assisted chapter review (AI-06):** "Review" tab in the editor AI panel. Sends the full chapter for analysis of style, coherence, and pacing. Structured feedback with summary, strengths, actionable suggestions with quotes, and overall assessment.
- **AI-generated marketing text (AI-07):** Sparkles button on each marketing field in book metadata. Generates Amazon KDP blurb (HTML), back cover text, author bio, and keywords.
- **Context-aware AI prompts (AI-08):** All AI features now receive book metadata (title, author, language, genre, description). Suggestions match genre tone. Reviews tailored to genre expectations.
- **AI usage tracking (AI-09):** Cumulative token counter per book with estimated cost range displayed in the marketing tab.
- **Manuscript tools:** adjective density detection (M-13), inline style check marks in TipTap (M-14), quality tab with chapter metrics and outlier markers (M-15).
- **Editor:** IndexedDB draft recovery for unsaved changes.
- **Settings:** AI configuration section with provider selection, editor debounce settings.
- **Offline:** all UI fonts bundled locally, no CDN dependency (O-01).
- **Phase 2 roadmap:** Phase 1 archived, new roadmap with 5 themes.

### Changed
- **Licensing model:** all plugins free, license gates removed, premium badges removed.
- **Config management:** app.yaml removed from version control (gitignored), app.yaml.example provided as template.
- **i18n:** retroactive translation completion for ES, FR, EL, PT, TR, JA. AI messages in all 8 languages.

### Fixed
- **PWA install prompt:** added PNG icons and enabled dev-mode service worker.
- **AI stale config:** toggling AI on/off takes effect immediately without restart.
- **AI error reporting:** specific error messages instead of generic "connection failed".
- **Anthropic model IDs:** corrected preset model names.

### Tests
- 100+ new tests across AI, E2E, plugins, and backend utilities.
