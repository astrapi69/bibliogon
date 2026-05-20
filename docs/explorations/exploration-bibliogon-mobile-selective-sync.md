# Exploration: Bibliogon Mobile + Selective Sync

**Date:** 2026-05-20
**Status:** Open exploration; not yet decisions
**Trigger context:** After PluginForge 0.7.0 + V060 + Phase 4 ship, Aster surfaced interest in Multi-Device-Story modeled on sibling project adaptive-learner Phase 13 (PWA/Dexie phone + FastAPI/SQLite desktop, Local-Sync via QR-pairing + AI-Assisted-Merge). Key constraint surfaced by Aster: user selects which content (books, articles, etc.) goes mobile, NOT full-database sync.

## Pre-audit

This exploration adapts adaptive-learner Phase 13 to Bibliogon-specific constraints. adaptive-learner syncs Learning-Sessions which are Phone-equal-citizen (user starts on phone, continues on desktop, both surfaces equally productive). Bibliogon is fundamentally Desktop-primary: Picture-Book layout, Comic panel-grid, KDP Publishing-Wizard are not Phone-productive. Phone for Bibliogon is **Capture-and-Review-Surface**, not **Production-Surface**.

Plus Aster's selective-sync constraint changes the architecture: Phone holds a user-curated subset of content, not full library. This eliminates many Conflict-Resolution edge cases that adaptive-learner Phase 13 design contains.

## Use Case Definition

### Mobile-Plausible Workflows

1. **Capture unterwegs.** Author has idea for article or character note while away from desk. Opens phone, captures plain text. Syncs back to desktop when home.

2. **Review on phone.** Author has work-in-progress book/article. Wants to re-read on commute, train, waiting room. Read-only or light-edit.

3. **Voice-to-text Capture.** Author dictates idea into phone. Auto-transcribes (browser API or future plugin). Lands as draft on phone, syncs to desktop.

4. **Note-taking during research.** Author reads physical books or articles, captures quotes/notes on phone, syncs to desktop for incorporation into book project.

5. **Bookmarks plus reference snippets.** Author saves web articles or quotes via phone share-sheet, available on desktop for reference.

### Mobile-Implausible Workflows (explicit OUT-of-scope)

- Picture-Book speech-bubble positioning, color-picking, layout-config edits
- Comic panel-grid layout, bubble drag-and-drop, panel image upload
- KDP Publishing-Wizard multi-step submission
- BookMetadataEditor full edit (acceptable as read-only)
- Long-form-writing-session (Touch typing too slow for productive 1000-word sessions)
- Plugin management, Settings deep-edit, AI provider configuration

### Mobile-Maybe Workflows (decision pending)

- Article-Editor full edit on phone (TipTap-on-touch is workable but not great)
- Page-level edit in Picture-Book/Comic (text-content only, not layout)
- Settings light-edit (theme, language)

## Architectural Implications of Selective Sync

### Selection Model

User explicitly opts content INTO Phone. Three candidate models:

**(α) Per-Item Selection.** User clicks "Sync to Phone" on individual articles or books. Phone holds exactly that set. Granular but UI-friction.

**(β) Project-Level Selection.** User marks entire book or article-collection as Phone-enabled. All child entities (pages, articles, etc.) sync. Less granular but simpler.

**(γ) Tag-Based Selection.** User assigns "mobile" tag to content. All tagged content syncs. Flexible but requires tag-management UX.

**Recommendation: β with sub-item override.** Mark book or article-collection as Phone-enabled; per-item override possible. Matches user mental-model (working on book = need it on phone).

### Selective Sync Reduces Conflict Surface

adaptive-learner Phase 13 syncs all mutable entities (User, UserSettings, LearningProject, Curriculum, LearningTopic, Lesson). Bibliogon with selective sync only conflicts within selected scope. Outside-scope entities are Desktop-only by definition.

**Append-only candidates (auto-merge, no user interaction):**
- ArticleVersion (immutable snapshots)
- BookVersion / BackupSnapshot (immutable snapshots)
- CommitMessage / ManuskriptHistory entries (append-only by design)
- AudioRecording / VoiceMemo (if voice-capture feature ships)
- ImportedContent (research notes, web-snippets)

**Mutable candidates (conflict possible, need merge strategy):**
- Article (text_content, title, status)
- Book (title, metadata)
- Page (within selected book)
- Bubble layout_config (within selected page) — only if mobile page-editing enabled
- User-specific bookmarks/markers

**Settings: Phone-local plus Desktop-local, NOT synced.** Each device has its own AI providers, language preference, theme. Simpler mental-model: "this is Phone's settings, not your Bibliogon's settings."

### Storage Footprint

Selective sync makes Phone-storage manageable:

- Full Bibliogon DB at typical Author scale: 50MB-2GB (depends on backup-history plus voice plus images)
- Selectively-synced subset: typically 5-50MB (active book plus 10-20 articles plus light voice)
- Fits comfortably in IndexedDB quota (typically 50%-80% of available disk per origin)

## Sub-Phase Breakdown

### Phase A: PWA Foundation

**A1.** Service-worker setup, vite-plugin-pwa configuration, manifest.json with Bibliogon icons + display-mode.
**A2.** Dexie layer for IndexedDB. Initial schema mirrors backend schema for selected-content entities only.
**A3.** Responsive-layout audit. Phone-width 380px tested for: Article-Editor, Article-List, Book-List, Settings (reduced), Login (if needed).
**A4.** Phone-Install UX. "Add to Home Screen" prompt or guide. Test on iOS Safari + Android Chrome.
**A5.** Read-only mode for Picture-Book/Comic surfaces. User can view but not edit on Phone.

**Estimated:** 8-12 commits.

### Phase B: Mobile-Tailored UI

**B1.** Phone-optimized Article-Editor. TipTap minimal toolbar, large touch targets, voice-input button.
**B2.** Phone-optimized Article-List + Book-List. Compact rows, swipe actions, infinite scroll.
**B3.** Settings reduced to Mobile-Relevant tabs (theme, language, sync, voice). Hide AI providers, plugins, etc.
**B4.** Read-only viewers for Picture-Book/Comic on Phone. Show pages, zoom, no edit.
**B5.** Mobile-Navigation pattern (bottom nav-bar standard for mobile, replace desktop sidebar).

**Estimated:** 6-10 commits.

### Phase C: Selection UI

**C1.** "Sync to Phone" toggle on Book and Article-Collection.
**C2.** "Phone Library" view on Desktop. Shows what's currently on Phone, allows add/remove.
**C3.** "Phone Library" view on Phone. Shows what's been synced, allows local-unsync (frees space).
**C4.** Selection-Status indicator (e.g. "On Phone" badge in Desktop UI).

**Estimated:** 4-6 commits.

### Phase D: Sync Infrastructure

**D1.** Backend `/api/sync/` endpoints (push, pull, status, pair, resolve). Filtered by selection-scope.
**D2.** QR-Code-Pairing (Desktop generates token, Phone scans). 5-min token expiry. Local-network-only.
**D3.** SyncEngine frontend (PWA-side). Bidirectional sync within selected-scope.
**D4.** Conflict-Resolution UI for mutable entities within scope.
**D5.** AI-Assisted-Merge (optional, falls AI-Provider configured on Desktop). Adapted from adaptive-learner Phase 13E.
**D6.** Sync Status in Settings (last-sync, pending-changes, "Sync Now" button).
**D7.** Network-failure-handling, token-expiry-handling, retry-logic.

**Estimated:** 12-18 commits.

### Phase E: Hardening + Documentation

**E1.** Edge-case testing: network drops mid-sync, both devices edit same article offline, large-content sync (10MB+ article), Phone-storage-quota-near-limit handling.
**E2.** Documentation: user-guide for pairing + selective-sync workflow, developer docs for sync architecture, API reference for new endpoints.
**E3.** README + CONCEPT.md updates.
**E4.** v0.40.0 (or whatever version) release-cut with Mobile-plus-Sync as headline feature.

**Estimated:** 5-8 commits.

## Total Estimate

**35-54 commits across 5 phases.** Substantial, multi-month effort. Not a single-session feature.

## Architecture Decisions Pending

### D1: Sync as Plugin or Core?

**(α) Core Feature.** Sync lives in backend/app and frontend/src directly. Always-on for all Bibliogon users.
**(β) Plugin (`bibliogon-plugin-sync`).** Sync is opt-in via plugin install. Authors who don't need Mobile can ignore.
**(γ) Core PWA + Plugin Sync.** PWA-build always available (zero-cost if user doesn't install on phone). Sync infrastructure ships as plugin (opt-in for those who want Mobile).

**Recommendation: γ.** PWA-build itself is cheap to ship (just vite-plugin-pwa + service worker + manifest). Adding it to Desktop-build doesn't harm Desktop users. Sync as plugin keeps Backend lean for users who don't sync.

### D2: Voice-Capture Scope

**(α) Browser-API only.** Use `webkitSpeechRecognition` or MediaRecorder. Free, basic accuracy, requires online for Google API.
**(β) Backend plugin.** Audio uploads to Desktop, Desktop runs Whisper or similar transcription. Better accuracy, offline-capable, requires Desktop-online.
**(γ) Out of scope this exploration.** Voice-capture is separate Mobile-feature, defer to follow-up exploration.

**Recommendation: γ.** Voice is a feature that benefits Mobile but isn't fundamental to Mobile-plus-Sync architecture. File separate exploration after Phase D ships.

### D3: Read-Only on Phone vs Light-Edit on Phone

**(α) Strictly Read-Only on Phone for Picture-Book/Comic.** User reviews, doesn't touch.
**(β) Text-Content Light-Edit on Phone.** User can edit text inside page-bubbles/text-blocks but not layout or images.
**(γ) Full Edit on Phone (out-of-scope per use-case analysis).**

**Recommendation: α for Phase A-D, β as Phase F follow-up if user demand emerges.** Strict separation reduces Conflict-Surface. Once architecture proven on Articles, expand to text-light-edit on Books in follow-up phase.

### D4: Conflict-Resolution Default

**(α) Last-Write-Wins (timestamp-based).** Newest edit wins, user-confirms post-hoc.
**(β) User-Manual per conflict.** Every conflict requires user-decision before write.
**(γ) AI-Suggested with User-Confirm.** AI proposes merge, user approves or edits.

**Recommendation: β for v1.** Safest user-trust path. (γ) AI-Suggested optional layer when AI-provider configured (matches adaptive-learner Phase 13E pattern). (α) Last-Write-Wins as fallback pre-selection in (β) dialog.

### D5: Multi-Device-Auth Model

**(α) Single Pairing Token (one device max).** Phone pairs once, only that Phone syncs.
**(β) Multi-Device Pairing.** Phone + Tablet + secondary Phone all pairable. Each device tracked.
**(γ) Open Network Discovery.** Any device on local-network can request pairing, Desktop approves each.

**Recommendation: β.** Multi-Device is realistic (Author has Phone + Tablet, both want Bibliogon-Mobile). Track devices in Desktop Settings. (γ) adds attack-surface on local-network without clear value.

### D6: Offline-Sync Conflict Window

Phone may be offline for days. User edits Article on Phone, also edits same Article on Desktop. Long offline window means accumulated changes need merge.

**(α) Per-field merge.** Track field-level changes, merge non-conflicting fields automatically.
**(β) Per-document merge.** Conflict on entire document if both edited.

**Recommendation: β for v1.** Per-field merge is complex (text-content as single field is hard to merge sensibly). Per-document with AI-merge optional handles 95% of cases pragmatically.

## Decisions Pending for User Adjudication

When this exploration is triaged (similar to exploration-features-2026-05-15-evaluation pattern):

1. **Use-Case Validation:** Are the 5 mobile-plausible workflows accurate? Anything missing? Anything overstated?
2. **D1 Sync-as-Plugin-vs-Core:** Recommendation γ (Core PWA + Plugin Sync).
3. **D2 Voice-Capture Scope:** Recommendation γ (separate exploration).
4. **D3 Read-Only-vs-Light-Edit:** Recommendation α for v1.
5. **D4 Conflict-Resolution Default:** Recommendation β with γ AI-layer.
6. **D5 Multi-Device-Auth:** Recommendation β.
7. **D6 Conflict Window:** Recommendation β per-document.
8. **Selection Model:** Recommendation β project-level with sub-item override.
9. **Sequencing:** A → B → C → D → E linear, or can phases parallelize?
10. **Release Strategy:** Big-bang v0.40.0 mobile release, or incremental (Phase A in v0.37, Phase D in v0.40, etc.)?

## Sequencing Question

Bibliogon current state (2026-05-20): Phase 4 closed, V060 shipped (Recursion-Regression in flight), Comics-Session-2 halted pending Foundation-fix. Plus existing P2 backlog: KDP-Publishing-Wizard, Story-Bible-Plugin.

Mobile-plus-Sync is 35-54 commits. Multi-month investment.

**Pragmatic sequencing options:**

**(I) Foundation-First.** Fix Recursion-Regression → finish Comics-Session-2 → release v0.36.0 → THEN start Phase A. Clean handoff to mobile work.

**(II) Parallel-Track.** Start Phase A while Comics-Session-2 wraps. Different CC-agents on different feature-branches (gitflow). Mobile-foundation builds while Desktop-features ship.

**(III) Interleaved.** A → B → KDP-Wizard → C → D → Story-Bible-Plugin → E. Mobile features interleaved with Desktop features over multi-month period.

**Recommendation: (I) for Phase A start, then re-evaluate.** Foundation must be clean before Mobile-PWA-Build. Comics-Session-2 must ship to validate Plugin-architecture before sync-as-plugin work. Once Phase A complete, can revisit (II) or (III) for B-onward.

## Not in Scope (Explicit)

- Cloud-Sync. Bibliogon stays local-network-only. No cloud-relay even as optional.
- Multi-User-Sync. Single Author across own devices. No "share with co-author" sync.
- Real-Time Collaborative Editing. No CRDT or operational-transform.
- iOS/Android Native Apps. PWA-only.
- Backend-port-publishing-for-public-WAN. Sync requires both devices on same local network.
- Sync-server-as-separate-binary. Sync is built into Desktop Bibliogon.
- Cross-instance-sync (e.g. Author has Bibliogon on two desktops). Possibly enabled implicitly but not explicit feature.

## References

- adaptive-learner Phase 13 (8 sub-phases) — pattern source
- **adaptive-learner local checkout at `/home/astrapi69/dev/git/hub/astrapi69/adaptive-learner`** — CC can read actual implementation, not just exploration-prompt text. See "Reference-Reading Strategy" section below for what to look at and what NOT to assume.
- `.claude/rules/architecture.md` — Bibliogon plugin-architecture conventions
- `.claude/rules/coding-standards.md` — Bibliogon patterns to inherit
- `docs/explorations/multi-agent-gitflow-coordination.md` — coordination for multi-agent Mobile work
- Existing UUIDs as primary keys (already in place since early Bibliogon — foundation for sync)
- `bibliogon-plugin-export` — pattern reference for `bibliogon-plugin-sync` if D1 γ adopted

## Reference-Reading Strategy for adaptive-learner

When CC implements Phase A-E, the adaptive-learner checkout is available locally for reference. Read with discipline, not as gospel:

### What to read from adaptive-learner

1. **PWA setup (Phase A reference).** `vite.config.ts`, `manifest.json`, service-worker setup, `manifest.webmanifest`. Adaptive-learner has a working PWA-build; Bibliogon can inherit the configuration pattern.

2. **Dexie schema layer (Phase A reference).** How adaptive-learner structures `frontend/src/storage/` for IndexedDB-backed entities. Inherit the layering, but Bibliogon's schema is DIFFERENT (Articles, Books, Pages — not LearningSessions). Do NOT copy schema definitions.

3. **QR-Code Pairing UX (Phase D reference).** Pairing-token generation, QR-rendering, scanner-side flow. Inherit pattern verbatim; nothing Bibliogon-specific changes.

4. **Sync endpoint shape (Phase D reference).** `/api/sync/` route handlers, push/pull/resolve semantics. Inherit conceptually; adapt to Bibliogon's selective-sync constraint (filter records by selection-scope, not just timestamp).

5. **Conflict-Resolution UI (Phase D reference).** Side-by-side diff component, three-button choose UI, field-highlight pattern. Inherit verbatim where possible.

6. **AI-Assisted-Merge prompt structure (Phase D reference, if AI-merge adopted).** Prompt template, defensive JSON parsing, error-handling. Inherit pattern; tune prompt for Bibliogon entity-shapes (Article vs LearningProject).

### What NOT to copy from adaptive-learner

1. **Data classification.** adaptive-learner's append-only/mutable list applies to LearningSessions, SessionMessages, etc. Bibliogon has different entities. Re-classify from Bibliogon's schema (Pre-Inspection step before Phase D coding).

2. **Full-database-sync logic.** adaptive-learner syncs entire user-DB. Bibliogon adds selective-sync filter. Sync logic MUST respect the selection-scope; do not port unfiltered sync.

3. **Settings-sync behavior.** adaptive-learner may sync user preferences. Bibliogon explicitly DOES NOT sync settings (per architectural-decision D-not-yet-formalized in this exploration: settings are device-local).

4. **Auth model.** adaptive-learner pairing-token semantics inherit. Plus Bibliogon-specific: multi-device pairing (D5 recommendation β) extends adaptive-learner's likely single-device pattern.

5. **Plugin architecture.** adaptive-learner does not use PluginForge. Bibliogon's sync-as-plugin (D1 γ) is novel; cannot copy plugin-architecture from adaptive-learner.

### How to read

Pre-Inspection step before each Phase coding: CC reads relevant adaptive-learner files, summarizes pattern, flags what to inherit vs what to redesign for Bibliogon-context. Output is a "reference-read summary" before code-write begins.

This matches Pre-Coding-Reality-Check pattern (formalized in `.claude/rules/lessons-learned.md` 2026-05-19): don't write code based on remembered pattern; re-read at the keystroke.

### What if adaptive-learner pattern conflicts with Bibliogon convention?

Bibliogon convention wins. Examples:

- adaptive-learner uses some-naming-convention; Bibliogon uses snake_case in Python plus camelCase in TS. Use Bibliogon.
- adaptive-learner places sync routes at `/api/sync/`. Bibliogon may need `/api/sync/` OR plugin-namespaced `/api/sync-plugin/` based on D1 outcome. Use Bibliogon-architected location.
- adaptive-learner conflict-resolution may have different button-order or i18n-key shape. Use Bibliogon's existing i18n conventions plus button-style.

Surface conflicts during Pre-Inspection; do not silently adopt adaptive-learner pattern that breaks Bibliogon consistency.

## Triage Question for CC Evaluation

When this exploration goes to CC for evaluation (similar pattern to exploration-features-2026-05-15):

Apply ACCEPT / DEFER / REJECT / EXTEND markers per sub-phase plus per architecture-decision. Plus surface any Bibliogon-specific blocker not covered above (e.g. existing schema incompatibility with selective-sync, existing UI surface that would need substantial refactor for Mobile-responsive).

CC plus Strategic-Advisor are aligned on β2-style Anti-Speculation: anything not-explicitly-needed gets deferred to follow-up. v1 should ship Capture-plus-Review-on-Phone with Sync-back-to-Desktop. Anything beyond that is follow-up.
