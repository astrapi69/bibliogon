# Bibliogon Roadmap

Current phase: Phase 2 - build for real users, not just developers
Last updated: 2026-04-15
Latest release: v0.16.0 (audiobook incremental persistence, four-mode regen dialog, WebSocket live updates, dependency currency sweep)

Phase 1 (feature-complete single-user tool, v0.1.0 through v0.14.0) is archived at [docs/roadmap-archive/phase-1-complete.md](roadmap-archive/phase-1-complete.md). The archive includes a postscript (2026-04-15) about the silent-image-drop bug discovered after archival.

---

## Current focus

Distribution is the next active theme: lower the install barrier for non-technical users via the Simple Launcher (Windows, macOS, Linux). After Distribution, Templates open the door to genre-specific starter structures.

---

## Critical Fixes (Phase 2)

Bugs whose impact on shipped versions warrants tracking separately from polish work.

- [x] CF-01: PDF/DOCX silent image drop. Bug present v0.1.0 through v0.14.0, fixed v0.15.0. Originally tracked as PS-06 polish item; severity reclassified after diagnosis revealed shipped impact. See [archive postscript](roadmap-archive/phase-1-complete.md#postscript-2026-04-15) for the full trajectory.

---

## Themes for Phase 2

### 1. Distribution and packaging (priority: now)

Lower the installation barrier for non-technical users. Simple Launcher first, Tauri as a later option if needed. No Electron. See [docs/explorations/desktop-packaging.md](explorations/desktop-packaging.md) for the full evaluation.

- [ ] D-01: Simple Launcher for Windows (Python script packaged as .exe: starts Docker, opens browser, stops on close) — *in progress, code + CI build in [launcher/](../launcher/); manual Windows smoke test pending. Scope is start/stop only; Bibliogon must already be installed separately.*
- [ ] D-02: Simple Launcher for macOS (.app bundle with the same behavior)
- [ ] D-03: Simple Launcher for Linux (PyInstaller binary via CI, smoke test pending). Same source as Windows launcher; spec file is cross-platform aware. CI workflow: [launcher-linux.yml](../.github/workflows/launcher-linux.yml). Optional follow-up: .desktop file for GNOME/KDE menu integration.
- [ ] D-03a: AppImage for Linux — deferred. The PyInstaller binary requires `python3-tk` on the target (preinstalled on every major desktop distro). AppImage would make that self-contained at a 4-10x size cost and added CI complexity (FUSE + appimagetool). Re-evaluate only when a user reports a missing-tkinter failure in the wild.
- [ ] D-04: auto-update check in the launcher (notify user of new versions)
- [ ] D-05: Full Windows installer (downloads Docker Desktop + Bibliogon repo + generates .env, no terminal required at any step). Larger scope than D-01's launcher. Defer until user feedback shows the install (not the start) is the actual friction. See [docs/explorations/desktop-packaging.md](explorations/desktop-packaging.md) for context and triggers for reconsidering.

### 2. Book and chapter templates (priority: after distribution)

Pre-built structures for common book genres. Lowers the entry barrier for new users who do not know how to structure a book.

- [ ] TM-01: template data model (book template = title, description, chapter list with types and placeholder content)
- [ ] TM-02: built-in templates for common genres (children's book, sci-fi novel, non-fiction/how-to, philosophy, memoir)
- [ ] TM-03: "Create from template" option in CreateBookModal
- [ ] TM-04: chapter templates (reusable chapter structures, e.g. "interview chapter", "recipe chapter")
- [ ] TM-05: user-created templates (save current book structure as a template)

### 3. Polish and stability (runs in parallel throughout Phase 2)

- [x] PS-01: app.yaml auto-creation from app.yaml.example on first startup
- [x] PS-02: onboarding flow for AI provider setup (first-run wizard)
- [x] PS-03: keyboard shortcuts customization
- [x] PS-04: performance optimization for large books (500+ pages, 100+ chapters)
- [x] PS-05: accessibility audit (WCAG 2.1 AA for core workflows)
- [x] PS-06: manuscripta integration polish (rough edges in the export pipeline) (reclassified as CF-01 after diagnosis revealed critical severity)
- [x] PS-07: plugin developer documentation (API reference, tutorial, example plugin)
- [ ] PS-08+: future polish items, surface as found

### 4. Git-based backup (priority: low, existing .bgb covers daily needs)

Replace the upload-based backup compare with proper Git integration.

- [ ] SI-01: "Accept remote state" button for external changes
- [ ] SI-02: merge help on simple conflicts (only one chapter changed, no overlapping lines)
- [ ] SI-03: SSH key generation from the UI (for users without an existing SSH key)
- [ ] SI-04: visual indicator in the sidebar when the remote state is newer than local

---

## Maintenance and tech debt

Items with external deadlines or recurring cost that deserve planning-view visibility. Not features; just upkeep that will bite if ignored.

- [x] **Node.js 20 -> 22 LTS:** Dockerfile and CI upgraded from Node 20 to Node 22 (Active LTS until Apr 2027). Node 20 EOL Sep 2026 is no longer a concern.

### Deferred major dependency upgrades

Each gets a dedicated session with its own testing cycle. Not urgent, but tracked so they don't get forgotten. See `lessons-learned.md` "Dependency currency" for the rules.

- [ ] DEP-01: React 18 -> 19 migration (Server Components, hooks, refs changes, @types/react 19)
- [ ] DEP-02: TipTap 2 -> 3 migration (major rewrite, community extensions @pentestpad + tiptap-footnotes need v3-compat versions)
- [ ] DEP-03: react-router-dom 6 -> 7 migration (complete API rework, Remix-based)
- [ ] DEP-04: Vite 6 -> 8 + TypeScript 5 -> 6 (paired, do after DEP-01)
- [ ] DEP-05: elevenlabs SDK 0.2 -> 2.x migration (complete SDK rewrite, needs real API testing)
- [x] DEP-06: pandas 2 -> 3 (resolved: transitive dep of manuscripta 0.9.0 which requires pandas >=3.0)
- [ ] DEP-07: lucide-react 0.468 -> 1.x migration (icon API changes, moderate risk)
- [x] DEP-08: Pillow 11 -> 12 (resolved: manuscripta 0.9.0 requires pillow >=12.0. Both bumped together.)

---

## Completed in early Phase 2

### AI writing assistance (delivered in v0.14.0)

Built on the multi-provider foundation. All initial AI items shipped in a single release.

- [x] AI-01: multi-provider LLM client (Anthropic, OpenAI, Google, Mistral, LM Studio)
- [x] AI-02: Anthropic /v1/messages adapter
- [x] AI-03: provider selection UI with presets
- [x] AI-04: connection test with error-specific feedback (7 error categories)
- [x] AI-05: AI enable/disable toggle (default: off)
- [x] AI-06: AI-assisted chapter review (style, coherence, pacing suggestions)
- [x] AI-07: AI-assisted book blurb and marketing text generation
- [x] AI-08: context-aware AI prompts (pass chapter context, book metadata, genre)
- [x] AI-09: AI usage tracking per book (token count, cost estimate display)

---

## Explorations (not yet committed)

See [docs/explorations/](explorations/) for future considerations:

- [Desktop packaging](explorations/desktop-packaging.md) - Simple Launcher first, Tauri as later option, no Electron
- [Monetization strategy](explorations/monetization.md) - donations-first approach, deferred freemium
- [Multi-user and SaaS](explorations/multi-user-saas.md) - long-term, not near-term

---

## Archive

- **Phase 1** (completed, v0.1.0 - v0.14.0): [docs/roadmap-archive/phase-1-complete.md](roadmap-archive/phase-1-complete.md) — includes the 2026-04-15 postscript on CF-01.
