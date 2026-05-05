# Bibliogon Backlog

Last updated: 2026-05-05 (installer discovery completed; D-05 closed won't-fix; D-06 + D-07 added)
Current version: v0.26.6
Open tasks: 9 active (P3..P5) + 4 BLOCKED-on-upstream pointers
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
- **DEP-09** (Vite 8) — see ROADMAP > Blocked / Upstream Wait.
- **SEC-01** (vite-plugin-pwa CVE chain) — see ROADMAP > Blocked / Upstream Wait.

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

- **DEP-DBPATH-01**: `BIBLIOGON_DB_PATH` deprecation cycle. Per
  v0.26.6 changelog, the env var still works but is documented
  as deprecated. Concrete steps: (1) ~~emit a `logger.warning`
  when `BIBLIOGON_DB_PATH` is set without `BIBLIOGON_DATA_DIR`~~
  **shipped, awaiting next release** for one release cycle,
  (2) flip precedence so `BIBLIOGON_DATA_DIR` derivation wins,
  (3) remove `BIBLIOGON_DB_PATH` override entirely. Effort: S
  per step, spread across 2-3 releases. Step (2) trigger: one
  release after step (1) ships (i.e. v0.28.0+). Step (3) trigger:
  one release after step (2).

- ~~**DEP-FE-VERSION-01**: frontend version source-of-truth
  runtime cross-check. Currently `__APP_VERSION__` is a Vite
  build-time literal from `package.json`. In dev with hot-
  reload of one half but not the other, frontend version and
  backend version can diverge silently. Add a runtime read of
  `/api/health` `version` field; if it differs from
  `__APP_VERSION__`, surface a console warning. Effort: S.
  Speculative; not blocking.~~ **Shipped.** `verifyBackendVersion`
  in `frontend/src/utils/versionCheck.ts`, fired once from
  `main.tsx`. Fails open on every error path. Archive on next
  release.

- ~~**CI-PRECOMMIT-HOOK-01**: enforce
  `poetry run pre-commit run --all-files` as a pre-push git
  hook scoped to tag pushes.~~ **Shipped.** `scripts/git-hooks/
  pre-push` runs `pre-commit run --all-files` against `backend/`
  whenever a `refs/tags/*` push is detected; branch pushes are a
  no-op. `make install-hooks` symlinks every script under
  `scripts/git-hooks/` into `.git/hooks/`. Per-checkout, not
  committed under `.git/`. Each contributor runs `make
  install-hooks` once. Bypass with `git push --no-verify` only
  when explicitly intentional. Archive on next release.

- **D-06**: Phase 2 cross-platform installer scripts (post
  installer-discovery 2026-05-05). Three deliverables:
  (1) `install.command` for macOS (≤10-line wrapper that `cd`s to
  its directory and invokes `bash install.sh` from Finder),
  (2) `install.ps1` for Windows (PowerShell mirror of
  `install.sh.template`, ≤80 lines), (3) `install.cmd` for
  Windows (small batch wrapper that invokes
  `powershell.exe -ExecutionPolicy Bypass -File install.ps1` so
  corporate Windows with hard-locked Group Policy ExecutionPolicy
  still works). Ship UNSIGNED per user decision 2026-05-05;
  document SmartScreen / Gatekeeper warnings in the README;
  build reputation organically and re-evaluate signing budget
  after 4-6 weeks of real user feedback. Effort: 5-7 hours
  realistic (CC's initial 3-4h estimate omitted fresh-machine VM
  setup and first-bug iteration). Strongly preferred split:
  implementation 3-4h + fresh-machine validation 2-3h, because
  validation needs a test machine that may not be on hand
  simultaneously. Acceptance criteria: both wrappers work end-
  to-end on fresh user accounts (macOS user account, Windows 11);
  any new version literal goes through
  `scripts/verify_version_pins.sh`'s regression detector. Source
  of truth for install.sh stays `install.sh.template` +
  `scripts/generate_install_sh.sh` per release-workflow.md
  Step 4. See
  [docs/explorations/installer-discovery-report.md](explorations/installer-discovery-report.md)
  for the recommendation chain.

- **PGS-05-FU-01**: real-world unified-commit failure-mode tuning
  (only one of two subsystems active, partial-failure UX). Effort
  S; trigger by user report.

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

- **D-02 follow-ups**: macOS Intel universal2 build + code signing.
  Effort: M each. Deferred until user demand.

- **Launcher localization**: launcher UI is English-only. Effort: S
  per language; defer until user demand.

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
