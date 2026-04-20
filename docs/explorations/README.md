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

Last reviewed: 2026-04-20

Value column reflects a subjective ROI judgement (user impact × adoption gain ÷ effort). Not a commitment.

| Doc | Status | Effort | Value | Trigger to act |
|---|---|---|---|---|
| [ai-review-extension.md](ai-review-extension.md) | Architecture decided | 1-2 sessions | **A (highest)** | Any session slot. Ready to implement. |
| [desktop-packaging.md](desktop-packaging.md) | Exploration, undecided | 3-5 sessions (Tauri path) | B | 100+ active users AND 10%+ feedback cites install friction. |
| [prompt-article-authoring-exploration.md](prompt-article-authoring-exploration.md) | Prompt only, doc pending | <1 session to draft doc | B | Aster's manual cross-posting friction increases; validation data collected. |
| [children-book-plugin.md](children-book-plugin.md) | Architecture decided, deferred | 7 sessions | C | 3+ user requests OR Aster starts a new picture book OR paid commission. |
| [monetization.md](monetization.md) | Deferred (donations-only today) | N/A (strategic) | C | User base grows past where donations cover costs. |
| [dependency-strategy.md](dependency-strategy.md) | Active maintenance doc | Quarterly review | C (meta) | Quarterly cadence or major-bump session. |
| [multi-user-saas.md](multi-user-saas.md) | Long-term, not committed | 30+ sessions | D (lowest) | 5000+ active users AND funding model independent of SaaS subscription. |

Archived explorations (shipped or historical) have moved to [archive/](archive/).

---

## Professional opinion: what to act on next

**Clear recommendation: AI Review Extension.**

It wins on every axis that matters for a solo-dev project in this phase:

1. **Smallest scope with decided architecture.** 1-2 sessions. No open questions. Backend extensions reuse existing `job_store`, `llm_client`, the marketing-path language map, and the async-with-SSE pattern documented in `lessons-learned.md`. Frontend reuses the existing AI panel.

2. **Extends a shipped feature rather than building a new one.** Every existing user benefits on day one. Not a niche segment, not a new user acquisition bet.

3. **Delivers a persistent artefact.** Today's review returns inline JSON and vanishes when the panel closes. The extension writes Markdown reports the author can re-open, version, export, or edit. That turns a throwaway interaction into a real tool.

4. **Matches the Medium-article positioning.** The article argues Bibliogon is an authoring tool that respects data sovereignty and makes AI transparent. Persisted reports with `ai-assisted: true` metadata on files you own is that thesis made concrete.

5. **Low risk.** No new dependencies, no schema migrations, no new plugin packages. Existing tests extend naturally.

**Second-highest: Desktop Packaging**, conditional on a demand signal. The launcher binary shipped in v0.17.0 already covers Windows / macOS / Linux. A Tauri-based redistribution would be a significant adoption move, but only once Docker friction is quantified through user feedback. Do not preemptively build it.

**Third (speculative): Article Authoring.** This is earlier in the lifecycle than the other two. The current prompt file has not been expanded into a proper exploration document. Personal pain point (Aster's cross-posting workflow) combined with a clean narrative ("the tool I use to write about the tool") makes the idea worth expanding into a real exploration doc before any architecture work. Cheap to evaluate, high optionality.

**Deferrals that should stay deferred:**
- Children's Book Plugin: 7 sessions for a niche where Aster already has a JS/TS toolchain. The architecture document is the shipped value for now. Revival criteria are clear and the pre-work is frozen, which is exactly the right state.
- Multi-User SaaS: actively contradicts the local-first positioning the product is built on. Only revisit at 5000+ users, and even then a federated or device-sync model is a better fit than centralized SaaS.
- Monetization: donations cover the current phase. Revisit when the funding gap is real, not speculative.

**Cleanup status:** donations docs and the children-book prompt have been moved to [archive/](archive/). `prompt-article-authoring-exploration.md` stays in the live set until its target exploration doc is drafted.

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
