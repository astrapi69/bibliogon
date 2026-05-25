# C7 cross-session staging absorption — 2026-05-21

Audit-trail note for commit `954248e` (Phase 2 PANEL-CONFIG-01 C7).

## What happened

C7 was intended to ship 2 docs files:

- `docs/backlog.md` (Last-updated prose refresh)
- `docs/roadmap-archive/2026-05.md` (Phase 2 close archive entry)

`954248e` actually shipped 9 files: the 2 intended docs files plus
7 files that belonged to a paused parallel session shipping
PluginForge v0.9.0 follow-up work:

| File | Owner-session | Purpose |
|---|---|---|
| `backend/app/routers/settings.py` | parallel (PluginForge v0.9.0) | Settings endpoint plumbing for the new FilterReason |
| `backend/tests/test_plugin_discovery.py` | parallel (PluginForge v0.9.0) | +39 backend pytest cases for plugin-discovery |
| `frontend/src/api/client.ts` | parallel (PluginForge v0.9.0) | +13 lines client-side surface |
| `frontend/src/components/settings/AboutSettings.test.tsx` | parallel | +9 Vitest cases |
| `frontend/src/components/settings/PluginCard.test.tsx` | parallel | +61 Vitest cases |
| `frontend/src/components/settings/PluginCard.tsx` | parallel | +56 lines UI for FilterReason badge surface |
| `frontend/src/components/settings/PluginSettings.tsx` | parallel | +24 lines settings-pane integration |

## Why the absorption happened

The parallel session that shipped `0c966e0` (PluginForge ^0.8.0 →
^0.9.0 bump) left 7 follow-up files pre-staged in the local index
when it paused, intending to commit them under a subsequent
`feat(pluginforge)` subject. The CC Phase 2 session was running on
the same local working tree; the pre-staged files were invisible
to `git status docs/` (filtered to docs/) which is what CC ran
before C7's commit. `git add docs/...` added the 2 intended files
on TOP of the 7 already-staged ones; `git commit` shipped all 9.

## Why no remediation

Force-push amendment to `origin/main` is destructive per the
safety rules in CLAUDE.md and was not authorized. The functional
state of origin/main is correct:

- All 9 files' content matches what their respective sessions
  intended to ship
- No tests broken
- No content lost
- Backend baseline 2125 / Frontend Vitest 1783 / tsc clean

The only mismatch is the commit MESSAGE in `954248e` describing
only the docs/* changes; the 7 PluginForge follow-up files are
silent in the subject. This audit-trail note closes the gap
non-destructively.

## Related context

- Parallel-session commit: `0c966e0` — feat: bump pluginforge to
  v0.9.0 and add missing_target_application i18n mapping (35
  files; the 7 absorbed files were intended as a follow-up to
  this commit)
- Phase 2 ship chain: `d3410fb..9062633` (clean C1-C6) +
  `954248e` (C7 — this absorption case)
- Multi-Tool Coordination on `main` is the expected state for
  this project per user-confirmed direction; the absorption is
  a process-discipline gap, not a workflow defect

## Process discipline (recorded as a new Lessons-Learned entry)

See `.claude/rules/lessons-learned.md` "Plain git status before
every commit, especially in Multi-Tool-Coordination sessions"
(filed same-session as this audit note).
