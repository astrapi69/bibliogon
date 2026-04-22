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

Last reviewed: 2026-04-22

Value column reflects a subjective ROI judgement (user impact × adoption gain ÷ effort). Not a commitment.

| Doc | Status | Effort | Value | Trigger to act |
|---|---|---|---|---|
| [plugin-git-sync.md](plugin-git-sync.md) | Exploration complete, phases planned | 5 phases, ~50-75h total | B | Real import need for a write-book-template repo (Phase 1). |
| [desktop-packaging.md](desktop-packaging.md) | Launcher shipped (D-01..04); Tauri path undecided | 3-5 sessions (Tauri path) | B | 100+ active users AND 10%+ feedback cites install friction. |
| [article-authoring.md](article-authoring.md) | Exploration, no architecture committed | TBD | B | Cross-posting friction increases; validation data collected. |
| [tiptap-3-migration.md](tiptap-3-migration.md) | Pre-audit complete, blocked on upstream | 4-8h code + 1-2h regression | B | search-and-replace extension v0.2.0 published to npm (or fallback path activated). |
| [children-book-plugin.md](children-book-plugin.md) | Architecture decided, deferred | 7 sessions | C | 3+ user requests OR Aster starts a new picture book OR paid commission. |
| [monetization.md](monetization.md) | Deferred (donations-only today) | N/A (strategic) | C | User base grows past where donations cover costs. |
| [dependency-strategy.md](dependency-strategy.md) | Active maintenance doc | Quarterly review | C (meta) | Quarterly cadence or major-bump session. |
| [multi-user-saas.md](multi-user-saas.md) | Long-term, not committed | 30+ sessions | D (lowest) | 5000+ active users AND funding model independent of SaaS subscription. |

Archived explorations (shipped or historical) have moved to [archive/](archive/). Recent additions to the archive: `ai-review-extension.md` (shipped v0.20.0) and `git-based-backup.md` (shipped v0.21.0).

---

## Professional opinion: what to act on next

The two A/B-tier recommendations from the previous review (AI Review Extension, Git-based backup) have both shipped (v0.20.0, v0.21.0) and moved to [archive/](archive/). The tracking table has been rebalanced.

**Highest tier today: plugin-git-sync Phase 1.** Exploration complete, first plugin-to-plugin dependency in the catalog. Acts on a concrete need (imported write-book-template repos) and stress-tests PluginForge for future plugin work. Estimated 12-18h for the import-only MVP.

**Second tier: Desktop Packaging (Tauri path)**, conditional on a demand signal. The launcher binary from v0.17.0 already covers Windows / macOS / Linux. A Tauri-based redistribution would be a significant adoption move, but only once Docker friction is quantified through user feedback. Do not preemptively build it.

**Third tier: TipTap 3 migration**, blocked on upstream `@sereneinserenade/tiptap-search-and-replace` v0.2.0 publishing to npm. Pre-audit done; fallback path identified (`prosemirror-search` adapter, ~50-80 LOC). Estimated 4-8h code once unblocked.

**Fourth tier (speculative): Article Authoring.** Personal pain point (cross-posting workflow) combined with a clean narrative ("the tool I use to write about the tool"). Validation data needed before architecture work.

**Deferrals that should stay deferred:**
- Children's Book Plugin: 7 sessions for a niche where Aster already has a JS/TS toolchain. The architecture document is the shipped value for now. Revival criteria are clear and the pre-work is frozen, which is exactly the right state.
- Multi-User SaaS: actively contradicts the local-first positioning the product is built on. Only revisit at 5000+ users, and even then a federated or device-sync model is a better fit than centralized SaaS.
- Monetization: donations cover the current phase. Revisit when the funding gap is real, not speculative.

**Cleanup status:** shipped explorations archived (AI Review Extension, Git-based backup). Live set contains only undecided or pending-trigger items.

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
