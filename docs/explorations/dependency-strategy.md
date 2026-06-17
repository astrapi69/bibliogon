# Dependency Strategy

Status: Active maintenance document
Last full review: 2026-04-20
Last refresh: 2026-06-17 (DEP-02 + DEP-09 marked shipped; community-
extension pins unpinned; DEP-05 re-confirmed deferred)
Next review: 2026-07-20 (quarterly) or next major release

## Purpose

Strategic decision log for Bibliogon's major dependency versions.
Complements:

- `docs/ROADMAP.md` - forward feature work (DEP items cross-
  referenced there)
- `.claude/rules/lessons-learned.md` - dependency discipline rules
- `docs/CHANGELOG.md` - actual version bumps as they land

This document records **why** we chose a version, **what pins**
exist and under what conditions, and **what triggers** would make
us reconsider.

## Policy

### Stability filter

- Only stable releases. No alpha, beta, RC.
- Minimum 2 weeks since release for new major versions.
- For LTS products (Node.js), prefer Active LTS over Current.
- Never ship with EOL or deprecation-imminent versions.

### Release-cycle review

Before every release cut:

- `poetry show --outdated` in `backend/` and each plugin
- `poetry show --outdated` in `launcher/`
- `npm outdated` in `frontend/`
- Apply routine bumps (patch + low-risk minor) during release prep
- Major bumps get dedicated sessions with their own testing cycle,
  never bundled into a release

### Pin rules

Any dependency pinned below latest must document in this file:

1. **Why pinned** (concrete reason, not "compatibility")
2. **Unpin condition** (what must change upstream)
3. **Review date** (when to re-check)

Pins without all three are technical debt.

## Deferred major migrations

> **DEP-02 (TipTap 3) and DEP-09 (Vite 8) are RESOLVED — both shipped.**
> See the [Migration history](#migration-history) for the records. Only
> DEP-05 (elevenlabs SDK) remains genuinely deferred.

### DEP-05: elevenlabs SDK 0.2 -> 2.x

- Current: `elevenlabs` ^0.2.27 (re-confirmed in `backend/pyproject.toml`,
  2026-06-17)
- Latest stable: `elevenlabs` 2.x
- Status: **DEFERRED**
- Last reviewed: 2026-06-17

**Benefits of upgrade:**

- Newer voice models exposed through the 2.x SDK
- Streaming improvements for long audiobook chapters

**Cost of upgrade:**

- Complete SDK rewrite. Method names, async patterns, auth
  handling all different.
- Cannot be validated purely with mocks: requires real ElevenLabs
  API calls during migration to verify audio quality matches
  expectation. Mocks catch API shape, not output quality.
- Audiobook plugin is the only consumer; blast radius is
  contained but user-visible.

**Why deferred:**

- 0.2.27 works for current feature set (TTS synthesis per
  chapter, voice listing, credit check)
- No user request for 2.x-exclusive features
- Migration cost dominates benefit until a concrete trigger fires

**Re-evaluation triggers:**

- 0.2.x drops below supported API versions (ElevenLabs announces
  deprecation)
- User reports audiobook generation failing against the current
  ElevenLabs API
- Need for a feature only in 2.x (e.g. streaming synthesis)

## Active pins with expiration

### TipTap community extensions — UNPINNED (2026-06-17)

With DEP-02 (TipTap 3) shipped, both community extensions moved to
their v3-compatible releases. No active pin remains:

| Package | Version | Note |
|---------|---------|------|
| `@pentestpad/tiptap-extension-figure` | 1.1.0 | requires `@tiptap/core ^3.19`, now satisfied (3.26.0) |
| `tiptap-footnotes` | 3.0.1 | requires `@tiptap/core ^3.0`, now satisfied |

### vite-plugin-pwa — cap lifted (2026-06-17)

- Current: ^1.3.0 (the release that added Vite 8 to its peer-dep range)
- The former implicit Vite 7 ceiling is gone; DEP-09 (Vite 8) is shipped.

## Migration history

Chronological record of completed DEP items and other notable
version work.

### v0.49.0 (2026-04): DEP-02 TipTap 2 -> 3

- `@tiptap/core` / `@tiptap/pm` 2.27.2 -> 3.26.0; all official +
  community extensions on matching 3.x.
- Shipped via the fallback path, NOT the original blocker: instead
  of waiting on `@sereneinserenade/tiptap-search-and-replace` v0.2.0
  to publish, the editor's search uses a `prosemirror-search`
  adapter (`prosemirror-search` 1.1.1 in `frontend/package.json`).
- Unlocked the two community-extension pins:
  `@pentestpad/tiptap-extension-figure` 1.0.12 -> 1.1.0,
  `tiptap-footnotes` 2.0.4 -> 3.0.1.
- Also landed node-based KaTeX math (inline `$...$` + block `$$...$$`).
- Full re-validation: Vitest component tests + Playwright smoke green
  at the v0.49.0 cut.

### 2026-04: DEP-09 Vite 7 -> 8

- `vite` ^7.3.2 -> ^8.0.12, unblocked once `vite-plugin-pwa` 1.3.0
  added Vite 8 to its peer-dep range.
- Vite 8 ships Rolldown by default; `manualChunks` had to become a
  function (object form is Rollup-only) — see lessons-learned
  "Vite 8 migration (DEP-09 + SEC-01)".
- Cleared the `workbox-build` -> `serialize-javascript` high-severity
  advisory chain as a side effect.
- Frontend toolchain has since advanced past the doc's earlier
  deferrals: `@vitejs/plugin-react` ^6.0.2, `@types/node` ^25.9.2,
  `typescript` ^6.0.3 (validate `tsc --noEmit` + `npm run build` on
  any further bump per lessons-learned).

### 2026-04: DEP-01 React 18 -> 19

- `react`/`react-dom` ^19.2.0, `@types/react`/`@types/react-dom`
  ^19.2.0
- Zero code changes: codebase already on `createRoot`, no
  `forwardRef`/`defaultProps`/`PropTypes`/`findDOMNode`/legacy
  lifecycles
- All peer deps (TipTap 2.27.2, react-router-dom 6, react-
  toastify 11, react-markdown 10, lucide-react, @dnd-kit, Radix)
  accept React ^19
- Verified: tsc clean, 351 Vitest tests green, `npm run build` +
  PWA regen clean; UI smoke by Aster pending

### 2026-04: DEP-03 react-router-dom 6.28 -> 7.14

- Zero-touch package bump. Declarative `<BrowserRouter>`/
  `<Routes>` unchanged in v7
- No `future:` flags, no `json()`/`defer()` loader helpers, no
  data-router in play
- Data-router migration (loaders/actions) stays a separate opt-in
  modernization
- Verified: tsc clean, 397 Vitest tests green, build + PWA regen
  clean on Node 22

### 2026-04: DEP-04 partial - Vite 6 -> 7 + TypeScript 5 -> 6

- `vite` ^7.3.2, `@vitejs/plugin-react` 4 -> 5.2.0
- `typescript` ^6.0.3 + explicit `@types/node` ^22 + `"types":
  ["node", "vite/client"]` in `tsconfig.json` (TS 6 stopped auto-
  including every `@types/*` from node_modules; breaks
  `node:fs`/`node:path` imports in `ChapterSidebar.test.tsx`)
- Vite 7 requires Node 20.19+/22.12+; CI's Node 22 fine, local
  Node 18 broken
- Vite 8 bump deferred to DEP-09

### 2026-04: DEP-06 pandas 2 -> 3

- Resolved transitively: `manuscripta` 0.9.0 requires `pandas
  >=3.0`. Bumped together with DEP-08.

### 2026-04: DEP-07 lucide-react 0.468 -> 1.8

- Zero-touch. Only 1.0 breaking change was removal of 13 brand
  icons (Chromium, GitHub, Instagram, LinkedIn, Slack, etc.). The
  codebase imports ~70 semantic-UI icons, no branded.
- Bonus: UMD format dropped (smaller bundle), `aria-hidden` auto-
  added

### 2026-04: DEP-08 Pillow 11 -> 12

- Forced by manuscripta 0.9.0 pin (requires `pillow >=12.0`). Both
  bumped together.

### 2026-04: manuscripta 0.7 -> 0.8 -> 0.9

- 0.7 -> 0.8 (lessons-learned "manuscripta v0.8.0 migration"):
  introduced `run_export`, typed exception hierarchy, silent-
  image-drop fix
- 0.8 -> 0.9: pandas 3 + pillow 12 upgrades upstream

## Dependency chain cross-references

Some DEP items depend on each other and must be sequenced:

- **DEP-09 (Vite 8)** - RESOLVED; was blocked by `vite-plugin-pwa`
  until 1.3.0 added Vite 8 to its peer-dep range.
- **DEP-02 (TipTap 3)** - RESOLVED; unlocked the two community-
  extension pins (`@pentestpad/tiptap-extension-figure` 1.1.0,
  `tiptap-footnotes` 3.0.1).
- **DEP-01 (React 19)** - no longer blocks anything; TipTap accepts
  React ^19.

## Review schedule

- **At each release**: routine bumps per release-cycle rule
- **Quarterly**: review this document end-to-end, refresh re-
  evaluation triggers, update dates, record upstream checks
- **At major decisions**: update this document **before**
  committing the bump

### Specific next checks

| Item | Next action | Target date |
|------|-------------|-------------|
| DEP-05 (elevenlabs 2.x) | Check for 0.2.x deprecation notice; plan a focused session if a trigger fires | 2026-07-20 (quarterly) |

DEP-02 (TipTap 3) and DEP-09 (Vite 8) are shipped — no further checks
needed; see the Migration history above.

## Relationship to other docs

- **ROADMAP.md** - DEP items get a one-line tracker entry there
  for visibility; the strategic reasoning lives here
- **lessons-learned.md** - dependency discipline rules (stability
  filter, release-cycle review) live there
- **CHANGELOG.md** - actual version bumps are recorded per release
- **CLAUDE.md** - pointer to this document under Maintenance
  section

## Maintenance

Update this document when:

- A DEP item is acted upon (implemented, re-scoped, or cancelled)
- A re-evaluation trigger fires
- New deferred migrations accumulate
- Upstream check run (record in the DEP entry's "Last reviewed"
  line)
- Quarterly at minimum

Commit message pattern:
`docs(explorations): [specific change to dependency strategy]`

Never silently update. Every change tracked in git for decision
audit trail.

## Design principle

This is a **strategic decision log**, not a specification:

- Specification: "this is how it works"
- Decision log: "this is why we chose X, and these conditions
  would make us reconsider"

When a future session encounters a DEP-X question, they should:

1. Check whether deferral conditions still apply -> action: wait
2. Check whether a trigger has fired -> action: re-evaluate with
   current data and update this document
3. Find circumstances changed in ways not captured -> action:
   update the document to reflect new understanding

The document is wrong if it ossifies. It is correct if it evolves
with project understanding.
