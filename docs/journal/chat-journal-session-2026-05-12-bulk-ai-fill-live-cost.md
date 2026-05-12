# Session journal - 2026-05-12 - BULK-AI-FILL-LIVE-COST-01

Single-task session promoting the UNIVERSAL-AI-TEMPLATE-02 Session 2
follow-up from P5 to active work.

## Context

Session 2 (commits 026674a..86ffa45) shipped the bulk AI-fill UI with
a pre-flight cost estimate dialog and a running totals strip (items
/ updated / tokens / cost) in the dock + modal. The cost total was
authoritative-after-completion: each `item_done` event folded its
per-item cost into the running sum, but there was no live "this run
is on pace to cost ~$X" surface during the running phase. Session 2
filed `BULK-AI-FILL-LIVE-COST-01` under P5 with a 10+ items
"noise threshold" caveat. This session promoted it.

## 1. Survey + design ({short})

- Original prompt: `proceed with BULK-AI-FILL-LIVE-COST-01`
- Optimized prompt: would be identical; the backlog entry is the
  spec.
- Goal: live projection during a running job so the user can cancel
  mid-batch if the live burn rate disagrees with the pre-flight
  estimate.
- Result: read the BulkAiFillJobContext, dock, and modal; located
  the cost-sum logic at `item_done`; confirmed the projection is a
  pure derived value from existing state (no new SSE event needed,
  no backend changes). Decision documented in archive: ship the
  projection unconditionally with `~` prefix + "projected" word,
  not a 10+ items hidden gate — gating would hide the most useful
  early-warning signal during exactly the phase the user is most
  likely to cancel.

## 2. Context extension

- Goal: expose `pricedCompletedCount`, `costPerItemUsd`,
  `projectedTotalCostUsd` from `BulkAiFillJobContext`.
- Result: `pricedCompletedCount` state (incremented only when
  `item_done` has `cost_usd != null`); two `useMemo` derivations
  for the per-item average and the total projection. Projection
  returns null outside the `running` phase (terminal phases show
  the authoritative final `totalCostUsd`) and when `total <= 0`
  (avoid Infinity from an `item_done` arriving before `start`).
- Commit: pending squash with the dock + i18n + tests + docs.

## 3. Dock + modal updates

- Goal: surface the projection in both the minimized dock badge and
  the expanded modal.
- Result: dock badge gains a small "~$X projected" caption between
  the progress bar and the current-title line, hidden when not
  running or when projection is null. Modal totals strip gains two
  new pills (Per item / Projected) under the same gate. All three
  surfaces (dock caption + both pills) carry distinct `data-testid`
  values for regression pinning.

## 4. i18n × 8 locales

- Goal: parity-clean addition of 3 new keys
  (`ui.bulk_ai_fill.dock.projected`,
  `ui.bulk_ai_fill.modal.per_item_label`,
  `ui.bulk_ai_fill.modal.projected_label`).
- Result: native German (`Pro Eintrag:`, `Prognose:`,
  `~{cost} prognostiziert`) + native English. The six
  auto-translated locales (el/es/fr/ja/pt/tr) carry the English
  literals consistent with how the existing dock + modal block was
  authored. Backend `test_i18n_parity.py` + `test_i18n_structure.py`
  green.

## 5. Tests

- Goal: pin the projection math + visibility gates so future
  refactors don't silently break the surface.
- Result: +5 context tests (initial null state before any priced
  response, average + projection math across two priced items,
  null-cost items excluded from priced average, projection nulled
  on terminal phase, projection null when `total == 0`); +2 dock
  tests (caption visible after first priced `item_done`, pills
  removed on terminal transition). Total: +7 frontend tests.

## 6. Full suite verification

- `make test`: 1550 backend (unchanged; feature is frontend-only)
  + 889 frontend (was 882, +7), 1 skipped, 47 warnings (existing
  httpx DeprecationWarning, not new). 121.96s.
- `npx tsc --noEmit`: clean.

## 7. Documentation + archive

- `docs/CHANGELOG.md`: new `[Unreleased] > Added` entry at the top.
- `docs/backlog.md`: removed the BULK-AI-FILL-LIVE-COST-01 entry
  from P5, updated the open-tasks counter (17 → 16) and the
  "Last updated" line.
- `docs/roadmap-archive/2026-05.md`: new "Archived 2026-05-12
  (BULK-AI-FILL-LIVE-COST-01)" section above the Session 2 entry.
  Includes the design rationale for shipping the projection
  unconditionally rather than gating on a 10+ items threshold.

## Summary

- 1 commit, frontend-only
- Backend tests: 1550 (unchanged)
- Frontend tests: 882 → 889 (+7)
- i18n: 3 new keys across 8 locales (parity green)
- One P5 follow-up closed; the Session 1 follow-up
  `AI-FILL-CAP-CONFIG-01` (P5) stays filed.

## Questions and assumptions

- Assumption: shipping the projection unconditionally beats gating
  it on a 10+ items threshold. Basis: the gate would hide useful
  early-warning signal during exactly the phase the user is most
  likely to want to cancel. The `~` prefix + "projected" word
  communicate that the value is an approximation. Recorded in the
  archive entry as the design rationale.
- Assumption: the auto-translated locales (el/es/fr/ja/pt/tr) carry
  the English literals consistent with the rest of the
  `ui.bulk_ai_fill.dock` and `ui.bulk_ai_fill.modal` block, which
  Session 2 authored the same way. Basis: spot-check of those six
  files showed every dock + modal label is already English; the
  parity test would flag any drift.
