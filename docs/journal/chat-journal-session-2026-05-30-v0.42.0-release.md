# Chat journal — 2026-05-30 (v0.42.0 release, execution session)

This was the **execution** half of a parallel-session release. A
separate planning session prepared the release artifacts (CHANGELOG,
`changelog/releases/v0.42.0.md`, the 4 deferred-item backlog filings)
in the same working tree; this session drove the mechanical release
plus a CI-red fix.

## 1. State verification + baseline (18:05)

- Goal: confirm clean tree / origin parity, capture release state.
- Result: HEAD at `d673687e`, clean, 72 commits since v0.41.0. `make
  test` green (backend 2442 passed / 1 skipped; Vitest 2549 passed;
  i18n parity green).

## 2. CI-red diagnosis + fix (18:10)

- Original prompt: "ci is red" (user interjection mid-release).
- Goal: get main CI green.
- Result: the story-bible C2-C12 commits had landed without
  pre-commit applied. Three hooks failed on `pre-commit run
  --all-files` (confirmed identical to the red CI run `26688536820`):
  - `end-of-file-fixer` — missing trailing newlines in
    `ArticleList.tsx`, `ChapterSidebar.module.css`,
    `RichTextToolbar.module.css`.
  - `ruff-format` — `story_entity_registry.py` `_REGISTRY_PATH`
    reflow.
  - `module-state-audit` — the new `load_story_entity_types`
    `@lru_cache` was un-allowlisted. Audit decision (a):
    `test_story_entity_registry.py` carries the bidirectional
    yield-based `cache_clear()` autouse fixture, so it was
    allowlisted with that note.
- Commit: `d8027af5` `fix(ci): pre-commit formatting + module-state
  allowlist for story-bible`. Pushed; CI + Coverage both went green.

## 3. Multi-tool coordination hazard (18:20)

- Discovered the parallel planning session was racing the same
  release runbook in the shared `.git`: it had pushed
  `275d6593` (flaky-test fix) + `153e00dc` (4 deferred backlog
  filings — the "File Deferred Items" step from this session's own
  brief), and created 2 unpushed local commits — `43e450dd`
  (changelog) + `e08e6ab3` (version bump, `sync-versions` clean).
- Surfaced a status correction + asked the user who should drive
  the irreversible tag/push. User: "I finish it; stop the other."
- Per the explicit-paths discipline, every `git add` named files
  individually to avoid absorbing the parallel session's in-flight
  CHANGELOG edit.

## 4. Release completion (18:30)

- Goal: finish v0.42.0 on top of the parallel session's clean
  version-bump.
- Result:
  - Version headers → v0.42.0 (README, README-de, CLAUDE.md,
    ROADMAP, backlog) + CLAUDE.md v0.42.0 summary (demote v0.41.0,
    drop v0.37.0) + `plugin-story-bible` plugin-table row (13th
    plugin) + StoryEntity / StoryEntityPageLink data-model entries.
    Commit `8af9cb00`.
  - `make release-test` green (tests, tsc, ruff, mypy, pre-commit,
    verify-docs-discipline, verify-docs-completeness,
    verify-plugin-locks, verify-theme 96 WCAG contrast checks,
    launcher PyInstaller build). `npm audit` 0 high/critical.
    `verify_version_pins.sh 0.42.0` clean.
  - Pushed main `8af9cb00`; annotated tag `v0.42.0` pushed
    (`40cfec4f`); GitHub release published from
    `changelog/releases/v0.42.0.md`.

## Release summary — v0.42.0 (the Story Bible release)

- 75 commits since v0.41.0; 202 files changed.
- Backend pytest 2399 → 2442 (+43, 1 skipped); Vitest 2487 → 2549
  (+62).
- Headline: `plugin-story-bible` (per-book fiction-entity database)
  + Story Bible ↔ Storyboard integration (entity-page linking,
  badges, appearance tracker, Arc View timeline, continuity checker,
  Markdown export); content-type-neutrality pass; component-
  consistency + a11y sweep; Zip Slip guard + app-wide error
  boundaries.

## Questions and assumptions

- **Shipped-epic archival**: `STORY-BIBLE-PLUGIN-01` +
  `STORY-BIBLE-STORYBOARD-INTEGRATION-01` were left OPEN in
  ROADMAP/backlog. Evidence-based decision: both entries explicitly
  list "Remaining:" work and the parallel session filed 4 P4
  follow-ups overlapping it, so per the continuous-archival rule
  (don't archive items with remaining blocking work) they stay open;
  the entries already note "Sessions 1+2 shipped 2026-05-30."
  Reconciling the Session-3/4 vs the 4 new P4-item decomposition is
  the planning session's backlog domain.
- **backlog "Last updated" counts**: the awk per-tier count
  (P3=17/P4=32/P5=13) differs from the established "active" counter
  methodology (prior baseline 57). Used defensible arithmetic from
  the known baseline (57 + 4 P4 = 61) rather than asserting a
  recomputed absolute.
- **Plugin `/info` version literals**: `verify_version_pins.sh`
  flagged comics `1.1.0` (pre-existing) + story-bible `1.0.0` (new)
  as advisory — independent plugin versions, not the app version,
  explicitly "not a tagging blocker." Left as-is (matches the comics
  precedent); a KNOWN_FILES addition for story-bible is a minor
  future hygiene follow-up.
