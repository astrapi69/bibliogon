# Bibliogon Roadmap

Current phase: Phase 2 - build for real users, not just developers
Last updated: 2026-04-13

Phase 1 (feature-complete single-user tool, v0.1.0 through v0.13.0) is archived at [docs/roadmap-archive/phase-1-complete.md](roadmap-archive/phase-1-complete.md).

---

## Current focus

Multi-provider AI integration is committed. Next: AI writing assistance features (review, blurb generation, context-aware prompts), then distribution via Simple Launcher to lower the installation barrier.

---

## Themes for Phase 2

### 1. AI writing assistance (priority: now)

Building on the multi-provider foundation, extend AI into the writing workflow.

- [x] AI-01: multi-provider LLM client (Anthropic, OpenAI, Google, Mistral, LM Studio)
- [x] AI-02: Anthropic /v1/messages adapter
- [x] AI-03: provider selection UI with presets
- [x] AI-04: connection test with error-specific feedback (7 error categories)
- [x] AI-05: AI enable/disable toggle (default: off)
- [x] AI-06: AI-assisted chapter review (style, coherence, pacing suggestions)
- [x] AI-07: AI-assisted book blurb and marketing text generation
- [x] AI-08: context-aware AI prompts (pass chapter context, book metadata, genre)
- [x] AI-09: AI usage tracking per book (token count, cost estimate display)

### 2. Distribution and packaging (priority: after AI)

Lower the installation barrier for non-technical users. Simple Launcher first, Tauri as a later option if needed. No Electron. See [docs/explorations/desktop-packaging.md](explorations/desktop-packaging.md) for the full evaluation.

- [ ] D-01: Simple Launcher for Windows (Python script packaged as .exe: starts Docker, opens browser, stops on close)
- [ ] D-02: Simple Launcher for macOS (.app bundle with the same behavior)
- [ ] D-03: Simple Launcher for Linux (.desktop file + launcher script)
- [ ] D-04: auto-update check in the launcher (notify user of new versions)

### 3. Book and chapter templates (priority: after distribution)

Pre-built structures for common book genres. Lowers the entry barrier for new users who don't know how to structure a book.

- [ ] TM-01: template data model (book template = title, description, chapter list with types and placeholder content)
- [ ] TM-02: built-in templates for common genres (children's book, sci-fi novel, non-fiction/how-to, philosophy, memoir)
- [ ] TM-03: "Create from template" option in CreateBookModal
- [ ] TM-04: chapter templates (reusable chapter structures, e.g. "interview chapter", "recipe chapter")
- [ ] TM-05: user-created templates (save current book structure as a template)

### 4. Git-based backup (priority: low, existing .bgb covers daily needs)

Replace the upload-based backup compare with proper Git integration.

- [ ] SI-01: "Accept remote state" button for external changes
- [ ] SI-02: merge help on simple conflicts (only one chapter changed, no overlapping lines)
- [ ] SI-03: SSH key generation from the UI (for users without an existing SSH key)
- [ ] SI-04: visual indicator in the sidebar when the remote state is newer than local

### 5. Polish and stability (runs in parallel throughout Phase 2)

- [ ] PS-01: app.yaml auto-creation from app.yaml.example on first startup
- [ ] PS-02: onboarding flow for AI provider setup (first-run wizard)
- [ ] PS-03: keyboard shortcuts customization
- [ ] PS-04: performance optimization for large books (500+ pages, 100+ chapters)
- [ ] PS-05: accessibility audit (WCAG 2.1 AA for core workflows)
- [ ] PS-06: manuscripta integration polish (rough edges in the export pipeline)
- [ ] PS-07: plugin developer documentation (API reference, tutorial, example plugin)

---

## Explorations (not yet committed)

See [docs/explorations/](explorations/) for future considerations:

- [Desktop packaging](explorations/desktop-packaging.md) - Simple Launcher first, Tauri as later option, no Electron
- [Monetization strategy](explorations/monetization.md) - donations-first approach, deferred freemium
- [Multi-user and SaaS](explorations/multi-user-saas.md) - long-term, not near-term

---

## Archive

- **Phase 1** (completed, v0.1.0 - v0.13.0): [docs/roadmap-archive/phase-1-complete.md](roadmap-archive/phase-1-complete.md)
