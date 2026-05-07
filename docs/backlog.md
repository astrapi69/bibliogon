# Bibliogon Backlog

Last updated: 2026-05-07 (post-v0.29.0 docs+i18n sweep: docs drift refresh, README-de umlaut conversion, 4 new help pages (books bulk-export, cross-platform installers, architecture, contributing, deployment, API reference) + plugin dev guide refresh, launcher i18n expanded from 2 to 8 languages with full parity tests)
Current version: v0.29.0
Open tasks: 9 active (P3..P5) + 2 BLOCKED-on-upstream pointers
Archive: [docs/roadmap-archive/backlog-recently-closed-2026-05-02.md](roadmap-archive/backlog-recently-closed-2026-05-02.md)

Living backlog. Daily-planning view of ROADMAP work. ROADMAP stays
the canonical theme tracker; this file is forward-looking only.

This file lists ONLY open tasks. Closed tasks live in the archive
files; do not re-add closed entries here. If a closed task needs
to come back, create a new ID.

Tasks are sorted by priority tier (P0 most urgent, P5 most
speculative). BLOCKED-on-upstream pointers + non-task waiting
items live in their own section between P5 and the archive link.
Within each tier, smaller-scope and unblocking items come first,
with alphabetical-by-ID as final tiebreaker.

The 5 entries in "ROADMAP cross-reference" below are pointers to
ROADMAP entries; their canonical description lives there. The
backlog is a working list of pointers, not a duplicate definition
store.

---

## ROADMAP cross-reference (curated planning view)

- **AR-01 validation log** — see ROADMAP > P3.
- **DEP-02** (TipTap 3) — see ROADMAP > Blocked / Upstream Wait.
- **DEP-05** (elevenlabs 2.x) — see ROADMAP > Blocked / Upstream Wait.

---

## P0 - Deadline / Blocker / Security

(none)

---

## P1 - Architecture / Hygiene Debt

(none)

---

## P2 - High-Value User Features

(none)

---

## P3 - Infrastructure / Quality

- **DEP-DBPATH-01**: `BIBLIOGON_DB_PATH` deprecation cycle.
  Steps 1 (deprecation warning, v0.27.0) and 2 (precedence flip,
  v0.28.0) are archived. Step 3 (remove `BIBLIOGON_DB_PATH`
  override entirely) trigger: one release after v0.28.0 ships
  (so v0.29.0 earliest).

- **D-06-VALIDATION-01**: fresh-machine validation of the
  v0.28.0 cross-platform installer scripts (`install.command`,
  `install.ps1`, `install.cmd`). The scripts shipped unsigned
  per launch decision and were not exercised on a fresh macOS
  user account or fresh Windows 11 install before tagging.
  Trigger: first user report OR access to a clean test machine.
  Effort: S (run each wrapper, capture any Gatekeeper /
  SmartScreen / ExecutionPolicy edge cases). Folds into the
  next point release.

- **PGS-05-FU-01**: real-world unified-commit failure-mode tuning
  (only one of two subsystems active, partial-failure UX). Effort
  S; trigger by user report.

- **AR-BULK-SERIES-HIERARCHY-01**: parent/child series for the
  bulk-export filter. The 2026-05-06 bulk-export ship landed
  series as a flat free-string field on Article (mirrors
  `Book.series`). Hierarchical series ("Cosmos > Astrophysics >
  Stars") was deferred because no user has asked for it and a
  Series model + M2M migration is a multi-session investment.
  Trigger: first concrete user request for sub-series. Effort:
  1-2 sessions for the model + migration + filter UI nesting.
  See `docs/help/{en,de}/articles/bulk-export.md` "Series" note.

- **I18N-DIACRITICS-01**: auto-translated non-DE i18n YAMLs (es,
  pt, tr, possibly fr) ship with inconsistent diacritic coverage —
  some entries use proper Unicode (`géneros`, `Décroissant`,
  `gêneros`), others ASCII-substitute (`Titulo`, `Baslik`). Found
  in Test Phase Session 3 (2026-04-28) cross-language audit while
  fixing DE umlauts. Severity: Medium (readable but inconsistent +
  non-native). Effort: M per language. Cause: `AUTO_TRANSLATED.md`
  banner in `backend/config/i18n/` indicates DeepL/LMStudio passes
  with mixed quality. Fix: re-run translation with current DE
  source as canonical (DE was just cleaned up of all ASCII
  substitutes), human-review each for native diacritic use. Defer
  until DE i18n stable + a native speaker is available per
  language for review.

---

## P4 - Roadmap / Future Phases

- **D-07**: Phase 2 follow-up — package-manager discoverability.
  After D-06 ships, submit a winget manifest to
  `microsoft/winget-pkgs` and create a Homebrew tap at
  `astrapi69/homebrew-bibliogon`. Effort: ~2 hours of
  implementation, plus reviewer latency (winget-pkgs PR review
  can take days to weeks; do NOT couple to D-06 release timing).
  Trigger: D-06 shipped + first real user feedback to confirm
  the wrappers actually work in the wild. Per discovery report,
  this expands discovery surface meaningfully without changing
  the underlying install path. See
  [docs/explorations/installer-discovery-report.md](explorations/installer-discovery-report.md).

- **AR-BULK-CROSSPAGE-SELECT-01**: cross-page Select-all for the
  bulk-export workflow. Articles dashboard does not paginate
  today, so "Select all = current page" is moot. When pagination
  lands (or articles count grows past comfortable scroll), Select-
  all needs to either select every filtered row across pages or
  surface an "X of N visible; select all N?" affordance. Effort:
  S once pagination exists. Trigger: pagination landing OR article
  counts complaint.

- **LAUNCHER-SELFREPLACE-01**: launcher binary self-replace.
  Currently the pre-install stale-target safeguard tells the
  user "download a newer launcher manually" and opens the
  GitHub release page. A real self-replace mechanism (download
  new binary, atomic replace, relaunch) would close that loop.
  Windows non-trivial: a running binary cannot replace itself
  directly; needs a helper script (e.g. spawn a `cmd.exe`
  background that waits for parent exit, copies new binary
  over old, relaunches). Linux/macOS simpler (`rename` + exec).
  Effort: 1-2 sessions. Defer: no concrete user demand and
  current safeguard already protects against installing a
  stale Bibliogon.

(D-05 closed as won't-fix 2026-05-05; archived in
[docs/roadmap-archive/2026-05.md](roadmap-archive/2026-05.md).)

---

## P5 - Speculative / Nice-to-have

- **AR-BULK-ASYNC-PROGRESS-01**: async bulk export with progress
  UI for selections >50 articles. The 2026-05-06 ship runs the
  request synchronously with a 180s server-side Pandoc timeout,
  which is fine for the typical workflow (<50 articles). For
  larger combined PDF runs the user sees a frozen browser tab
  until completion. Future work: convert to the async-job pattern
  used by audiobook export (background worker + SSE progress
  stream + persisted artifact). Effort: 1-2 sessions. Trigger:
  first user report of perceived hang, OR a real-world selection
  that exceeds 180s.

- **D-02 follow-ups**: macOS Intel universal2 build + code signing.
  Effort: M each. Deferred until user demand.

- **LAUNCHER-I18N-NATIVE-REVIEW-01**: native-speaker review for
  the three pending-review launcher i18n catalogs (pt, tr, ja)
  shipped in v0.30.0. Each catalog carries a
  `_meta.review_status: "pending native speaker"` block;
  `launcher/bibliogon_launcher/locales/REVIEW_STATUS.md`
  documents the per-language status and the PR-based
  correction submission flow. The
  `test_pending_review_catalogs_carry_marker` parity test
  enforces the marker contract, and `test_user_validated_*`
  enforces that markers are removed in the same change that
  promotes a language to validated. Trigger: native-speaker
  contact for any of pt/tr/ja, or a user-reported correction
  PR. Effort: S per language for an experienced reviewer
  (95 keys, mostly mechanical drift detection).

---

## Blocked / Upstream Wait

Items waiting on external triggers. Re-audit monthly via
`make check-blockers`. Do not attempt to advance these without an
unblock signal. ROADMAP entries (DEP-02, DEP-05, DEP-09, SEC-01)
are listed in the cross-reference at the top of this file; the
table below covers backlog-only waiting items + a quick-poll
summary.

| Item | Blocked on | Unblock condition |
|------|-----------|-------------------|
| DEP-02 (TipTap 3) | Upstream npm publish of `@sereneinserenade/tiptap-search-and-replace@0.2.0` | npm publish (default); path B (`prosemirror-search` adapter ~50-80 LOC) available on explicit go-ahead |
| DEP-05 (elevenlabs 2.x) | Real paid-API verification (substantial 0.2.27 -> 2.45.0 jump, careful audit required) | Schedule a dedicated audiobook test session with a live ElevenLabs key |
| PGS-04-FU-01 | First user report of cross-language structural divergence | User report |
| Manual launcher smoke tests (#2/#3/#4) | Real hardware (Windows / macOS / Linux) availability | Hardware access |
| Manual content-safety smoke (#8 Part 2 beforeunload) | Aster's local browser | Manual run |
| Manual UI smoke (#5) | Aster's local browser | Manual run |

---

## Maintenance / hygiene

Recurring upkeep, low priority but worth scheduling:

- **Test count verification** before any release. Run the
  per-plugin iteration from `ai-workflow.md` "Numeric claims
  verification". Don't grep.
- **`poetry show --outdated` + `npm outdated`** before each
  release per release-workflow.md Step 4b.
- **`npm audit --audit-level=high`** monthly (next: 2026-06-02).
- **Help docs review**: every shipped feature must update
  `help.yaml` and the help/{lang}/ pages. Audit on each release.
- **ROADMAP cleanup**: refresh the header line + "next active
  theme" sentence on each release. Move any item shipped outside
  its theme back into the right theme entry.
- **Dependency currency** per `lessons-learned.md`: only stable
  releases, no beta/RC/alpha. 2-week soak for new majors.
- **Systematic audit pass** quarterly (per
  `ai-workflow.md` "Test coverage audits → When to run"). The
  drop-in prompt lives at
  [.claude/prompts/audit.md](../.claude/prompts/audit.md);
  paste into a fresh Claude Code session at the repo root. It
  triages against documented standards in 4 sections (Test
  Validity / Code Quality / Infrastructure / Documentation)
  and is read-only — no code is modified.

---

## How to use this file

- Pick from the highest non-empty tier when starting a session
  and there's no user-driven priority override; consult ROADMAP
  for the canonical task description on cross-referenced items.
- When a session defers a sub-item, add it under the matching
  tier with a `*-FU-NN` ID and one-line "why deferred".
- When an item ships, **delete the row** from this file. The
  CHANGELOG / ROADMAP archive records the history; the backlog
  is forward-looking only.
- When the top tier changes, re-rank explicitly in this file
  before starting work, not implicitly during a session.
- Don't grow past 50 items. If it grows, split by category into
  themed files (`docs/backlog/dependencies.md`, etc.).
