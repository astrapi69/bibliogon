# Dependency Strategy

Status: Active maintenance document
Last full review: 2026-04-20
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

### DEP-02: TipTap 2 -> 3

- Current: `@tiptap/core` 2.27.2 (plus 15 official + 1 community
  extensions on matching 2.x versions)
- Latest stable: TipTap 3.x
- Status: **DEFERRED**
- Last reviewed: 2026-04-20

**Benefits of upgrade:**

- Upstream maintenance focus has shifted to 3.x; 2.x gets security
  backports only
- New 3.x features (re-architected collaboration hooks, smaller
  core bundle) would benefit the editor

**Cost of upgrade:**

- TipTap 3 is an API rework, not an incremental bump. Extension
  registration, schema definition, and command API all changed.
- 16 extensions to port (15 official + 1 community), each with
  its own v3-compatible version to pick up.
- Editor-heavy test surface: TipTap logic is exercised by
  Vitest component tests + Playwright smoke suite. Full
  re-validation needed.

**Why deferred:**

- Community extensions are the hard blocker. `@pentestpad/tiptap-
  extension-figure` 1.1.0 requires `@tiptap/core ^3.19`, and
  `tiptap-footnotes` 3.x requires `@tiptap/core ^3.0`. Both work
  currently (pinned at 1.0.12 and 2.0.4 respectively). Migrating
  to them is tied to the TipTap 3 migration itself.
- No user-facing feature currently blocked by TipTap 2.

**Re-evaluation triggers:**

- TipTap 2 receives deprecation notice or EOL announcement
- A user-facing feature requires a 3.x-only extension
- Security advisory against 2.x

### DEP-05: elevenlabs SDK 0.2 -> 2.x

- Current: `elevenlabs` ^0.2.27
- Latest stable: `elevenlabs` 2.x
- Status: **DEFERRED**
- Last reviewed: 2026-04-20

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

### DEP-09: Vite 7 -> 8

- Current: `vite` ^7.3.2
- Latest stable: `vite` 8.0.8 (observed 2026-04-18)
- Status: **BLOCKED UPSTREAM**
- Tracker: GitHub issue #6
- Last upstream re-check: 2026-04-18 (no change)

**Blocker:**

- `vite-plugin-pwa@1.2.0` peer deps list
  `vite: ^3.1.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0` - no
  Vite 8 entry
- No Vite 8 PR visible on github.com/vite-pwa/vite-plugin-pwa

**Do not** force with `--legacy-peer-deps`: Vite 8 changed plugin
APIs, and PWA is only exercised at `vite build` + SW regen, so a
runtime break there is hard to detect in dev mode.

**Re-evaluation cadence:**

- Run `npm view vite-plugin-pwa peerDependencies` every ~2 weeks
- Immediate re-check when vite-plugin-pwa publishes a new version
- When the plugin accepts `^8`, proceed with the Vite 8 bump

## Active pins with expiration

### TipTap community extensions

| Package | Pin | Reason | Unpin when | Review |
|---------|-----|--------|-----------|--------|
| `@pentestpad/tiptap-extension-figure` | 1.0.12 | 1.1.0 requires `@tiptap/core ^3.19` | DEP-02 completes | tied to DEP-02 |
| `tiptap-footnotes` | 2.0.4 | 3.x requires `@tiptap/core ^3.0` | DEP-02 completes | tied to DEP-02 |

Both pinned via `--save-exact` per the `npm ci` peer-dep rule in
`lessons-learned.md`.

### vite-plugin-pwa (implicit upper cap)

- Current: ^1.2.0
- Implicit: Vite 7 ceiling (see DEP-09 above)
- Unpin when: `vite-plugin-pwa` supports Vite 8
- Review: tied to DEP-09 tracker

## Migration history

Chronological record of completed DEP items and other notable
version work.

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

- **DEP-09 (Vite 8)** - blocked by `vite-plugin-pwa` upstream
- **DEP-02 (TipTap 3)** - unlocks the two community-extension
  pins (`@pentestpad/tiptap-extension-figure`, `tiptap-footnotes`)
- **DEP-01 (React 19)** - no longer blocks anything; was a peer-
  dep concern for TipTap at one point but TipTap 2.27.2 accepts
  React ^19 already

## Review schedule

- **At each release**: routine bumps per release-cycle rule
- **Quarterly**: review this document end-to-end, refresh re-
  evaluation triggers, update dates, record upstream checks
- **At major decisions**: update this document **before**
  committing the bump

### Specific next checks

| Item | Next action | Target date |
|------|-------------|-------------|
| DEP-09 (Vite 8) | `npm view vite-plugin-pwa peerDependencies` | ~2026-05-02 (every 2 weeks) |
| DEP-02 (TipTap 3) | Check TipTap 2.x deprecation status + community extension v3 compat | 2026-07-20 (quarterly) |
| DEP-05 (elevenlabs 2.x) | Check for 0.2.x deprecation notice | 2026-07-20 (quarterly) |

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
