# Chat journal — 2026-06-10

Multi-session day (parallel Claude Code sessions sharing one working tree),
closed by the **v0.49.0** release.

## 1. Finding 7 — Book trash offline via Dexie (#39)

`DexieStorage.books.delete` hard-deleted offline, so a deleted book vanished
and never reached the trash. Added `deleted_at` to the books Dexie schema (v9),
made `delete` soft-delete, and added the trash lifecycle (listTrash / restore /
permanentDelete / emptyTrash / bulkRestore / bulkDelete) to the storage seam +
ApiStorage + sync-queue passthrough. Dashboard trash handlers routed through
`getStorage()`. Dexie round-trip tests + offline E2E. Branch
`fix/book-trash-offline-dexie`, merged `--no-ff`.

## 2. Findings 6/5/3 — offline writing history, sidebar, autosave (#40/#41) + axe

- **Writing History offline (#40):** `WritingStatsStorage` seam; DexieStorage
  aggregates summary/streaks/per-book/per-chapter from the `writingSessions`
  table; offline chapter edits record the daily delta; gate removed.
- **Autosave 409 race (#41):** authoritative per-chapter version in a `useRef`,
  seeded on load + updated from each save response; regression test confirmed
  failing on pre-fix code.
- **Sidebar Werkzeuge (Finding 5):** already shipped by a parallel session
  (commit `52864315`); follow-up made the default viewport-responsive (#42).
- **axe button-name (#43):** aria-labels on icon-only buttons (sidebar
  back/add/delete, OrderedListEditor add).

Branch `fix/offline-and-ux-findings`, merged `--no-ff`.

## 3. Quality infrastructure (#45/#46/#48) — multi-tool coordination

- **Coverage baseline (#45):** tooling already existed; documented the baseline
  (backend 89.6% / frontend 72.3%) from CI artifacts + `coverage-*` aliases.
- **Security scanning (#46):** `npm audit` + `pip-audit` in CI + `make audit*`;
  4 pre-existing pip advisories ignored, tracked in **#47** (weasyprint major is
  render-risky, deferred).
- **ESLint flat config + Prettier (#48):** done by a parallel session. My own
  attempt was abandoned on detecting a shared-tree branch switch; useful intel
  handed off (real style is 4-space + double-quotes + semicolons, `no-undef`
  off, jsx-a11y blocked under ESLint v10 peer-dep).

Items 1+2 shipped via PR #49 (`build/quality-infra`); item 3 + the bulk-action-
bar button-class fix shipped via `fix/eslint-prettier`. Several status
corrections surfaced parallel-session work already on main rather than
re-implementing it.

## 4. Release v0.49.0

The **editor v3 + offline depth + quality-infra** release — 38 commits since
v0.48.0, bundling the TipTap v2->v3 migration + node-based math + LaTeX export
(parallel-session work) with this arc's offline + quality-infra work.

- SemVer minor; CHANGELOG + `changelog/releases/v0.49.0.md`; version bump via
  `make sync-versions` (canonical `backend/pyproject.toml` only).
- `make release-test` green on the second run (first run correctly flagged 5
  stale version headers via verify-docs-completeness; fixed README / README-de /
  CLAUDE.md / ROADMAP / backlog).
- A shared-repo amend hazard (origin already had the first release commit) was
  reconciled by soft-resetting to origin and recommitting the header delta —
  no force-push.
- Tag `v0.49.0` + GitHub Release published; launcher (Linux/Windows/macOS) +
  release-gate + CI + coverage + Pages deploy all triggered.

Aster confirmed the E2E gate green before tagging (mandatory STOP-gate).
