# Project Comparison: Bibliogon ↔ Adaptive-Learner

> **Generated**: 2026-09-27 | **Bibliogon**: v0.60.0 | **Adaptive-Learner**: v2.15.0
> **Purpose**: Identify missing features worth adopting cross-project

---

## High-Level Architecture Comparison

| Aspect | Bibliogon | Adaptive-Learner | Gap Analysis |
|--------|-----------|------------------|--------------|
| **Core Domain** | Book authoring (prose, picture-book, comic) | Language learning (lessons, exercises, SRS) | Different domains — limited direct feature overlap |
| **Storage Modes** | API (FastAPI/SQLite) + Dexie (IndexedDB) | API + Dexie (identical `IStorageService` pattern) | **Parity achieved** — both dual-mode offline-first |
| **Plugin System** | PluginForge (PyPI) — 16 plugins | PluginForge (PyPI) — 13 plugins | **Parity** — same framework |
| **AI Integration** | Multi-provider (6), browser-direct in Dexie | Multi-provider (3), browser-direct in Dexie | **Parity** — both offline-capable AI |
| **Export/Import** | Full .bgb backup, selective export, 6 client formats | Full .alb backup, selective export, Anki export | **AL has Anki export** — Bibliogon could add |
| **Sync** | Git-sync (per-book), Git-backup | WiFi sync (local-network), Content-repo sync | **Different models** — each has unique value |
| **PWA** | Full offline, SW auto-update, GH Pages deploy | Full offline, SW auto-update, GH Pages deploy | **Parity** |
| **Launcher** | docker-app-launcher ^0.28.0 (PyPI) | Custom launcher (hand-written) | **Bibliogon ahead** — reusable library |

---

## Features Bibliogon Has That Adaptive-Learner Lacks

### Worth Considering for Adaptive-Learner

| Feature | Bibliogon Implementation | Why Valuable for AL |
|---------|--------------------------|---------------------|
| **docker-app-launcher** | Library-first, ^0.28.0: force-recreate, `--update`, `--doctor`, live logs, cancellable ops, system theme follow | AL's custom launcher is maintenance burden; docker-app-launcher is reusable, tested, feature-rich |
| **Release Automation** | Makefile targets (`release-prepare`/`release-finish`) + Gitflow workflow | AL has 4-tier model but no one-click workflow; Bibliogon's Makefile approach is simpler |
| **KDP Publishing Wizard** | Format step (eBook/paperback/hardcover), trim size, margins, cover validation, completeness check, metadata.json with ISBN | AL could use for "publish lesson set to marketplace" concept |
| **Story Bible / Fiction Entities** | Characters, settings, plot points, items, lore + relationships + Arc View + continuity checker | AL has no narrative authoring; could inspire "Learning Universe" concept (characters = vocab, settings = contexts) |
| **Picture-Book / Comic Editors** | 13 layouts, collage canvas, drag-positioned regions, panel grids, speech bubbles | AL has no visual authoring; could inspire "Visual Lesson Builder" |
| **Chapter Labels + Status** | Per-chapter workflow status + colour-coded labels, chips on Storyboard/Outliner | AL lessons have no status/labels; useful for content pipeline |
| **Writing Goals + Streak** | Per-book word target + deadline, per-chapter targets, dashboard widget | AL has XP/streaks but not writing-specific goals |
| **Quality Report (PDF)** | Flesch, nested sentences, genre benchmarks, chapter comparison table | AL has learning analytics but no PDF report export |
| **SEO/Export Meta** | Open Graph, Twitter, JSON-LD, og-image per export format | AL exports lack web metadata |
| **Scrivener Import** | .scrivx parsing with defusedxml | AL could import from authoring tools |
| **A+ Content Generator** | Amazon A+ modules from book metadata via AI | AL could generate "lesson set marketing pack" |
| **Promotion/Portfolio Board** | Retail formats per book (eBook/paperback/hardcover), store URLs, ASIN, universal links | AL could track "published lesson set" metadata |

---

## Features Adaptive-Learner Has That Bibliogon Lacks

### Worth Considering for Bibliogon

| Feature | Adaptive-Learner Implementation | Why Valuable for Bibliogon |
|---------|--------------------------------|---------------------------|
| **KeyVault (Encrypted AI Key Export/Import)** | `@astrapi69/ai-key-vault` + React components, passphrase-encrypted `.alk`, format-agnostic import | **Already planned** — GH #908, see `docs/API_KEY_VAULT_IMPLEMENTATION_PLAN.md` |
| **Anki Deck Export** | Client-side `.apkg` builder (sql.js + JSZip), AI-extracted cards, accept/reject/edit UI | Bibliogon could export flashcards from Story Bible / vocabulary / grammar issues |
| **SRS (Spaced Repetition)** | Element-level errors, 3-consecutive-correct mastery, 1d/3d/7d scheduler, review queue | Bibliogon has no SRS; could power "review grammar issues" or "vocabulary from books" |
| **Gamification (XP, Badges, Streaks)** | Exponential level curve, 24 badges/5 categories, streak freeze/weekend mode, GitHub-style heatmap | Bibliogon has writing streak heatmap but no XP/badges; could motivate authors |
| **Daily Missions** | 3 deterministic adaptive goals/day, evaluated against existing data, `missions` plugin | Bibliogon could have daily writing missions |
| **Content Repository Ecosystem** | Multiple repos (list/add/remove/reorder), Trust levels, curated discovery, star ratings, private/coach repos | Bibliogon's plugin system is app-plugins only; content repos would enable community templates/books |
| **Learning Repository (Git-backed)** | Per-project Markdown artefacts (README, STATS, CHEATSHEET, ROADMAP), semantic commits, cycle tags | Bibliogon's Git-sync is per-book; learning-repo is project-level with rich artefacts |
| **Community Sharing via PR** | Share wizard → GitHub PR to official content repo, CI validation, duplicate detection | Bibliogon could share book templates/chapter templates via PR |
| **Rich-Text Notes (TipTap)** | Session-rating notes, curriculum descriptions, lesson content with full TipTap | Bibliogon has TipTap in editor but not for notes/metadata |
| **Voice (TTS + STT + Pronunciation)** | Web Speech API: SpeechButton on AI replies, MicButton with interim transcripts, pronunciation plugin | Bibliogon has read-aloud (TTS) but no STT/pronunciation practice |
| **NotebookLM Integration** | StudyQuestion generation, one-shot study guide, client-side ZIP export | Bibliogon could generate "study guide from book" for educational use |
| **Exercise Types (7+)** | Matching, Picture-Choice, Cloze, Dictation, Free-Text, Word-Tiles, Hotspot, Parsons, Ordering | Bibliogon has no interactive exercises; could add "comprehension checks" in books |
| **Adaptive Lesson Generation** | Rule-based, client-side: reads error history, classifies weaknesses, synthesizes personalised lesson | Bibliogon could generate "practice chapter" from grammar issues |
| **Asset Fetching for Content** | Binary images via manifest-declared `assets/`, deterministic placeholder SVGs | Bibliogon's asset handling is per-book; content-repo approach scales better |
| **Praise/Celebration System** | 8-lang catalogs, AnswerCelebration, milestone overlays, CSS confetti, intensity settings | Bibliogon could celebrate writing milestones |
| **Visual Regression (Playwright)** | 16 smoke specs, screenshot baselines | **Planned** — P3-02 in `docs/ISSUES_PRIORITY.md` |
| **Multi-Browser E2E** | Chromium only currently | **Planned** — P3-03 |
| **Native i18n (PT/TR/JA)** | v1.13.0: full native translations replacing EN-passthrough | **In progress** — P3-01 |
| **WCAG 2.1 AA Audit** | Full audit + atomic fixes, regression tests | Bibliogon has `verify-theme` but no full WCAG audit |
| **In-App Contextual Help** | 22 glossary concepts, dotted-underline HelpTooltip, slide-over HelpDrawer, search | Bibliogon has help pages but not contextual tooltips |
| **Error-Toast + GitHub Issue Framework** | 5xx toasts → "Report Issue" button → pre-filled GH issue URL, DEBUG mode stacktrace | Bibliogon could add user-facing error reporting |
| **Identity Persistence + Browser-Wipe Recovery** | `~/.config/identity.yaml` writes on changes, Landing flow recovers from disk/IndexedDB | Bibliogon has launcher but no identity recovery |
| **Danger Zone (3-step typed confirm)** | `POST /api/reset` truncates all tables, scrubs `ai.*` from secrets.yaml, preserves Fernet key | Bibliogon has Danger Zone but less sophisticated |
| **Secrets.yaml API Key Storage** | Three-layer chain (env > secrets.yaml > Fernet-encrypted DB), `ApiKeySource` enum, UI badges | Bibliogon has similar but no UI source badges |

---

## Shared Infrastructure — Already Aligned

| Component | Status | Notes |
|-----------|--------|-------|
| **PluginForge** | Same version (^0.10.0) | Both use PyPI package |
| **Manuscripta** | Bibliogon uses ^0.9.0 | AL doesn't use (different export needs) |
| **IStorageService** | Identical pattern | Dual-mode (API/Dexie) with same interface |
| **Feature Strategy** | `@astrapi69/feature-strategy` | Both use `useFeature(id)` with active/disabled/hidden |
| **Tailwind v4 + shadcn/ui** | Token-mapped, Preflight-omitted | Same theming approach |
| **Radix UI** | Same primitives | Both use Dialog, Select, etc. |
| **TipTap** | Bibliogon v3, AL v2+ | Both use ProseMirror-based editor |
| **Vitest + Playwright** | Same test stack | AL has more E2E specs (16 vs ~6) |
| **Prettier/ESLint/ruff/mypy** | Same lint stack | Consistent code quality |
| **Makefile targets** | Similar dev commands | Both have `make dev`, `make test`, etc. |

---

## Priority Recommendations

### For Bibliogon (High Impact, Low Effort)

1. **KeyVault** — Already planned (#908), uses AL's shared packages
2. **Anki Export** — Leverage Story Bible entities + grammar issues → flashcards
3. **Contextual Help Tooltips** — AL's HelpTooltip/HelpDrawer is reusable
4. **Error-Toast → GH Issue** — Improves user feedback loop
5. **Praise/Celebration** — Writing milestones deserve recognition
6. **Secrets.yaml UI Source Badges** — Shows where key comes from (env/secrets.yaml/DB)

### For Bibliogon (Medium Impact, Medium Effort)

7. **SRS for Grammar/Vocabulary** — Review queue for AI-detected issues
8. **Daily Writing Missions** — Adapt AL's mission plugin
9. **Content Repo for Templates** — Community book/chapter templates via GitHub
10. **Visual Regression + Multi-Browser E2E** — Catch CSS regressions

### For Adaptive-Learner (High Impact, Low Effort)

1. **docker-app-launcher** — Replace custom launcher with library
2. **Release Automation (Makefile + Gitflow)** — Simplify release process
3. **Visual Regression** — AL has Playwright but no screenshot baselines
4. **Quality Report PDF** — Learning analytics report export
5. **SEO/Export Meta** — For shared lesson sets

### For Adaptive-Learner (Medium Impact)

6. **Story Bible Concept** — "Learning Universe" with entities/relationships
7. **Chapter Labels/Status** — Content pipeline for lesson sets
8. **Scrivener Import** — Import from authoring tools
9. **Promotion Board** — Track published lesson set metadata

---

## Cross-Project Shared Packages (Already Exist)

| Package | Used By | Purpose |
|---------|---------|---------|
| `@astrapi69/pluginforge` | Both | Plugin framework |
| `@astrapi69/feature-strategy` | Both | Feature gating |
| `@astrapi69/ai-key-vault` | AL (core + React) | **Bibliogon: planned** |
| `@astrapi69/manuscripta` | Bibliogon | Book export pipeline |
| `docker-app-launcher` | Bibliogon | **AL: should adopt** |

---

## Action Items

### Immediate (This Sprint)
- [ ] Bibliogon: Implement KeyVault (GH #908) — uses AL's packages
- [ ] Bibliogon: Add contextual help tooltips (port AL's HelpTooltip)
- [ ] AL: Evaluate docker-app-launcher migration

### Next Phase
- [ ] Bibliogon: Anki export from Story Bible/grammar issues
- [ ] Bibliogon: Error-toast → GH issue reporting
- [ ] AL: Add release Makefile targets + Gitflow workflow
- [ ] Both: Visual regression baselines (Playwright screenshots)

### Exploration
- [ ] Bibliogon: SRS for writing improvement (grammar/vocab review)
- [ ] AL: Content repository for community lesson sets
- [ ] Both: Shared component library (`lib/components` parity)

---

## Conclusion

**Bibliogon leads in**: Desktop launcher, release automation, publishing workflows (KDP/A+), visual authoring (picture-book/comic), fiction writing tools (Story Bible).

**Adaptive-Learner leads in**: Learning-specific features (SRS, gamification, missions, exercises), content ecosystem (repos, sharing, PR-based), contextual help, error reporting, identity recovery, native i18n.

**Best cross-pollination**:
- Bibliogon → AL: docker-app-launcher, release automation, KDP concepts
- AL → Bibliogon: KeyVault (in progress), Anki export, SRS, gamification, content repo, contextual help, error reporting

Both projects share the same architectural DNA (PluginForge, IStorageService, dual-mode offline, Feature Strategy), making component porting straightforward.
