# Bibliogon manual smoke-test catalog

Structured per-feature catalog of manual smoke checks. Each entry has reproducible steps, severity, last-verified date, and a pointer to the related commit / backlog item / automated spec when one exists.

**Companion files:**
- `docs/manual-smoke-tests.md` — checklist of items genuinely out of Playwright's reach (subjective visuals, real third-party APIs, hardware drag-drop, cross-browser, real-zoom rendering). That file shrinks over time.
- `e2e/smoke/` — Playwright specs that automate what's automatable. This catalog references them when an entry is fully covered.

**This file's purpose:** a living inventory across all major features so the user can scan severity, pick the highest-value gaps, and promote them to GitHub issues for tracking.

Last updated: 2026-04-28

---

## Severity scheme

| Severity | Meaning |
|----------|---------|
| **Critical** | Blocks core workflow (editor disabled, save broken, data loss) |
| **High** | Blocks specific feature (import broken, primary action hidden, export fails) |
| **Medium** | Wrong but workable (status confusing, label missing, tooltip absent) |
| **Low** | Polish (visual inconsistency, hint wording, edge-case message) |

---

## GitHub-issue promotion criteria

Promote a smoke test to a GitHub issue when ANY of:
1. Severity is **Critical** or **High** AND the test has not been verified in the current release.
2. Severity is **Medium** AND the test has failed in two or more recent sessions (recurring regression).
3. User explicitly flags the test for tracking.

After issue creation, append `**Issue:** #<num>` under the test entry.

---

## Article authoring

### AE-01: ArticleEditor opens for new article
**Steps:**
1. Dashboard → Articles → "Neuer Artikel"
2. New article opens, default author from settings
3. Editor area visible with placeholder "Beginne zu schreiben..."
4. Toolbar renders (24 buttons after Phase 1 extraction)
5. Auto-save indicator shows the saved baseline

**Severity:** Critical (blocks creation flow)
**Last verified:** 2026-04-28
**Last failure:** ac25cc8 layout move masked editor → 2f9d0fb (`tiptap-editor` class + Placeholder)
**Related:** AR-01 Phase 1, RichTextEditor extraction (db44cd3 + ab15131)

### AE-02: Status lifecycle persists
**Steps:**
1. Open existing article
2. Status dropdown shows: Entwurf, Bereit, Veröffentlicht, Archiviert
3. Change to "Bereit", reload
4. Status persists as "ready"
5. Repeat for each transition

**Severity:** Medium (workflow correctness)
**Last verified:** 2026-04-28
**Related:** UX Round 1 (018cc68) added "ready" state

### AE-03: Topic inline-add works without browser prompt
**Steps:**
1. Topic dropdown shows existing topics
2. Click "+ Neues Thema hinzufügen"
3. Inline input row appears (NOT browser `prompt()`)
4. Type name, press Enter or click Speichern
5. Topic added to settings, selected on article
6. Press Escape on input cancels cleanly
7. Reload — topic still in dropdown, settings persisted

**Severity:** Medium (UX defect when broken)
**Last verified:** 2026-04-28 (Round 2 fix 2222698)
**Last failure:** Round 1 used `window.prompt`

### AE-04: Tooltips on metadata fields
**Steps:**
1. Hover each sidebar field label (subtitle, author, topic, language, status, SEO title, SEO description, canonical URL, featured image, excerpt, tags)
2. Radix tooltip appears within ~300ms with description
3. Underline-dotted style + `cursor: help` signal hover trigger

**Severity:** Low (UX clarity)
**Last verified:** 2026-04-28 (2222698)

### AE-05: AI panel uses article-tone prompts
**Steps:**
1. Open article, open AI panel
2. Trigger Improve / Shorten / Expand
3. Generated text reflects online-publication tone (engaging, accessible)
4. NOT book-chapter tone (no genre/series framing)

**Severity:** Medium (output quality)
**Last verified:** Pending user confirmation (CCR / no smoke ran)
**Related:** Phase 1 prompt branching (db44cd3)

### AE-06: Audiobook button hidden in article mode
**Steps:**
1. BookEditor → audio preview button visible in toolbar
2. ArticleEditor → audio preview button NOT in toolbar
3. No console errors

**Severity:** Low (correctness, no blocking)
**Last verified:** 2026-04-28
**Related:** `pluginsForContentKind` gating (fcfe14c)

### AE-07: Featured image upload + URL fallback
**Steps:**
1. Drag image onto "Bild ablegen oder klicken zum Auswählen" zone
2. Upload completes, 180px preview shows
3. Reload — preview persists
4. X button removes image (file gone from disk + URL cleared)
5. URL field still works for remote images
6. Hint tooltip clarifies dropzone vs URL

**Severity:** Medium
**Last verified:** 2026-04-28 (UX-FU-02 shipped: 335cf04 + ebb568b + 9600ce2)

### AE-08: Tag chip add/remove (KeywordInput)
**Steps:**
1. Type tag, press Enter → chip appears
2. Drag chip to reorder
3. Click X on chip → removed
4. Reload → tags persist

**Severity:** Low
**Last verified:** 2026-04-28 (Round 1 wired KeywordInput, 94eb3a2)
**Auto-coverage:** `e2e/smoke/keywords-editor.spec.ts` covers the underlying widget.

### AE-09: Theme toggle in ArticleEditor header
**Steps:**
1. Click theme toggle in ArticleEditor header
2. UI flips dark ↔ light immediately
3. Persists across reload
4. Same as BookEditor / Dashboard (no drift)

**Severity:** Low
**Last verified:** 2026-04-28

### AE-10: SEO description + Excerpt render at 3 rows
**Steps:**
1. SEO Description textarea visible at ~5em min-height (3 lines visible)
2. Same for Excerpt
3. Resizable vertically
4. Placeholder visible when empty

**Severity:** Low (was Medium when collapsed to half-line)
**Last verified:** 2026-04-28 (94eb3a2 added minHeight + lineHeight)

### AE-11: Article delete + 404 path
**Steps:**
1. Open article
2. Sidebar → Löschen (red button)
3. Confirm in AppDialog
4. Navigate to articles list — gone
5. Direct GET on the deleted id → 404 in network
6. Cascade: associated publications + article assets gone too

**Severity:** High (data loss vector if cascade broken)
**Last verified:** Backend tests pass (1180/1181); browser flow not re-verified post-AR-02
**Related:** AR-02 Publication cascade-delete + UX-FU-02 ArticleAsset cascade

### AE-12: Multi-platform Publications panel
**Steps:**
1. Sidebar → Publikationen → Hinzufügen
2. Pick platform (Medium / Substack / X / LinkedIn / dev.to / Mastodon / Bluesky / custom)
3. Form renders platform-specific fields from schema
4. Submit → row added in "Geplant" state
5. Mark Published → drift baseline snapshot taken
6. Edit article content → publication flips to "Nicht synchron"
7. Verify Live → resets baseline

**Severity:** High (core AR-02 value)
**Last verified:** 2026-04-27 (e09f51e shipped)

---

## Book editor

### BE-01: ChapterSidebar drag reorder
**Steps:** drag chapter to new position; reload; position persists.
**Severity:** Medium
**Auto-coverage:** chapter reorder in `e2e/smoke/chapter-reorder.spec.ts` (partial); real drag-drop is in `manual-smoke-tests.md` section 3.

### BE-02: Auto-save in chapter
**Steps:** type → "Speichert..." → "Gespeichert" within 1s; reload preserves content.
**Severity:** Critical (data loss vector)
**Last verified:** Continuously via Vitest + integration tests; browser path covered by `e2e/smoke/editor-formatting.spec.ts`

### BE-03: AI review (book chapter)
**Steps:** open AI panel → Review → SSE progress → result + cost label → download MD report.
**Severity:** Medium
**Last verified:** v0.20.x ship; not re-run since.

### BE-04: Audiobook preview + full export
**Steps:** select text → audio preview (Edge TTS by default) → plays. Full async export → SSE progress → download MP3 / merged.
**Severity:** High
**Auto-coverage:** generator + sync route 410 covered in plugin tests; UI flow needs human.

### BE-05: Export to EPUB
**Steps:** sidebar Export → EPUB → download → epubcheck passes.
**Severity:** High (primary user output)
**Auto-coverage:** scaffolder unit tests; full Pandoc roundtrip in `manual-smoke-tests.md` section 2.
**Last verified:** Last release.

### BE-06: Export batch (all formats)
**Steps:** Export → Batch (or per-format loop) → ZIP contains all selected formats.
**Severity:** Medium
**Last verified:** v0.19.x.

### BE-07: Search & Replace (Ctrl+H)
**Steps:** Ctrl+H toggles panel; search + replace + replace-all behave; Escape closes.
**Severity:** Low
**Auto-coverage:** none yet.

### BE-08: Style check (ms-tools)
**Steps:** toolbar style-check button → findings underlined; toggle off clears.
**Severity:** Medium
**Last verified:** v0.18.x ship.

### BE-09: Grammar check (LanguageTool)
**Steps:** toolbar spellcheck → results panel populated; "no issues" toast on clean text.
**Severity:** Medium

### BE-10: Markdown mode toggle
**Steps:** toggle to MD → text representation appears; edit; toggle back → TipTap renders edits.
**Severity:** Medium
**Last verified:** v0.18.x.

### BE-11: Focus mode
**Steps:** toolbar Focus button → non-focused nodes dim; click block → restores focus locally.
**Severity:** Low

### BE-12: Draft recovery (IndexedDB)
**Steps:** type without save, kill tab, reopen chapter → recovery banner shows older draft + Recover/Discard.
**Severity:** Critical (last-resort data save)
**Last verified:** v0.18.x ship.

### BE-13: Image upload via drag-and-drop
**Steps:** drag PNG into editor → uploads to book assets → renders inline.
**Severity:** Medium
**Manual:** in `manual-smoke-tests.md` section 3 (hardware drag-drop).

### BE-14: BookMetadataEditor full save
**Steps:** edit ISBN, ASIN, publisher, keywords, cover upload, custom CSS → Save → reload preserves all fields.
**Severity:** High
**Auto-coverage:** `e2e/smoke/book-metadata-roundtrip.spec.ts` partial.

### BE-15: Word goal + character count
**Steps:** set chapter word goal → status bar shows progress bar; typing updates count live.
**Severity:** Low

---

## Plugin git-sync

### GS-01: PGS-01 import from public git URL
**Steps:** Dashboard → Import → Git URL → paste WBT repo → wizard detects layout → import → book opens.
**Severity:** High
**Auto-coverage:** `e2e/smoke/import-wizard-git-url.spec.ts`
**Last verified:** v0.21.0.

### GS-02: PGS-02 commit to repo (SSH ambient cred)
**Steps:** edit chapter → sidebar Git Sync → Commit → push via SSH agent → no PAT prompt → branch updated upstream.
**Severity:** High
**Last verified:** v0.22.x ship; needs SSH agent + repo write access.

### GS-03: PGS-03 conflict resolution
**Steps:** local + remote both edit same chapter → next pull triggers smart-merge → per-chapter UI offers keep_local / take_remote / mark_conflict → choices apply correctly.
**Severity:** High
**Last verified:** v0.22.x ship.

### GS-04: PGS-04 multi-language linking
**Steps:** repo with `main-de` + `main-fr` → import detects multi-branch → both books created with shared `translation_group_id` → cross-links visible.
**Severity:** Medium
**Last verified:** v0.23.0 ship.

### GS-05: PGS-05 unified commit fan-out
**Steps:** trigger commit → core-git history + plugin-git-sync subsystem both updated under per-book lock; failure in one isolated from the other.
**Severity:** Medium
**Last verified:** v0.23.0 ship.

---

## Backup + import

### MB-01: Single-book BGB roundtrip
**Steps:** export `.bgb` → delete book → import → identical state restored (chapters, assets, metadata, optional audiobook files).
**Severity:** Critical (backup is data safety)
**Auto-coverage:** `e2e/smoke/backup-roundtrip.spec.ts`
**Last verified:** Continuously via Playwright.

### MB-02: Multi-book BGB import (XState wizard)
**Steps:** export `.bgb` containing 2+ books → import wizard shows per-book selection (default-all-on) → per-book duplicate detection (overwrite/copy/skip) → books restored as picked.
**Severity:** High
**Auto-coverage:** `e2e/smoke/import-wizard-bgb.spec.ts`
**Last verified:** v0.22.1 ship.

### MB-03: write-book-template (.bgp / ZIP) project import
**Steps:** import a WBT project ZIP → metadata parsed → chapters in correct order (front/body/back) → assets linked.
**Severity:** High
**Auto-coverage:** `e2e/smoke/import-flows.spec.ts`

### MB-04: Trash + restore
**Steps:** delete book → trash → restore → book reappears intact.
**Severity:** High
**Auto-coverage:** `e2e/smoke/trash.spec.ts`

---

## Settings

### SE-01: Topics CRUD via Settings tab
**Steps:** Settings → Themen → add/remove/reorder topics → Save → ArticleEditor topic dropdown reflects.
**Severity:** Medium
**Last verified:** 2026-04-27 (68a9686).

### SE-02: Author profile + pen names
**Steps:** Settings → Autor → add pen name → ArticleEditor + BookMetadataEditor author dropdowns include it.
**Severity:** Medium

### SE-03: Plugin enable/disable + ZIP install
**Steps:** Settings → Plugins → toggle plugin → restart-free behavior change. Upload ZIP plugin → installs into `plugins/installed/{name}/`.
**Severity:** High
**Auto-coverage:** `e2e/smoke/plugin-install.spec.ts`

### SE-04: AI provider configuration
**Steps:** Settings → KI → enter API key per provider → save → AI panel uses configured provider.
**Severity:** High (paid services)
**Manual:** real-API verification covered by `manual-smoke-tests.md` section 2.

---

## Dashboard

### DA-01: Filter by genre / language / status
**Steps:** dashboard filter bar → pick genre / language / sort → URL params update → reset clears.
**Severity:** Medium
**Auto-coverage:** `e2e/smoke/dashboard-filters.spec.ts`

### DA-02: Create book from template
**Steps:** "Neues Buch" → pick template → wizard fills chapter scaffold.
**Severity:** Medium
**Auto-coverage:** `e2e/smoke/create-book-from-template.spec.ts`

---

## Cross-cutting

### CC-01: Theme palette + dark/light toggle
**Steps:** cycle 6 palettes (Warm Literary / Cool Modern / Nord / Classic / Studio / Notebook) × dark/light. No visible regressions.
**Severity:** Medium
**Auto-coverage:** `e2e/smoke/themes.spec.ts` (state-machine + key rules).
**Manual:** subjective contrast in `manual-smoke-tests.md` section 1.

### CC-02: i18n switching (8 languages)
**Steps:** Settings → Sprache → switch DE/EN/ES/FR/PT/EL/TR/JA → all labels update without reload.
**Severity:** Medium
**Last verified:** 2026-04-28 (60+ article keys synced across 8 langs).

### CC-03: AppDialog + sticky-footer modal
**Steps:** open any modal with long content (chapter type picker, metadata editor) → action buttons stay visible at bottom on small viewports.
**Severity:** Medium
**Last verified:** v0.22.0 audit covered 13 modals; non-wizard sweep open in backlog.

### CC-04: Production DB tripwire
**Steps:** continuous; never write `bibliogon.db` outside `backend/` working copy.
**Severity:** Critical (data corruption vector)
**Last verified:** Continuously.

### CC-05: AI Review extension panel
**Steps:** Quality tab → click finding → Editor scrolls + selects + opens AI panel in fix-issue mode.
**Severity:** Medium
**Auto-coverage:** `e2e/smoke/ai-review.spec.ts`

### CC-06: Editor content-safety (XSS-like paste)
**Steps:** paste raw `<script>` and onerror img → sanitized; nothing executes.
**Severity:** Critical (security vector)
**Auto-coverage:** `e2e/smoke/content-safety.spec.ts`

### CC-07: Theme toggle persistence across pages
**Steps:** toggle dark on Dashboard → navigate to BookEditor / ArticleEditor / Settings → still dark.
**Severity:** Low
**Last verified:** 2026-04-28.

---

## Top-5 promotion candidates (current snapshot)

Based on the criteria above, these are the 5 strongest candidates for promotion to GitHub issues today. User to review + flag.

1. **AE-11** Article delete cascade — High severity, browser flow not re-verified after AR-02 publications + UX-FU-02 article assets layered cascade-delete on. One bad cascade = orphaned data.
2. **BE-12** Draft recovery (IndexedDB) — Critical, last verified ~6 months ago. Key data-safety net.
3. **AE-05** AI panel article-tone prompts — Medium, never confirmed by user since Phase 1 (db44cd3). Quality regression risk.
4. **GS-02** PGS-02 commit-to-repo SSH path — High, depends on user's SSH agent state; brittle in fresh environments.
5. **BE-05** EPUB export + epubcheck — High, last verified at last release; primary user output channel.

---

## Gaps (no documented smoke yet)

Features that exist but have no smoke test on file. Pull into the catalog when next touched:

- ChapterTemplate picker + save-as-chapter-template flow
- BookTemplate picker + save-as-template flow
- Conflict-resolution dialog (chapter-level optimistic-lock)
- ChapterVersionsModal (history viewer)
- Plugin trial keys + dormant licensing UI
- ConflictResolution per-chapter chooser in PGS-03 (covered by GS-03 but no isolated dialog smoke)
- Help panel context-sensitive deep-links (HelpLink slug routing)
- HelpProvider slide-over panel open/close behavior
- OfflineBanner appearance + auto-flush of IndexedDB drafts on reconnect
- AudiobookJobProvider badge + reload-recovery (the SSE listener should survive reload via localStorage mirror)
- Settings > Donations support tab visibility gating
- Audiobook persistence + 409 overwrite confirmation
- ElevenLabs API key configure flow

Add entries when working on these areas.
