# Explorations

Future ideas that are neither decided yet nor concrete work items.

Different from adjacent directories:
- ROADMAP: "we will do this, question is when"
- decisions/ (ADRs): "we decided this, here is why"
- journal/: "here is what happened in session X"
- explorations/: "we could do this, question is whether it makes sense"

Each exploration document follows this rough structure:
- Context: what problem are we considering
- Options evaluated with pros and cons
- Recommendation path (if any)
- Open questions
- Triggers for reconsidering

Exploration documents can transition to:
- ROADMAP items (when we commit to doing them)
- ADRs (when we decide against them with rationale)
- Implementation tickets (when we start work)
- Archive (when they become irrelevant)

---

## Tracking table

Last reviewed: 2026-06-17 (task-status audit against `develop`, v0.54.0)

The **Done / Open** column reflects how many of a doc's concrete tasks/phases are implemented on `develop`, verified by code grep + closed GitHub issues. Value column reflects a subjective ROI judgement (user impact × adoption gain ÷ effort). Not a commitment.

| Doc | Done / Open | Status | Trigger to act |
|---|---|---|---|
| [children-book-plugin.md](children-book-plugin.md) | ~6.5 / 0.5 | **Erledigt** — shipped as `plugin-kinderbuch` (Sessions 2-6: page editor, layouts, PDF/EPUB3, page-count warn). Residual: onboarding/help polish (Session 7). | Onboarding/help polish only. |
| [exploration-features-2026-05-15.md](exploration-features-2026-05-15.md) | ~7 / 3 | **Teilweise** — #1/#3/#4/#8/#9 shipped, #6 KDP-wizard partial, #2/#5/#10 partial, #7 multi-lang open. | Per-feature triggers (see doc). |
| [comic-foundation.md](comic-foundation.md) | ~2.5 / 0.5 | **Teilweise** — `plugin-comics` shipped (Sessions 0-2: panels + multi-bubble + drag). Open: motion-lines, sound-FX, RTL panel order, mobile UX. | File remaining polish as backlog. |
| [exploration-bibliogon-mobile-selective-sync.md](exploration-bibliogon-mobile-selective-sync.md) | 4 / 2 | **Teilweise** — Phase 1 (LAN), Phase A (PWA), Phase 3 (offline + sync engine) shipped. Open: Phase C (selection/"Phone Library" UI), Phase D (dedicated sync backend + conflict surface). | Phase C/D scope decision. |
| [EXP-002-user-event-recording.md](EXP-002-user-event-recording.md) | 4 / 2 | **Teilweise** — EVT-01..04 shipped (RingBuffer, Dexie persist, proactive Settings entry, JSON export). Open: EVT-05 (category/appState axis, M), EVT-06 (feature-strategy registration, S). | Demand for category taxonomy or feature-gate. |
| [article-authoring.md](article-authoring.md) | ~1 / 2 | **Teilweise** — Article entity + editor + Medium import + Article→Book shipped. Open: publication-dispatch automation, per-platform status, promo posts. | Cross-posting friction; validation data. |
| [mobile-strategy.md](mobile-strategy.md) | 1 / 3 | **Teilweise** — Phase 1 (responsive PWA) shipped. Phase 2-4 open. Recommendation doc; overlaps mobile-selective-sync. | User triage of mobile ROI. |
| [desktop-packaging.md](desktop-packaging.md) | Launcher done | **Teilweise** — Simple Launcher (D-01/02/03) shipped Win/macOS/Linux. Tauri/Electron deferred by design. | 100+ users AND 10%+ feedback cites install friction. |
| [dependency-strategy.md](dependency-strategy.md) | 7 / 1 | **Living doc** — refreshed 2026-06-17 (DEP-02 + DEP-09 marked done; community pins unpinned). Only DEP-05 (elevenlabs SDK) genuinely deferred. | Quarterly cadence or major-bump session. |
| [exploration-multi-agent-gitflow-coordination.md](exploration-multi-agent-gitflow-coordination.md) | 1 / 5 | **Offen** — gitflow pattern is practiced; 6 formalization decisions pending user adjudication. No code. | Aster triages the 6 decisions. |
| [i18n-strategy.md](i18n-strategy.md) | 0 / 11 | **Offen** — still 8 catalogs; no new languages, zero RTL infra. I18N-10 (QA pipeline) partial. | Hindi demand signal OR community PR; prep RTL before Arabic. |
| [monetization.md](monetization.md) | deferred | **Offen** — donations-only; licensing infra dormant (`LICENSING_ENABLED = False`). | User base outgrows donations. |
| [multi-user-saas.md](multi-user-saas.md) | deferred | **Offen** — single-user/offline-first held; no auth/tenant work. Contradicts current positioning. | 5000+ users AND funding independent of SaaS. |

Archived explorations (shipped or historical) live in [archive/](archive/). Newly archived (2026-06-17): `core-import-orchestrator.md` (CIO-01..05 all shipped), `plugin-git-sync.md` (PGS-01..05 all shipped), `tiptap-3-migration.md` (DEP-02 obsolete — TipTap 3.26.0 shipped v0.49.0). Prior cleanup sweep (2026-05-23): `article-editor-parity.md`, `articles-dashboard-parity-audit.md`, `backup-articles-audit.md`, `backup-articles-debug.md`, `donation-visibility-diagnosis.md`, `inline-styles-audit.md` (T-01), `installer-discovery-report.md` + `prompt-installer-discovery.md` (D-05 closed won't-fix), `optimization-report-2026-04-28.md`, `prompt-ux-convention-document.md` (yielded `docs/ux-conventions.md`), `secrets-refactor-audit.md`, `trash-card-parity-audit.md`, `trash-card-permanent-delete-recheck.md`, `trash-parity-audit.md`. Earlier: `ai-review-extension.md` (shipped v0.20.0), `git-based-backup.md` (shipped v0.21.0).

---

## Professional opinion: what to act on next

The 2026-06-17 audit found that **most of the previously "act-on-trigger" explorations have already shipped** — plugin-git-sync (all 5 phases), the core import orchestrator (CIO-01..05), TipTap 3, the children's-book plugin (as plugin-kinderbuch), the comics foundation (plugin-comics), and the majority of the 2026-05-15 feature batch. The live exploration set is now dominated by maturation tails and strategic deferrals, not greenfield work.

**Housekeeping (done in this pass):** the three fully-shipped docs (core-import-orchestrator, plugin-git-sync, tiptap-3-migration) moved to [archive/](archive/); `dependency-strategy.md` refreshed (DEP-02 + DEP-09 marked done, community-extension pins unpinned); `children-book-plugin.md`'s stale "deferred" framing removed.

**Highest-value open work with a clear path:**
- **EXP-002 EVT-05 + EVT-06** — the error-report base shipped (RingBuffer, Dexie persist, Settings entry, JSON export). The two open tasks are small/medium and self-contained: a category/appState axis (M) and a feature-strategy registration (S).
- **Mobile selective-sync Phase C/D** — the hard part (LAN + offline + sync engine) is live. What's missing is the user-facing selection surface ("Phone Library" view) and a Settings-level sync/conflict status. Most leverage if mobile is a priority, but it needs an explicit scope decision (and the sync-as-plugin-vs-core question, D1, is still open).

**Lower tiers (trigger-gated, stay deferred):**
- **Article Authoring** publication/promo scope — the entity + editor shipped; publication-dispatch automation waits on cross-posting validation data.
- **i18n expansion (EXP-001)** — zero of 11 tasks done; Hindi (LTR, no RTL blocker) is the cleanest first move, with RTL infra as the prerequisite for Arabic.
- **Multi-Agent gitflow coordination** — process doc, 6 decisions awaiting Aster's adjudication; no code blocker.
- **Desktop Packaging (Tauri)** — launcher already covers all three OSes; only act if install-friction feedback materializes.
- **Monetization / Multi-User SaaS** — donations cover the current phase; SaaS contradicts the local-first positioning. Revisit only on the documented user-base triggers.

---

## Legend

- **Status** — current lifecycle state of the doc itself.
- **Effort** — rough session count estimate for full implementation, using "session" as the working unit (equivalent to a focused half-day with clear start and stop).
- **Value** — subjective ROI tier:
  - **A:** highest value; act on next
  - **B:** valuable, act on trigger
  - **C:** deferred with clear triggers
  - **D:** contradicts current positioning; long-term at best
- **Trigger to act** — specific measurable signal that would justify moving from exploration to implementation.
