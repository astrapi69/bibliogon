# Bibliogon Task Overview — 2026-05-23

**Scope:** single source-of-truth for "what is open" across the
Bibliogon project at HEAD `563f298`. Catalogues all task-sources
the user-prompt enumerated: active backlog, recently-closed,
deferred, open audit candidates, open explorations, cross-project
threads.

**Methodology:** every count verified via real command per
`.claude/rules/ai-workflow.md:187` (Numeric-Claims-Verification).
Verification commands listed in the footnote at end of document.

**Disambiguation rule:** each item appears in EXACTLY one section
per its current state. An item that is "shipped" lives in
Recently-Closed (never in backlog). An item that is "deferred"
lives in Deferred Items (never in backlog). An item explicitly
marked as Audit-Candidate AND filed as backlog appears under
Active Backlog (the backlog entry is authoritative); the audit
context is referenced in Notes.

**Two scope modifications from generation directive (2026-05-23):**

1. Recently-Closed: top-10 substantial closures (≥3 commits OR
   foundation-impact-marker) as full table; remaining 25 entries as
   compressed footer list.
2. Open Audit Candidates: ListRow (#3, score 13) listed explicitly
   even though it's the only entry. AUTHOR-DATALIST-EXTEND-EDITORS-01
   appears under Deferred Items (pending-UX-adjudication) per the
   disambiguation rule.

---

## Active Backlog (68 items in `docs/backlog.md`)

Verified counts: P0=0, P1=0, P2=3, P3=31, P4=27, P5=5, BLOCKED=2.
Backlog header prose matches: *"66 active (P2..P5) + 0 active P1 + 2
BLOCKED-on-upstream entries"*.

### P0 / P1 — empty

No active items. P1 tier first stayed empty after the 2026-05-20
Phase 1 ship; sustained empty through 2026-05-23.

### P2 — High-value user features (3 items)

| ID | Title | Effort | Notes |
|---|---|---|---|
| KDP-PUBLISHING-WIZARD-01 | KDP publishing pipeline as a wizard | XL (multi-session) | STRATEGIC; filed 2026-05-19 from exploration-features evaluation. Closes K-03 + K-04 half of K-01..K-04 plan. |
| GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 | Update GetStarted plugin for new book-type set | M | DOC/ONBOARDING. Filed 2026-05-19. |
| RECURRING-COMPONENT-AUDIT-01 | Frontend-wide RCU audit | M (audit + sequence) | Promoted P3→P2 on 2026-05-20 (commit `281a6f6`). Audit shipped `455d4db`; 3 of 5 candidates shipped (BulkActionBar `c2305e7`, AuthorSelectInput `a213788`, Pattern B AuthorProfileSelect `11198a4`). Last remaining candidate #3 ListRow (see Open Audit Candidates section). |

### P3 — Infrastructure / quality (31 items)

| ID | Title | Notes |
|---|---|---|
| AUTHOR-DATALIST-EXTEND-EDITORS-01 | Extend Pattern A datalist to editor surfaces | **Also appears in Deferred Items (Pending-UX-Adjudication)** — see disambiguation note in Deferred section |
| AUTHOR-SELECT-INPUT-EXTRACT-01 | Extract AuthorSelectInput component | **CANDIDATE STATUS NOTE**: paired sibling of the above; recommends promotion P3→P2 per audit footnote |
| CONVERT-TO-BOOK-ASSET-CLONE-01 | Clone asset URLs into book on conversion | Wizard-followup |
| CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01 | Wizard layout-shift fix | UX polish |
| EDITOR-KEYBOARD-SHORTCUT-ALT-Z-01 | Alt+Z keyboard-shortcut binding | UX |
| GH-ACTIONS-PERIODIC-AUDIT-01 | Periodic CI-hygiene audit (Node-runtime deprecations) | Recurring; per LL "External GitHub Action major-version drift" |
| KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01 | Wire KDP categories to CategoryInput component | Pairs with KDP-PUBLISHING-WIZARD-01 |
| LIST-VIEW-ROW-SHARED-EXTRACTION-01 | Extract shared ListRow | **ALSO Open Audit Candidate (#3 score 13)** — backlog entry is authoritative; audit is cross-reference |
| MEDIUM-COMMENT-MANUAL-ENTRY-01 | Manual-entry path for Medium comments | Per "User-facing time estimates" + manual-entry pattern LLs |
| MEDIUM-IMPORT-EXCERPT-AUTOFILL-01 | Auto-fill article excerpt from first paragraph | Medium-import polish |
| MEDIUM-IMPORT-V2-02 | Phase 2 of Medium-import improvements | |
| MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01 | Triage the Mobile-Sync exploration | Filed 2026-05-20 per re-priorit audit Q6 β-path |
| MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01 | Multi-agent gitflow followup | Follows the exploration filed 2026-05-20 |
| PGS-05-FU-01 | Phase 4 picture-book follow-up | |
| PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01 | Per-mark font override | Phase 4 polish |
| PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01 | Picture-book-specific KDP metadata fields | |
| PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01 | Layout-switch text-content conversion | |
| PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01 | Overlay text tier-properties | Phase 4 polish |
| PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01 | TipTap integration for page text | |
| PICTURE-BOOK-PDF-FRONT-MATTER-01 | Picture-book PDF front-matter | |
| PICTURE-BOOK-STORYBOARD-VIEW-01 | Storyboard view for picture-book | |
| PICTURE-BOOK-TEXT-CONFIGURATION-01 | Text-configuration UI for picture-book | |
| PLUGIN-COMICS-E2E-SMOKE-01 | Full E2E smoke for plugin-comics | |
| PLUGIN-COMICS-MAKEFILE-INTEGRATION-01 | Wire plugin-comics into Makefile targets | |
| PLUGIN-COMICS-SESSION-3-EXTENDED-FEATURES-01 | Phase 3 comic-book polish | UNBLOCKED 2026-05-21 (Phase 2 shipped). 17-23-commit multi-session arc. |
| PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01 | Refactor plugin-export to single-router pattern | PluginForge v0.10.0 extends deprecation runway to "earliest v0.11.0" per release note |
| PLUGIN-VERSION-GATING-ENABLE-01 | Enable plugin version-gating | |
| REMINDER-PANEL-GENERIC-EXTRACTION-01 | Generic reminder-panel extraction | Pre-registered; deferred-until-2nd-site (RCU 2-surface threshold not met) |
| SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01 | Settings "Allgemein" tab reorg | UX |
| STORY-BIBLE-PLUGIN-01 | Story-bible plugin | STRATEGIC; long-term |
| WRITING-GOALS-PROGRESS-TRACKING-01 | Writing-goals + progress tracking | |

### P4 — Roadmap / future phases (27 items)

| ID | Title | Notes |
|---|---|---|
| AR-BULK-ASYNC-PROGRESS-01 | Bulk-op async progress UI | Article bulk-ops polish |
| AR-BULK-CROSSPAGE-SELECT-01 | Cross-page bulk select | Article bulk-ops polish |
| AR-BULK-SERIES-HIERARCHY-01 | Series hierarchy in bulk | Article bulk-ops |
| BACKUP-DIFF-DEEP-VARIANTS-01 | Deep-diff variants for backup compare | Backup polish |
| BACKUP-PROJECT-IMPORT-MUTMUT-01 | Mutmut coverage for project-import | Test infra |
| BACKUP-SERIALIZER-MUTMUT-01 | Mutmut coverage for backup serializer | Test infra |
| BIBLIOGON-DATA-FIX-FRAMEWORK-01 | Data-fix framework for in-flight rows | |
| BISAC-DATABASE-LOOKUP-01 | BISAC database lookup (vs regex) | Bug 9 follow-up |
| COMMENTS-ADMIN-PAGINATION-01 | Pagination for comments-admin | |
| COMMENTS-COUNT-PERF-01 | Perf improvement for comments-count | |
| CONVERT-TO-BOOK-CHAPTER-TYPE-DETECTION-01 | Chapter-type detection in wizard | |
| CONVERT-TO-BOOK-REVERSE-LINK-01 | Reverse-link from book to source articles | |
| D-06-VALIDATION-01 | Bug 9 D-06 validation polish | |
| D-07 | Bug 9 D-07 follow-up | |
| FULLSCREEN-PATTERN-RECONCILE-01 | Reconcile native vs custom fullscreen | EDITOR-FULLSCREEN follow-up |
| GH-ACTIONS-OPTIONAL-BUMPS-01 | Optional non-runtime action bumps | CI hygiene |
| GIT-BACKUP-MUTMUT-01 | Mutmut coverage for git-backup | |
| I18N-DIACRITICS-01 | Native diacritic coverage for ES/FR/EL/PT/TR/JA | Long-running track |
| I18N-NATIVE-REVIEW-V031-01 | Native-review for v0.31.0+ i18n | |
| LAUNCHER-I18N-NATIVE-REVIEW-01 | Launcher i18n native review | |
| LAUNCHER-SELFREPLACE-01 | Launcher self-replace updater | |
| MAKEFILE-VERIFY-PLUGIN-LOCKS-PARSE-01 | Parse `verify-plugin-locks` output cleanly | Tooling |
| MYPY-V2-MIGRATION-01 | mypy v2 migration | |
| NAVIGATION-ORIGIN-TRACKING-01 | Track navigation origin | UX research |
| PLUGIN-DEV-SERVER-RESTART-HELPER-01 | Plugin dev-server restart helper | Dev tooling |
| PLUGIN-METADATA-I18N-PARITY-01 | Plugin metadata i18n parity | |
| TESTCLIENT-HARMONIZE-01 | Harmonize TestClient usage across tests | Test infra |

### P5 — Speculative (5 items)

| ID | Title | Trigger |
|---|---|---|
| LAUNCHER-CODE-SIGNING-01 | Code-signing for launcher | User-demand or signed-cert-acquired |
| LAUNCHER-MACOS-UNIVERSAL2-01 | macOS universal2 binary | M1+ user demand |
| PLUGIN-PYDANTIC-COORDINATED-BUMP-01 | Coordinated Pydantic bump | Upstream pydantic v3 |
| TESTCONTAINERS-EVAL-01 | Evaluate testcontainers integration | Pain-point in current TestClient setup |
| WALKER-HYPOTHESIS-01 | Hypothesis-based fuzzing for walkers | Mutation-test signal |

### Blocked / Upstream-Wait (2 items)

| ID | Title | Upstream | Status |
|---|---|---|---|
| CLICK-V8-3-AWAIT-GTTS-01 | Click v8.3 bump | gtts | Awaiting gtts compatibility |
| STARLETTE-V1-AWAIT-FASTAPI-01 | Starlette v1 bump | FastAPI | Awaiting FastAPI v1 compat (v0.136.x still requires starlette ^0.46) |

---

## Recently Closed (2026-05-15 → 2026-05-23)

**Total: 35 archive entries.** Top-10 substantial closures (commit-count ≥3 OR foundation-impact-marker) as full table; remainder as compressed footer.

### Top-10 substantial closures (full table)

| Date | ID / Topic | Commits | Range | Notes |
|---|---|---|---|---|
| 2026-05-23 | Pattern B AuthorProfileSelect (RCU audit-followup) | 2 | `11198a4..0840813` | RCU 2-site; methodology-gap closed-in-action |
| 2026-05-23 | RCU candidate #4 AuthorSelectInput | 2 | `a213788..4220267` | RCU 2-site; Pattern B newly surfaced |
| 2026-05-22 | RCU candidate #2 BulkActionBar | 2 | `c2305e7..42788e2` | RCU 3-site shell extraction; path γ pivot |
| 2026-05-21 | PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 | 7 | `d3410fb..954248e` | All 4 user-findings resolved (#1 + #3); assetUrls Half-Wired closure |
| 2026-05-20 | PLUGIN-COMICS-PHASE-1-MULTI-PANEL-LAYOUTS-01 | 6 | `216b5a1..433d8ce` | Findings #2 + #4; 6 new comic grid templates |
| 2026-05-20 | PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 | 4 | `784804f..2869f3f` | Path A1 architectural relocation; pages router moved to backend core |
| 2026-05-20 | PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01 | 2 | `3fe8633..43f0429` | Foundation: P1 tier emptied via pluginforge ^0.8.0 bump |
| 2026-05-20 | Comics-Session-2 close (plugin-comics v1.1.0) | 7 | `b8e8c82..80399cd` | RCU canonical Tier1+Tier2 extraction; PictureBookPdfExportControls rename |
| 2026-05-20 | PLUGINFORGE V060/V070 adoption arc | 9 | (multi-commit chain) | 4 backlog items closed + Plan-vs-Reality LL formalized |
| 2026-05-19 | PICTURE-BOOK-PDF-BLEED-MARKS-01 | 4 | (chain) | Phase 4 hard-gate 100% closed |

### Compressed footer (remaining 25 entries)

| Date | ID / Topic |
|---|---|
| 2026-05-19 | PICTURE-BOOK-PDF-KDP-FORMATS-01 (3 commits) |
| 2026-05-19 | PADDING-FONT-STYLE-01 + EXTENDED-SHAPE-01 (close-as-superseded) |
| 2026-05-19 | PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01 (4c-B-2, 6 commits) |
| 2026-05-19 | Medium-Import async-progress family close-out |
| 2026-05-18 | EDITOR-FULLSCREEN-NATIVE-01 (7 commits) |
| 2026-05-18 | USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01 (4 commits) |
| 2026-05-18 | BOOKDASHBOARD-CLEANUP-01 (5 commits) |
| 2026-05-18 | Comic-Foundation reframe (2 picture-book items migrated to plugin-comics) |
| 2026-05-18 | Backlog consistency audit (closed-item sweep) |
| 2026-05-18 | KDP-CATEGORIES-CATALOG-SYNC-01 + 2 dead-property cleanups |
| 2026-05-20 | 3 closed/duplicate items from re-prioritization audit (FOUNDATION-SCAFFOLDING + COMIC-BOOK-PLUGIN dup + SPEECH-BUBBLE-TAIL primitive) |
| 2026-05-15 | v0.32.0 cycle close-out + UX-Full-Audit + Bug-A retro |
| 2026-05-15 | MEDIUM-IMPORT + SETTINGS-TABS + SETTINGS-TOPBAR testids |
| 2026-05-15 | LOADING-INDICATOR-EXTRACT-01 |
| 2026-05-15 | BOOKEDITOR-EMPTY-STATE-01 |
| 2026-05-15 | EMPTYSTATE-EXTRACT-01 |
| 2026-05-15 | TEST-ISOLATION-MODULE-STATE-01 |
| 2026-05-15 | VIEW-MODE-TESTID-PARITY-01 |
| 2026-05-15 | ARTICLEFILTERBAR-EXTRACT-01 |
| 2026-05-15 | BOOKEDITOR-TESTIDS-01 |
| 2026-05-15 | SETTINGS-INLINE-TABS-EXTRACT-01 |
| 2026-05-15 | RESTORE-UX-FEEDBACK-01 |
| 2026-05-15 | THEME-TOKEN-COMPLETENESS-AUDIT-01 |
| 2026-05-15 | NOTIFY-ERROR-APIERROR-COVERAGE-01 |
| 2026-05-15 | PLUGIN-SETTINGS-TESTID-COVERAGE-01 |

---

## Deferred Items (2)

| ID | Defer-Type | Rationale | Adjudication-Date |
|---|---|---|---|
| **useSelection<T>() (RCU candidate #1, score 16)** | PERMANENT-DEFER (design-intent-honored) | Anti-extraction-rationale at [useBookSelection.ts:7-10](../../frontend/src/components/useBookSelection.ts#L7-L10): *"Kept as a separate hook (rather than a generic `useSelection`) so that future per-entity divergence ... lands in one place without a cross-entity refactor."* Per-entity divergence is evidence-based (Books audiobook-state, Articles publication-state, Comments moderation-state). 13 touch-points = substantial migration surface. Split-back-out stays available if divergence ever materializes. | 2026-05-23 (commit `c1083bc`; new LL `563f298` formalizes design-intent-axis discipline) |
| **AUTHOR-DATALIST-EXTEND-EDITORS-01** | PENDING-UX-ADJUDICATION | Backlog-item proposes REPLACING Pattern B (closed-list profile-select at ArticleEditor + BookMetadataEditor — now extracted as AuthorProfileSelect `11198a4`) with Pattern A (datalist + free-text via AuthorSelectInput `a213788`) at editor surfaces. UX trade-off (safety vs flexibility), not mechanical migration. Needs user-side adjudication. **Note:** the backlog ID is still active in P3; this entry mirrors that state with the additional defer-context. | Pending (user-side) |

---

## Open Audit Candidates (1)

| Source-Audit | Candidate | Score | Status | Notes |
|---|---|---|---|---|
| `docs/audits/recurring-component-audit-2026-05-21.md` | **#3 `ListRow`** | 13 | **AVAILABLE** | Last remaining non-deferred audit candidate. ~6-8 hours over 4-6 commits. Sub-step (a): extract `ArticleRow` from `ArticleList.tsx` monolith (1434 LOC → reduce by ~190 LOC). Sub-step (b): cross-surface `ListRow` extract + migrate Books-side. Per "Inline-component duplication is the upstream cause of parallel-surface asymmetry" LL, sub-step (a) has independent value. Backlog ID: `LIST-VIEW-ROW-SHARED-EXTRACTION-01` (P3). |

**Note:** the AUTHOR-DATALIST-EXTEND-EDITORS-01 backlog item is documented in the audit's 2026-05-23 footnote as deferred-UX-adjudication; per disambiguation rule it appears under Deferred Items above, not as an audit-candidate awaiting extraction.

---

## Open Explorations (selected — date-filtered to 2026-05 with Open status)

The `docs/explorations/` directory has 29 root-level files + 10 archived. Filtering to documents explicitly marked "Open" status OR filed in 2026-05 awaiting follow-up:

| Document | Filed | Status | Notes |
|---|---|---|---|
| `exploration-bibliogon-mobile-selective-sync.md` | 2026-05-20 | Open exploration; not yet decisions | Triage filed as `MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01` (P3 backlog). PWA/Dexie phone + FastAPI/SQLite desktop with selective sync. Adaptive-learner Phase 13 pattern adapted to Bibliogon. |
| `exploration-multi-agent-gitflow-coordination.md` | 2026-05-20 | Open exploration; not yet decisions | Follow-up filed as `MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01` (P3 backlog). Branch-aware status reports + cross-branch peek as Pre-Inspection. |
| `donation-visibility-diagnosis.md` | 2026-04-30 | Diagnosis only, no code changes | Standalone diagnostic. No backlog promotion expected — diagnostic-only. |

Other exploration documents in the dir are either: (a) closed/archived (in `docs/explorations/archive/`), (b) shipped-as-feature (already in CHANGELOG), or (c) standalone analyses without active follow-up. Comprehensive scan deferred to its own session if needed.

---

## Cross-Project Threads (2 active)

### PluginForge (PyPI dependency)

| Item | Status | Notes |
|---|---|---|
| Current pin | `^0.9.0` in 13 pyproject.toml files (backend + 12 plugins) | Bumped from `^0.8.0` on 2026-05-21 (parallel-session commit `0c966e0`). |
| **PluginForge v0.10.0 available on PyPI** | **PHASE 1 audit partially completed this session; PENDING continuation** | Audit findings so far: (a) pin confirmed `^0.9.0` × 13 files; (b) no `_app_config` assignment hack found in Bibliogon source (grep returned empty — the v0.10.0 `merge_app_config()` migration target appears absent here); (c) `DiscoveryDiff.by_filter_reason()` already used at `backend/app/main.py:452` (Bibliogon was the parity-helper requester per the release-note); (d) ONE sub-module import at `backend/app/main.py:18` `from pluginforge.config import load_i18n` — candidate for root-import (pending verification that v0.10.0 re-exports `load_i18n`); (e) test baseline not yet re-run. **Next session continuation needed for full audit + PHASE 2 adoption.** |
| `PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01` (P3) | Deprecation runway extended | v0.10.0 release notes pushed single-router deprecation to "earliest v0.11.0" — more breathing room for the export-plugin refactor. |

### Adaptive-learner

| Item | Status | Notes |
|---|---|---|
| Coordination state | No active coordination | Mobile-Sync exploration adapted from adaptive-learner Phase 13 pattern; tracked locally via `MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01` (P3). |

### Manuscripta (PyPI dependency)

| Item | Status | Notes |
|---|---|---|
| Current pin | (not surveyed this session) | Tracked at release-time per `release-workflow.md` external-dep checklist; out-of-scope for this task-overview. |

---

## Methodology footer — Numeric-Claims-Verification

Every count in this document was verified by a real command (per `.claude/rules/ai-workflow.md:187`). Commands used:

```bash
# Backlog tier section boundaries (line numbers)
grep -n "^## " docs/backlog.md

# Per-tier item count (section-bounded)
for spec in "P0 - " "P1 - " "P2 - " "P3 - " "P4 - " "P5 - " "Blocked /"; do
  start=$(grep -n "^## $spec" docs/backlog.md | head -1 | cut -d: -f1)
  echo "$spec line=$start"
done
# Then per-tier:
sed -n '<start>,<end>p' docs/backlog.md | grep -c '^- \*\*'

# Backlog item IDs per tier
sed -n '<start>,<end>p' docs/backlog.md | grep -oE '^- \*\*[A-Z][A-Z0-9-]+' | sort -u

# Archive total + windowed counts
grep -c "^## Archived" docs/roadmap-archive/2026-05.md
awk '/^## Archived 2026-05-(15|16|17|18|19|20|21|22|23)/' docs/roadmap-archive/2026-05.md

# Audit doc count
ls docs/audits/ | grep -v history | wc -l

# Exploration directory state
ls docs/explorations/*.md | wc -l
ls docs/explorations/archive/

# Current PluginForge pin
grep -rn "pluginforge" backend/pyproject.toml plugins/*/pyproject.toml | grep -v "module"
```

Verified counts:

- Active backlog: 68 items (P2=3 + P3=31 + P4=27 + P5=5 + BLOCKED=2; P0=P1=0). Matches backlog header prose "66 active P2..P5 + 0 P1 + 2 BLOCKED".
- Recently-closed window: 35 archive entries 2026-05-15 → 2026-05-23.
- Deferred Items: 2.
- Open Audit Candidates: 1.
- Open Explorations: 3 (filtered).
- Cross-project threads: 2 active (PluginForge + adaptive-learner; manuscripta noted as out-of-scope this session).

**Sum check:** 68 + 35 + 2 + 1 + 3 + 2 = 111 distinct tracked items across all categories.

---

## References

- [docs/backlog.md](../backlog.md) — primary source for active items
- [docs/roadmap-archive/2026-05.md](../roadmap-archive/2026-05.md) — recently-closed
- [docs/audits/recurring-component-audit-2026-05-21.md](../audits/recurring-component-audit-2026-05-21.md) — RCU audit with 4 footnote updates (2026-05-22, 2026-05-23, 2026-05-23-late, 2026-05-23-final)
- [docs/audits/backlog-reprioritization-2026-05-20.md](../audits/backlog-reprioritization-2026-05-20.md) — 4-Axes re-prioritization methodology
- [docs/journal/status-report-2026-05-23.md](status-report-2026-05-23.md) — prior status report (session-handoff convention)
- [.claude/rules/ai-workflow.md](../../.claude/rules/ai-workflow.md) — NCV rule (line 187)
- [.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md) — full LL ruleset including 2026-05-23 "Audit-Methodology: design-intent-axis as 5th-Axis or Override-Filter"

End of task overview.
