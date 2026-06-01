# Chat journal — 2026-06-01

Autonomous execution session: complete the remaining Story Bible +
Storyboard integration backlog, then cut the v0.43.0 release.

## Summary

10 feature/test commits + 3 release commits since v0.42.0. Shipped the
four deferred STORY-BIBLE-STORYBOARD-INTEGRATION-01 follow-ups
(relationship model, prose storyboard, @-mention, integration E2E)
and released **v0.43.0** "Story Bible integration depth".

| # | Commit | What |
|---|--------|------|
| 1 | `351ca3ac` | C3 — Chapter storyboard annotation columns + migration + schemas + 12 pytest |
| 2 | `690b55a8` | C10-schema — `StoryEntity.relationships` JSON + resolve endpoint + migration + 8 pytest |
| 3 | `75be8866` | C3-ui — prose chapter-card Storyboard + shared `StoryboardAnnotations` extraction (RCU) + 8 Vitest + i18n |
| 4 | `f22acfda` | C10-editor — relationship editor section + shared `relationshipColors` + 3 Vitest + i18n |
| 5 | `2cace156` | C10-ui — Arc View relationship lines + "Show relationships" toggle + 2 Vitest |
| 6 | `969136da` | C13 — @-mention autocomplete (`@tiptap/extension-mention` 2.27.2) + `?search=` + 5 Vitest + 1 pytest |
| 7 | `2000d61e` | C14 — auto-detect endpoint + sidebar panel + 5 pytest + 2 Vitest |
| 8 | `eeb738c2` | C15 — @-mention + auto-detect i18n across 8 catalogs |
| 9 | `7fe06345` | C16 — prose-storyboard Playwright smoke |
| 10 | `17590117` / `ed748f53` | CHANGELOG + version bump v0.43.0 |

## Notes / decisions

- **Prose Storyboard = separate component**, not a page-card variant
  (Stop-Condition): chapter cards have no thumbnail / drop-target /
  continuity / arc-view. The four annotation editors WERE extracted to
  a shared module and both surfaces migrated in the same commit (RCU;
  60 existing Storyboard Vitest preserved).
- **@-mention popup** mounts via ReactRenderer outside the i18n
  provider, so labels are threaded in via `buildMentionLabels(t)`.
  Comic-bubble text is a plain textarea (not TipTap) -> out of scope.
- **Auto-detect** is conservative (exact, case-insensitive, word-
  boundary; short names skipped; already-linked excluded) per the
  false-positive Stop-Condition.
- **Deferred under budget** (filed): `COMPONENT-CONSISTENCY-TAIL-01`
  (P3, advisory — `verify-components` green) + the comprehensive
  help-docs/screenshots remainder of `STORY-BIBLE-INTEGRATION-DOCS-01`.

## Release v0.43.0

Tag `v0.43.0` pushed; GitHub release published
(https://github.com/astrapi69/bibliogon/releases/tag/v0.43.0).
Gates green: backend pytest 2468 passed / 1 skipped; Vitest 2568;
tsc; ruff `app/`; mypy `app/`; pre-commit --all-files; verify-theme;
verify-components; verify-docs-discipline; launcher PyInstaller build;
frontend `npm run build`. verify-docs-completeness WARN (advisory:
one 39-day-old marketing screenshot — pre-existing). Docker push +
MkDocs deploy run via their own CI workflows.
