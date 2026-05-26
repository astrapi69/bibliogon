# Chat journal — 2026-05-26 — v0.38.0 release

Settings-UX overhaul release cut. 30 commits since v0.37.0 (one
day) across four coordinated work streams + a nav-jump bug fix
on Article Dashboard + a flake fix surfaced by the release-test
chain itself.

## Session shape

1. **SETT-PHASE-1-QUICK-WINS-01** (7 quick wins, 8 commits) —
   dashboard-view grouping, SSH-Key card, Editor tab extraction,
   sectionTitle standardization, HelpText component, White-Label
   collapsible, SectionHeader + per-section descriptions.

2. **SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01** (4 commits) —
   Allgemein split into Erscheinungsbild + Verhalten + Erweitert;
   obsolete `AppSettings.tsx` removed.

3. **SETT-PHASE-3-TOGGLE-COMPONENT-01** (3 commits) — Toggle
   composition component + 5-site migration (VerhaltenSettings 3
   + AI 1 + Audiobook 1). Remaining 10 sites tracked as a P3
   sweep.

4. **SETT-AUTHORS-TAB-CONSOLIDATION-01** (1 commit + archive) —
   Autor + Autoren-Datenbank merged into a single Autoren tab;
   LEGACY_TAB_REDIRECTS preserves `?tab=author` +
   `?tab=authors_database` deep-links.

5. **SETT-L-1-SIDEBAR-REDESIGN-01** (5 commits, C1-C5) —
   horizontal tab bar replaced with left-sidebar grouped nav.
   13 tabs after Authors-consolidation produced a horizontal
   scrollbar at 900px max-width (user-pull trigger fired same-
   day). 5 sidebar groups (Darstellung / Inhalt / System / Info
   / Gefahrenzone); 4 visible group headers; Danger Zone red
   accent + divider above. Mobile dropdown preserved with
   group separators. All 13 `settings-tab-{value}` testids
   preserved. 6 new i18n keys × 8 catalogs (sidebar_nav + 4
   group labels + import_more_tooltip). New
   `e2e/smoke/settings-sidebar.spec.ts` ships 7 cases.

6. **Article Dashboard top-nav alignment** (1 commit) — bug
   report: top nav jumps when switching between Book and
   Article Dashboard. Article was ~106px wider because of the
   standalone Medium-import button + ONE separator vs Book's
   TWO. Fix: collapsed Medium-import into a chevron
   disclosure on Importieren (split-button pattern mirroring
   `newBookGroup`); added second headerSeparator. Article
   width ~1014px → ~908px (matches Book Dashboard).

7. **v0.38.0 release process** (release-workflow.md):
   - Step 1 state: 30 commits, clean tree, baselines 2269/2080
   - Step 2 SemVer: minor bump (presence of `feat:` commits)
   - Step 3 pre-release checks: make test green, npm audit 0
     high/critical (2 moderate pre-existing), i18n parity
     51/51, HELP-DOCS-V0.37.0-GAPS-01 covers known help-doc
     gaps
   - Step 4 CHANGELOG + per-release notes file
   - Step 5 version bump via `make sync-versions` (20 files)
   - Step 6 release-test surfaced a flake in
     `test_tampered_token_rejected` (pre-existing from
     v0.37.0; signature-last-char-is-X collision ~1.5% of
     runs). Fixed inline; one-line change from `X` to `!`.
   - Step 7 release-test re-run green
   - Step 8 release-build green
   - Step 9 release-tag v0.38.0 pushed
   - Step 10 GitHub release published at
     [github.com/astrapi69/bibliogon/releases/tag/v0.38.0](https://github.com/astrapi69/bibliogon/releases/tag/v0.38.0)

## Pre-Coding-Reality-Check findings

- **SETT-L-1 commit-plan spec-omission**: user's design listed
  11 items across 5 groups, Settings.tsx ships 13 tabs.
  Verhalten + Erweitert not assigned. Surfaced as α/β
  adjudication; user adopted α (both retain content, slotted
  into Darstellung + System groups).
- **Release prompt feature-list mis-attribution**:
  `Book.repository_url` + Editor display settings listed as
  v0.38.0 Features in the user's prompt, but
  `git log v0.37.0..HEAD` showed zero matches — both shipped
  IN v0.37.0. Surfaced; dropped from the v0.38.0 CHANGELOG.

## Disciplines re-validated

- "Run vitest from `frontend/`, not the repo root" — hit early
  in C2 of SETT-L-1; cwd had reset between commands.
- "Testid namespace pinning prevents silent E2E skips" — all
  13 `settings-tab-{value}` testids preserved across the
  sidebar redesign; 3 E2E specs (about-dialog,
  trash-view-mode-defaults, article-topic-seo) kept working
  without modification.
- "Radix DropdownMenu + happy-dom is brittle for Vitest" —
  SettingsMobileMenu test pinned trigger-only; popover
  content lives in the C5 Playwright spec.
- "Pre-Coding-Reality-Check: re-audit at the keystroke" —
  caught the SETT-L-1 spec-omission AND the release-prompt
  mis-attribution.
- "Numeric claims verification" — feature-list re-verified via
  `git log` before dropping from CHANGELOG.
- "Plain `git status` before every commit" — 7 commits this
  session, no parallel-session work absorbed.

## Test deltas

- Backend pytest: 2269 (no change; refactoring + bug fixes only,
  no new test coverage in this release)
- Vitest: 2063 → 2080 (+17 across SETT-L-1 C1-C3 component
  pins)
- i18n parity: 51/51 throughout (75/75 keys per catalog)
- Plugin suites: all green (export 268 / grammar 10 / kdp 42 /
  kinderbuch 8 / ms-tools 97 / translation 35 / audiobook 98 /
  help 30 / getstarted 13 / git-sync 23 / comics 19 /
  medium-import 104)

## Release-cycle flake found + fixed

`tests/test_system_reset.py::test_tampered_token_rejected`
flipped the last char of an HMAC-SHA256 base64 signature to
`X`. `X` is itself a valid base64 character, so when the
original signature happened to end with `X` (~1.5% of runs),
the "tampered" signature was identical to the original and
the endpoint returned 200 instead of the asserted 400.

Pre-existing flake from v0.37.0
(DANGER-ZONE-RESET-EVERYTHING-01). Surfaced during
`make release-test` in this session — the v0.37.0 release was
lucky.

Fix in commit `fa77960`: flip to `!` (never a valid base64
character) so the tampered signature is guaranteed different.
Pinned by a 6-line comment so future contributors don't
reintroduce `X`.

## Commits

| # | Hash | Subject |
|---|---|---|
| 1 | `85ae7fe` | SETT-L-1 C1: sidebar layout (Radix.Tabs out) |
| 2 | `ddcbf45` | SETT-L-1 C2: SettingsMobileMenu extract |
| 3 | `f1d72ad` | SETT-L-1 C3: group headers + Danger Zone red accent |
| 4 | `b62a98a` | SETT-L-1 C4: 5 i18n keys × 8 catalogs |
| 5 | `bd54ec2` | SETT-L-1 C5: docs close + Playwright smoke |
| 6 | `18dd836` | Article Dashboard nav-jump fix |
| 7 | `9f491b5` | docs: changelog for v0.38.0 |
| 8 | `fa77960` | fix(tests): tampered-token signature flake |
| 9 | `d7fe18b` | chore(release): bump version to v0.38.0 |
| 10 | (post-release) | post-release docs |

(7 additional commits from earlier in the day were ship of
SETT-PHASE-1/2/3 + SETT-AUTHORS-TAB-CONSOLIDATION-01 in
preceding sessions — see prior journal entries.)

## Active backlog after release

- HELP-DOCS-V0.37.0-GAPS-01 (P3) — still pending; covers
  Editor display settings + Book.repository_url + dashboard
  pagination + word-wrap help pages. Extend with the
  Settings-UX-overhaul help docs once a help-docs session is
  scheduled.
- 7 other v0.37.0 post-release follow-ups (filed in commit
  `056fdfd`).
- Remaining Toggle migration sweep (~10 sites; P3).

## What didn't ship

No major feature additions. v0.38.0 is purely:
- Settings-page UX restructure (visible improvement)
- Article Dashboard layout-jump fix (bug fix)

Dependency bumps (TipTap 2→3, dompurify, @types/node 24→25,
@vitejs/plugin-react 5→6) all deferred per release-workflow.md
stability rules. Major bumps get dedicated sessions.

## Outcome

- v0.38.0 tagged + pushed
- GitHub release published with auto-generated launcher
  artifacts (CI builds + attaches)
- All disciplines green; no STOP conditions remained at tag
  time.
