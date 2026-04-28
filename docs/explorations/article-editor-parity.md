# Article Editor Parity with BookEditor

Status: analysis only, no code changes
Date: 2026-04-28
Author: Claude (analysis), Aster (decision)

## 1. Summary

Article authors today get a stripped TipTap editor (StarterKit + Link + Placeholder, no toolbar, no plugin integrations). BookEditor delivers 24 toolbar buttons, 18 TipTap extensions, and surface integrations into 6 of the 10 plugins. Closing the gap is mostly a frontend refactor: the rich `Editor` component is already entity-agnostic in its core (text + JSON + autosave), but its props (`bookId`, `chapterId`, `chapterType`) and a handful of hardcoded `/api/grammar/check` and `/api/audiobook/preview` calls bake Book identity into the integrations.

**Recommendation: Path C - share the editor + selectively generalize 4 plugins.** Extract `Editor` into `<RichTextEditor>` with an entity-agnostic prop surface (`contentId`, `contentKind: "book-chapter" | "article"`), and generalize grammar + ms-tools + export + translation backends to accept either entity. Leave audiobook, KDP, kinderbuch, git-sync book-only - they semantically need book structure.

---

## 2. Current state

### ArticleEditor (today)

- Single-file `frontend/src/pages/ArticleEditor.tsx` (~770 lines).
- TipTap config: `StarterKit, Link, Placeholder` (3 extensions).
- No toolbar at all - relies on TipTap's default keyboard shortcuts (Ctrl+B, Ctrl+I) and Markdown-style autocomplete from StarterKit.
- No spellcheck, no style check, no AI assistant, no search/replace, no focus mode, no Markdown mode toggle, no draft-recovery, no audio preview.
- Sidebar shows: subtitle, author, language, status, topic, SEO title/description, canonical URL, featured image, excerpt, tags, PublicationsPanel.

### BookEditor / Editor.tsx (today)

- `Editor.tsx`: 1716 lines, 18 TipTap extensions:
  - StarterKit, Link, Placeholder, CharacterCount, TextAlign, Underline, Subscript, Superscript, Highlight, Typography, Table+TableRow+TableCell+TableHeader (4), TaskList+TaskItem (2), TextStyle+Color (2), Figure (community), Footnotes (community), SearchAndReplace (community), OfficePaste (community), Focus, StyleCheckExtension (in-house).
- Toolbar (`Toolbar.tsx`, 492 lines): 24 buttons grouped as marks (Bold/Italic/Underline/Strike/Code/Highlight/Subscript/Superscript), headings (H1/H2/H3), align (left/center/right/justify), lists (bullet/ordered/task), block (blockquote, table, footnote, code block, hr), history (undo, redo). Plus footer buttons: Search & Replace, Focus Mode, Style Check (ms-tools), Spellcheck (grammar), Audio preview (audiobook), AI Panel, Markdown Mode toggle.
- Internal state: `markdownMode, showSearch, focusMode, showSpellcheck, spellcheckResults, styleCheckActive, previewLoading, previewAudioUrl, showAiPanel, aiSuggestion, aiReview, aiPromptType, aiCustomPrompt, activeIssue, reviewFocus, reviewDownloadUrl`. ~16 stateful slices for editor-side features beyond TipTap itself.
- Direct backend calls (in `Editor.tsx`):
  - `fetch("/api/grammar/check", ...)` line 583
  - `fetch("/api/audiobook/preview", ...)` line 645
- Other Book/Chapter-coupled props: `bookId, chapterId, chapterTitle, chapterType, chapterVersion, bookContext, autosaveDebounceMs, draftSaveDebounceMs, draftMaxAgeDays, aiContextChars, initialFocus`.

### BookEditor surface (top-level, beyond Editor.tsx)

- `ChapterSidebar` (chapter list, drag-and-drop reorder, type filters)
- `BookMetadataEditor` (~30 fields: ISBN, ASIN, publisher, keywords, series, cover, custom CSS)
- `ExportDialog` (format picker, options, async job tracking)
- `GitBackupDialog` + `GitSyncDialog`
- `ConflictResolutionDialog` (chapter-level optimistic-lock conflicts)
- `ChapterVersionsModal` (history viewer)
- Save-as-template modals (book template, chapter template)
- `ChapterTemplatePickerModal`
- `QualityTab` (style-check findings list, jumps to issue in Editor via `initialFocus` prop)

---

## 3. Plugin coupling inventory

| # | Plugin | Purpose | UI surface | Entity contract | Operates on | Coupling | Article fit | Effort |
|---|--------|---------|------------|-----------------|-------------|----------|-------------|--------|
| 1 | audiobook | TTS audiobook generation | sidebar + export | Book | book.chapters list | **Tight** | **No** | L (12+h) |
| 2 | grammar | LanguageTool grammar check | toolbar (Editor.tsx) | Neither | plain text | **Loose** | **Yes** | S (<4h) |
| 3 | kdp | Amazon KDP metadata + cover | sidebar | Book | book metadata (ISBN, series) | **Tight** | **No** | L (12+h) |
| 4 | kinderbuch | Children's book layout | editor extension + templates | Neither | page templates | Medium | Maybe | M (4-12h) |
| 5 | ms-tools | Style + sanitize + readability | toolbar (Editor.tsx) | book-id-as-key | plain text + per-book thresholds | Medium | **Yes** | S (<4h) |
| 6 | translation | DeepL/LMStudio translate | sidebar | Book | book.chapters list, also clones whole Book | **Tight** | Maybe | M (4-12h) |
| 7 | help | In-app docs | page | Neither | filesystem md | Loose | N/A | n/a |
| 8 | getstarted | Onboarding + sample book | page | Neither | static seed | Loose | N/A | n/a |
| 9 | export | EPUB/PDF/etc | sidebar | Book | book metadata + chapters scaffolded into project tree | **Tight** | Maybe | M (4-12h) |
| 10 | git-sync | WBT git import/commit/sync | wizard backend | Neither | git URLs + WBT layout | Loose | Maybe | M (4-12h) |

**Summary buckets:**
- **Loose, generalizable** (S): grammar, ms-tools.
- **Medium, worth generalizing**: translation (per-text only, NOT translate-book), export (single-document EPUB / Markdown), kinderbuch (page templates), git-sync (single-doc WBT variant).
- **Tight, leave book-only**: audiobook (multi-chapter merge + chapter_type skip-list), kdp (ISBN, series), translation's `/translate-book` endpoint.
- **Not entity-bound**: help, getstarted.

---

## 4. Three paths

### Path A: Generalize every plugin

Each plugin's API contract migrates from `Book` to a `Content` interface (sum type or duck-typed). Audiobook generates from any `Content` with chapters or sections; KDP validates any `Content` with metadata; etc.

**Per-plugin work:** Audiobook L, KDP L, kinderbuch M, translation M, export M, grammar S, ms-tools S, git-sync M = ~50-80 hours.

**Architecture cost:**
- New `Content` interface in `backend/app/schemas/`, both Book and Article implement.
- API contract migration: `/api/books/{id}/...` -> `/api/content/{kind}/{id}/...` or new parallel routes.
- Plugin frontend manifests: declare which `Content` kinds each plugin supports.
- Database/schema: no direct change but plugin-generated artifacts (audiobook MP3s, KDP validation reports) need a polymorphic `content_id + content_kind` foreign key.
- Plugin author docs need full rewrite.

**Risk:** High. Audiobook merges multi-chapter MP3s with cross-fade and skip-by-type logic that doesn't make sense for a single-document article. KDP encodes Amazon's metadata schema which articles will never need. Forcing the abstraction ships fake support and creates two failure modes per plugin (book mode + article mode).

**Reversibility:** Hard. Once polymorphic, hard to walk back without touching every plugin again.

**Sessions estimate:** 8-12 sessions, including a full regression cycle on Books.

### Path B: Article-as-Book wrapper

When opening an Article, materialize a transient `Book` with a single `Chapter` containing the article TipTap content. Plugins operate on this ephemeral Book. On save, sync back to the Article entity.

**Per-plugin work:** Zero. Plugins unchanged.

**Architecture cost:**
- Mapping layer between Article and Book in the editor frontend (or a backend route `/api/articles/{id}/as-book` that returns a `BookDetail`-shaped payload).
- Plugin output mapping: KDP validation report points to Book.id - which doesn't exist in DB. Audiobook MP3 stored under Book.id - which doesn't exist. Either materialize a real shadow Book row in DB (data integrity nightmare) or make plugins unable to persist.
- UX strings: every plugin label says "Book" but the user is editing an Article. Confusing on every label.
- Plugin authors don't know about wrapping; their "Book" copy stays.

**Risk:** Very high. Plugin-generated artifacts have no clean home. If we materialize a shadow Book, articles and books pollute each other in the dashboard, backups, exports, and templates. If we don't, plugins crash on persist.

**Reversibility:** Easy to remove the wrapper, but the data pollution from any usage period is permanent without manual cleanup.

**Sessions estimate:** 2-3 sessions to ship; 5+ to clean up the data integrity fallout.

### Path C: Share editor + selective plugin support (recommended)

1. Extract `Editor.tsx` into `<RichTextEditor>` with entity-agnostic prop surface:
   - `contentId: string` (was `chapterId`)
   - `contentKind: "book-chapter" | "article"` (drives plugin enable/disable)
   - `content, onSave, autosaveDebounceMs, draftSaveDebounceMs, draftMaxAgeDays, aiContextChars` stay
   - Drop: `bookId, chapterTitle, chapterType, chapterVersion, bookContext, initialFocus` - these become optional props consumed only by `book-chapter` mode (StyleCheckExtension's chapter-type-aware prompt, AI review's bookContext for tone).
   - Plugin gating: a `pluginsForContentKind(kind)` function returns the enabled toolbar plugins for the kind.
2. Generalize four plugins (one PR per plugin):
   - **grammar** (S): `/api/grammar/check` already accepts plain text. Frontend just calls it from Article editor. Zero backend change, ~2h frontend wiring.
   - **ms-tools** (S): generalize per-book threshold lookup to "per-content threshold". ArticleEditor reads thresholds from Article model field (or app-level default for now). ~4h.
   - **export** (M): add `/api/articles/{id}/export/{format}` for Markdown/HTML/PDF/DOCX. Audiobook stays book-only (correct - articles export as text formats only). ~8h.
   - **translation** (M): `/api/translation/translate` accepts plain text already; expose for ArticleEditor. `/api/translation/translate-book` stays book-only. ~6h.
3. Leave book-only: audiobook, KDP, git-sync (book sync only), `/translate-book`, full BookMetadataEditor. ChapterSidebar stays book-only by definition.
4. Per-plugin frontend manifest declares `contentKinds: ["book-chapter", "article"]` so the toolbar button appears or hides automatically.

**Per-plugin work:** S+S+M+M = ~20 hours total. Plus shared editor extraction: ~10 hours.

**Architecture cost:**
- One new prop surface (`contentKind`) on RichTextEditor.
- One new convention for plugin manifests (`contentKinds` field).
- No DB schema changes.
- No API contract breakage for existing Book endpoints.

**Risk:** Low to medium. Each plugin generalization is independent and can be reverted in isolation. Article-side regressions cannot affect Book editor because they're new endpoints / new wiring. The only shared code is RichTextEditor itself - that needs careful extraction with the existing test suite (Vitest 661/661, smoke specs) green throughout.

**Reversibility:** Per-plugin, easy.

**Sessions estimate:** 5-7 sessions. Ship in this order: editor extraction (alone, regression-test books), then grammar, ms-tools, translation, export.

### Path D (surfaced during analysis): Lift the Editor + zero new plugins

A minimal version of Path C: extract `<RichTextEditor>` and give Article authors **just the toolbar + TipTap extensions**. No plugin integrations beyond grammar (which is already free since `/api/grammar/check` is plain-text). Skip ms-tools, export, translation for articles for now - revisit per-plugin only if user demand surfaces.

**Effort:** 1-2 sessions (editor extraction + grammar wiring).

**Tradeoff:** Articles get the full writing surface (toolbar, formatting, AI panel for prose suggestions, search/replace, focus mode, draft recovery) without the per-plugin generalization burden. Lower commitment, ships value fast, leaves Path C upgrades as opt-in next steps.

**This is the best-MVP version of Path C.**

---

## 5. Recommendation

**Ship Path D first (1-2 sessions), then Path C plugin-by-plugin as user demand surfaces.**

Rationale:
- The 80% user value of "BookEditor in articles" is the **toolbar + extensions + AI panel + draft recovery + focus mode + search/replace + Markdown mode** - none of which require plugin work. ArticleEditor is currently impoverished because nobody extracted these from `Editor.tsx`, not because the underlying logic is book-coupled.
- Plugin generalization is real work for incremental gain. Grammar is the only plugin that meaningfully helps article writers and it's already a plain-text endpoint - zero backend cost.
- Audiobook + KDP + multi-language translation are correctly book-only. Forcing them into articles (Path A) adds failure modes without user value.
- Wrapping articles as books (Path B) is a data integrity hazard that compounds with every plugin that persists output.

Path D ships the writing experience users actually want. Path C plugin upgrades happen as discrete follow-ups when the next feature gap is felt.

---

## 6. Phased rollout

### Phase 1 (1-2 sessions): RichTextEditor extraction + grammar

- Extract `Editor.tsx` into `<RichTextEditor>` accepting `contentKind` prop.
- Move toolbar, all 18 TipTap extensions, AI panel, draft recovery, search/replace, focus mode, Markdown mode toggle.
- BookEditor becomes a thin wrapper: passes `contentKind="book-chapter"` plus chapter-specific props.
- ArticleEditor swaps its bare `useEditor` for `<RichTextEditor contentKind="article" contentId={article.id} ... />`.
- Audio preview button hidden for `contentKind="article"` (audiobook is book-only).
- Style check: keep enabled for articles - StyleCheckExtension is text-only, only the `chapterType` prompt overlay is book-specific (gracefully degrade when chapterType undefined).
- Grammar check: enabled for both kinds.
- Manual smoke: BookEditor regression suite + new ArticleEditor smoke that exercises the toolbar.

### Phase 2 (1 session): ms-tools + translation per-text

- Generalize `/api/ms-tools/metrics/{book_id}` thresholds: fall back to app-level defaults when called from article context.
- Wire ms-tools sidebar to ArticleEditor (style check + readability).
- Wire `/api/translation/translate` (plain-text) to ArticleEditor sidebar - "Translate this article into language X" creates a new Article in the target language.

### Phase 3 (1 session): article export

- Add `/api/articles/{id}/export/{format}` for Markdown, HTML, PDF, DOCX.
- Reuse manuscripta single-document path (no scaffolder, no chapter merging).
- Article export menu mirrors book export but skips EPUB/audiobook/project-zip.

### Phase 4 (deferred, only if requested)

- Article-as-WBT git-sync (if users want article repos).
- Kinderbuch single-page article (if users want children's article format).

### Explicit non-goals

- DO NOT generalize audiobook to articles. Multi-chapter merge logic does not fit a single document.
- DO NOT generalize KDP to articles. KDP is Amazon book publishing.
- DO NOT add ChapterSidebar to articles. Articles are single documents by design.
- DO NOT add BookMetadataEditor to articles. Article metadata is intentionally minimal.
- DO NOT introduce a `Content` polymorphic abstraction in the data model. The Book / Article distinction is meaningful.

---

## 7. Open questions for user decision

1. **Phase 1 commitment:** ship RichTextEditor extraction now, or wait until two more articles exist to validate the demand?
2. **Style check on articles:** enabled by default, or opt-in via a Settings toggle? (Affects discovery vs. UX noise.)
3. **AI panel on articles:** the AI review prompts assume "this is a book chapter" tone. Acceptable to inherit verbatim, or does article AI review need its own prompt set first? (Could be a follow-up after Phase 1.)
4. **Article export formats:** which of Markdown / HTML / PDF / DOCX is the priority? One ships as Phase 3 v1, the rest follow.
5. **Article translation persistence:** translated article = new Article row, or in-place language swap? (Articles have no `translation_group_id` like Books do - new field needed if linking is required.)

---

## Appendix: Top 3 surprises from the analysis

1. **Editor.tsx is already 90% entity-agnostic.** The internal state (markdown mode, search, focus, AI panel, draft recovery) doesn't touch Book at all. Only two `fetch()` calls hardcode plugin URLs and only `chapterType` + `bookContext` props feed the AI prompt builder. Path D's "extract and reuse" is genuinely cheap, much cheaper than the prompt's framing of three competing paths suggested.
2. **Grammar plugin needs zero backend work.** `/api/grammar/check` already takes a plain text body. The whole "generalize grammar to articles" is a frontend wiring task that takes minutes, not hours.
3. **Audiobook is the most book-coupled plugin and should stay that way.** It does multi-chapter MP3 merging, ID3-tag chaptering, chapter_type skip-list (marketing chapters skipped by default), per-chapter content-hash caching, and persistent storage under `uploads/{book_id}/audiobook/`. None of that translates to a single-document article. Forcing it via Path A would be a regression for book authors and a confusing half-feature for article authors.
