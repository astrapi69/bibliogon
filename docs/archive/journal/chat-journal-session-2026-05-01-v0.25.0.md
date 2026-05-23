# Session Journal — 2026-05-01 (v0.25.0)

Long working day that ran from secret-redaction through the
T-01 inline-styles Phase B sweep, smoke testing, two follow-ups
(F-01 + F-02), and a v0.25.0 release cut. Output below in the
order it happened.

## 1. Git history secret redaction (~morning)

Push to `origin/main` rejected by GitHub secret scanning: a real
Anthropic API key shipped inside the diagnostic prose of
`docs/explorations/donation-visibility-diagnosis.md` (added in
`9c77c82`, softened a commit later in `c86f64d` but the literal
key text stayed in the patch hunk). Aster confirmed the key was
already rotated + the file was in `.gitignore`, but the leak in
git history is still bad hygiene even when the key is dead.

Fix: interactive rebase from `9c77c82^`, marked both `9c77c82`
and `c86f64d` as `edit`. Redacted the literal secret to
`sk-ant-api03-<REDACTED-rotated-2026-04-30>` with an inline note,
then `git commit --amend` collapsed the soften commit into the
diagnosis commit (the `c86f64d` patch was the inverse of what we
just amended into `9c77c82`, so the merge folded cleanly).
Subsequent 33 commits replayed without conflict; force-push
accepted, GitHub push-protection green.

Rule for next time: pre-commit-style secret scanner before writing
any prose that contains a real-looking key, even in a gitignored
context.

## 2. T-01 Phase B inline-styles sweep (~afternoon)

19 files migrated this session on top of earlier Phase A pilot:
`GetStarted`, `QualityTab`, `Help`, `CreateBookModal`,
`BookListView`, `SaveAsTemplateModal`, `ArticleCard`, `BookCard`,
`BookEditor`, `SupportSection`, `ConflictResolutionDialog`,
`KeywordInput`, `ChapterVersionsModal`, `ChapterTemplatePickerModal`,
`DonationOnboardingDialog`, `Toolbar`, `ShortcutCheatsheet`,
`CoverUpload`, `SaveAsChapterTemplateModal`, `DashboardFilterBar`,
`DashboardFilterSheet`, `DonationReminderBanner`, `OfflineBanner`.

Pattern: per-file `*.module.css`, kebab-case CSS keys preserved
as camelCase JS keys via Vite's CSS-Module loader, theme tokens
unchanged (so the 3-theme × light/dark cascade keeps working).
Multi-className collisions resolved via template literal merges
where global utility classes had to coexist with module classes.
Conditional active/disabled states refactored from spread-objects
to filter-Boolean className joins.

Each file migration shipped as its own commit so bisect stays
clean. Total: ~330 inline-style call-sites moved this run, ~700
across the whole T-01 wave.

## 3. Smoke verification (~evening)

Aster's interactive smoke session covered Flow B (donation
visibility), Flow C (trash permanent-delete), and later Flow D
(articles backup). Key findings:

- **Flow B — landing_page_url tradeoff.** With the URL set to
  the rebranded DONATE.md, S-01 SupportSection collapses to a
  single button (per `SupportSection.tsx:53-73`), hiding the
  four-channel grid we wanted to verify. Reverted to `null`,
  the inline grid renders.
- **Flow C — articles trash card layout bug.** Permanent-delete
  button rendered but was paint-clipped offscreen because the
  Articles trash grid track was `minmax(220px, 1fr)` — too narrow
  for both German action labels (`Wiederherstellen` + `Endgültig
  löschen`). Fix B (`flex-wrap: wrap` on `TrashCard.module.css`'s
  `.actions`) makes the component layout-independent; fix C bumped
  the Articles grid track to `minmax(300px, 1fr)` to match books.

## 4. Follow-up F-01: Settings tabs hamburger on mobile

Tabs.List was `overflow-x: auto` on viewports ≤768px so users
had to horizontally scroll to find a tab; the new "Unterstützen"
tab pushed the list past the visible edge. New
`settings-tabs-mobile` block renders a `Menu`-icon `DropdownMenu`
labelled with the active tab name; original `Tabs.List` keeps
its desktop behaviour with a new `settings-tabs-desktop` class
hiding it below 768px. `tabDefs` array now the single source of
truth for both surfaces; `Tabs.Root` value binding still owns
the active state, so deep-link via `?tab=` and URL-replace are
unchanged. Translations added to all 8 locales.

## 5. Follow-up F-02: `make dev-bg` robustness

`make dev-bg` had been silently dying: bare `&` after the recipe
shell exits sent SIGHUP to the children. Symptom (caught during
flow C) was every dashboard endpoint returning 500 because vite
proxy had no backend to forward to. Fix: `setsid` puts each child
in its own session, output redirected to `/tmp/bibliogon-logs/{
backend,frontend}.log` so a `make dev-bg-logs` target can tail
both, and a `kill -0` startup probe fails loud with the log path
on early death. Also fixed a pre-existing PID-path bug where
the AND-OR list ran in a backgrounded subshell and `> ../.pid-*`
wrote to the wrong directory.

## 6. v0.25.0 release cut

SemVer call: minor (0.25.0). 95 commits since v0.24.0 across
articles parity, secrets refactor, donations S-01, T-01 wave,
F-01, F-02. No breaking changes; lots of `feat:`, `refactor:`,
and `fix:`.

Steps walked through release-workflow.md:

1. State capture: 95 commits, 201 files, ~18k LOC.
2. Version bumped in every source of truth (`backend/pyproject.toml`,
   `frontend/package.json`, `frontend/package-lock.json`,
   `install.sh`, `backend/app/__init__.py`, `CLAUDE.md`,
   `docs/ROADMAP.md`).
3. Centralised `__version__`: replaced two hardcoded strings in
   `backend/app/main.py` (one stale at `0.15.0` for nine minor
   releases on the health endpoint).
4. CHANGELOG entry + release-notes file at
   `changelog/releases/v0.25.0.md`.
5. Dependency currency check ran: routine patches deferred to a
   focused dep-sweep release, major bumps still blocked under
   DEP-02 (TipTap 3) and DEP-09 (Vite 8).
6. `make test`: 1253 backend + 682 frontend tests green.
   `tsc --noEmit`: clean. `ruff check`: clean. `pre-commit`: clean.
7. `npm run build` (Node 24): 35 PWA precache entries, no errors.
   Note: build hits Node 18 / Vite 7 incompatibility otherwise;
   Aster's main shell on Node 24 is fine.
8. Tag `v0.25.0` created + pushed.
9. GitHub release published:
   https://github.com/astrapi69/bibliogon/releases/tag/v0.25.0
10. `T-01` and `T-01-audit` marked done in ROADMAP. CLAUDE.md
    + ROADMAP "Latest release" line updated.

## 7. Output statistics

- Commits in v0.25.0 cycle (since v0.23.0… counted from v0.24.0):
  95 + 1 release commit + 1 post-release commit = 97.
- Files touched in cycle: 201, +18055 / -3218.
- Tests at release: 1253 backend (1 skipped) + 682 frontend = 1935.
- Open follow-ups: smoke-doc Flow 7 instructions need an article
  fixture (current empty-bgb hits the empty-archive gate before
  the forward-compat warning fires). DEP-02 / DEP-09 still
  upstream-blocked.
