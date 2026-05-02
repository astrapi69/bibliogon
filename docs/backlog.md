# Bibliogon Backlog

Last updated: 2026-05-02 (cleanup pass — 77 closed items archived)
Current version: v0.25.0
Open tasks: 13 active + 4 BLOCKED-on-upstream
Archive: [docs/roadmap-archive/backlog-recently-closed-2026-05-02.md](roadmap-archive/backlog-recently-closed-2026-05-02.md)

Living backlog. Supplements `docs/ROADMAP.md` with deferred items
spawned during sessions and a curated daily-planning view of
ROADMAP work. ROADMAP stays the canonical theme tracker; this
file is the daily-planning view.

This file lists ONLY open tasks. Closed tasks live in the archive
files; do not re-add closed entries here. If a closed task needs
to come back, create a new ID.

---

## Top priorities (curated view)

Most planning links here point at ROADMAP entries; the canonical
description lives there. The backlog is a working list of pointers,
not a duplicate definition store.

- **DEP-02**: TipTap 2 -> 3 migration (BLOCKED). See ROADMAP >
  Maintenance and tech debt > Deferred major dependency upgrades.
- **DEP-05**: elevenlabs SDK 0.2 -> 2.x (BLOCKED on paid-API
  access). See ROADMAP > Maintenance and tech debt > Deferred
  major dependency upgrades.
- **DEP-09**: Vite 7 -> 8 (BLOCKED on vite-plugin-pwa). See ROADMAP
  > Maintenance and tech debt > Deferred major dependency upgrades.
- **SEC-01**: vite-plugin-pwa CVE chain (BLOCKED). See ROADMAP >
  Maintenance and tech debt > Security tracking.
- **AR-01 validation log**: passive task, fills as feature is used
  in anger. See ROADMAP > Article authoring > Open.

---

## All open items by category

### Plugin work

- **PGS-05-FU-01**: real-world unified-commit failure-mode tuning
  (only one of two subsystems active, partial-failure UX). Effort
  S; trigger by user report.

### Core features

- **D-02 follow-ups**: macOS Intel universal2 build + code signing.
  Effort: M each. Deferred until user demand.
- **Launcher localization**: launcher UI is English-only. Effort: S
  per language; defer until user demand.

### Quality / Polish

- **Modal sticky-footer audit beyond wizard**: v0.22.0 covered 13
  dialog modals; the 2026-05-02 follow-up landed
  SaveAsChapterTemplateModal + ConflictResolutionDialog. Confirm
  whether any non-wizard modal still scrolls without sticky
  footer. Effort: S audit + per-modal fix. Status: confirm-or-close.
- **I18N-DIACRITICS-01**: auto-translated non-DE i18n YAMLs (es,
  pt, tr, possibly fr) ship with inconsistent diacritic coverage —
  some entries use proper Unicode (`géneros`, `Décroissant`,
  `gêneros`), others ASCII-substitute (`Titulo`, `Baslik`). Found
  in Test Phase Session 3 (2026-04-28) cross-language audit while
  fixing DE umlauts. Severity: Medium (readable but inconsistent +
  non-native). Effort: M per language. Cause:
  `AUTO_TRANSLATED.md` banner in `backend/config/i18n/` indicates
  DeepL/LMStudio passes with mixed quality. Fix: re-run translation
  with current DE source as canonical (DE was just cleaned up of
  all ASCII substitutes), human-review each for native diacritic
  use. Defer until DE i18n stable + a native speaker is available
  per language for review.

### Documentation

- **DOC-01**: DE translation of `docs/help/en/import/git-adoption.md`
  (CIO-07 follow-up). Effort: S.
- **DOC-02**: ROADMAP header refresh on next release (latest
  release line, last-updated date, "next active theme" line).
  Effort: trivial.

---

## Blocked or waiting

Run `make check-blockers` (or `bash scripts/check-blockers.sh`) to
poll every upstream source in this table at once. The script
prints `[BLOCKED]` / `[UNBLOCKED]` / `[MANUAL]` per item plus a
one-line summary; flip the corresponding row when something turns
green.

| Item | Blocked on | Unblock condition |
|------|-----------|-------------------|
| DEP-02 (TipTap 3) | Upstream npm publish of `@sereneinserenade/tiptap-search-and-replace@0.2.0` | npm publish OR explicit go-ahead for `prosemirror-search` adapter fallback |
| DEP-05 (elevenlabs 2.x) | Real paid-API verification | Schedule a dedicated audiobook test session with a live ElevenLabs key |
| DEP-09 (Vite 8) | `vite-plugin-pwa` peer-dep update | Upstream releases Vite 8 compat |
| SEC-01 | Same as DEP-09 | Same as DEP-09 |
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

---

## How to use this file

- Pick from the "Top priorities" pointers when starting a session
  and there's no user-driven priority override; consult ROADMAP
  for the canonical task description.
- When a session defers a sub-item, add it under the matching
  category with a `*-FU-NN` ID and one-line "why deferred".
- When an item ships, **delete the row** from this file. The
  CHANGELOG / ROADMAP archive records the history; the backlog
  is forward-looking only.
- When the top changes, re-rank explicitly in this file before
  starting work, not implicitly during a session.
- Don't grow past 50 items. If it grows, split by category into
  themed files (`docs/backlog/dependencies.md`, etc.).
