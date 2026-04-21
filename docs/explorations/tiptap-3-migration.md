# TipTap 3 Migration Exploration

Status: Pre-audit complete. Blocked on upstream release.
Last updated: 2026-04-21
Revived when: search-and-replace extension v0.2.0 published to
npm (or fallback path activated).

---

## 1. Header

DEP-02 in [docs/ROADMAP.md](../ROADMAP.md) tracks the TipTap 2 → 3
migration. This document captures the pre-audit findings,
extension compatibility status, the search-and-replace blocker,
upstream coordination, and the migration plan for the session
that will execute the bump.

No code changes in this document. Exploration and planning only.

---

## 2. Pre-audit summary

### Current versions (frontend/package.json)

- `@tiptap/core` 2.27.2 (exact pin via `overrides` block)
- `@tiptap/pm` ^2.11.0
- `@tiptap/react` ^2.11.0
- `@tiptap/starter-kit` ^2.11.0
- 22 official `@tiptap/extension-*` pins in the ^2.x range
  (^2.11.0 to ^2.27.2)
- 4 community extensions (see Section 3)

### Target version

TipTap 3.22.4 (latest stable). First 3.x: 3.0.0-beta.0. Series
mature and stable.

### Code impact

65 TipTap API occurrences across 6 files, 3,430 LOC total in
TipTap-touching files:

| File | LOC | API usages |
|------|-----|-----------|
| [frontend/src/components/Editor.tsx](../../frontend/src/components/Editor.tsx) | 1522 | 23 API + 25 imports |
| [frontend/src/components/Toolbar.tsx](../../frontend/src/components/Toolbar.tsx) | 492 | 25 |
| [frontend/src/components/BookMetadataEditor.tsx](../../frontend/src/components/BookMetadataEditor.tsx) | 1207 | 2 |
| [frontend/src/extensions/StyleCheckExtension.ts](../../frontend/src/extensions/StyleCheckExtension.ts) | 138 | 3 custom Extension |
| [frontend/src/hooks/useEditorPluginStatus.ts](../../frontend/src/hooks/useEditorPluginStatus.ts) | 71 | 1 |
| [frontend/src/hooks/useEditorPluginStatus.test.ts](../../frontend/src/hooks/useEditorPluginStatus.test.ts) | - | 11 (test fixtures) |

Estimated actual churn: **150-300 LOC** across these 6 files +
`package.json` + lockfile + docs.

### Partial prep already landed

Commit 7507e40 (`refactor(editor): reactive word/char count via
useEditorState (partial #12)`) migrated the word/char count
readout from inline `editor.storage` reads to the idiomatic
`useEditorState` selector pattern. This is already the TipTap 3
pattern. Reduces migration surface.

---

## 3. Extension compatibility status

| Extension | Current | Latest | TipTap 3 peer? | Status |
|-----------|---------|--------|----------------|--------|
| 22 official `@tiptap/*` extensions | ^2.x | 3.22.4 | Yes | Bump to 3.x |
| `@intevation/tiptap-extension-office-paste` | 0.1.2 | 0.1.2 | `^2.10.3 \|\| ^3.0.0` (dual) | No change |
| `@pentestpad/tiptap-extension-figure` | 1.0.12 | 1.1.0 | `^3.19.0` | Bump to 1.1.0 |
| `tiptap-footnotes` | 2.0.4 | 3.0.1 | `^3.0.0` | Bump to 3.0.1 |
| `@sereneinserenade/tiptap-search-and-replace` | 0.1.1 | 0.1.1 on npm (v0.2.0 on main) | **BLOCKER** | See Section 4 |

---

## 4. Search-and-replace blocker and upstream status

### The blocker

`@sereneinserenade/tiptap-search-and-replace@0.1.1` (published
2024-01-27) declares peer `@tiptap/core: ^2.x.x` only. Prevents
clean `npm install` with TipTap 3 anywhere in the dependency
tree.

### Usage surface in Bibliogon

Single import + registration in [Editor.tsx](../../frontend/src/components/Editor.tsx):

- L27: `import SearchAndReplace from "@sereneinserenade/tiptap-search-and-replace";`
- L251-254: `SearchAndReplace.configure({ searchResultClass: "search-result", disableRegex: true })`

UI is Bibliogon-owned (custom search bar, L983-1028). Package is
purely programmatic. Commands consumed: `setSearchTerm`,
`setReplaceTerm`, `nextSearchResult`, `previousSearchResult`,
`replace`, `replaceAll`. Regex explicitly disabled.

### Upstream has already fixed it

- PR [#18](https://github.com/sereneinserenade/tiptap-search-and-replace/pull/18)
  "Support TipTap 3 package compatibility" **merged 2026-04-05**
  into `main`
- Commit `2b1b7c69` contains the final TipTap 3 compatibility
- New peer declarations: `@tiptap/core: ^2.0.0 || ^3.0.0`, same
  for `@tiptap/pm` (dual support, covers both v2 and v3)
- package.json on `main` at v0.2.0
- npm publish workflow added in commit `5f47bcf8` (publishes
  automatically on GitHub release)
- **Not yet published to npm.** Registry latest = 0.1.1. No
  v0.2.0 tag or release yet.

### License verified

- Repository has MIT LICENSE file:
  `MIT License. Copyright (c) 2023 Jeet Mandaliya`
- package.json on main v0.2.0 declares `"license": "MIT"`
- npm registry listing for 0.1.1 previously read "Proprietary"
  (stale artifact of the 2024 published package.json missing the
  license field). **Actual licensing is MIT throughout.**
- Safe for use in Bibliogon's MIT codebase.

### Upstream coordination

- Issue filed: [sereneinserenade/tiptap-search-and-replace#19](https://github.com/sereneinserenade/tiptap-search-and-replace/issues/19)
- Date filed: 2026-04-21
- Request: cut v0.2.0 tag to trigger automated publish via the
  new CI workflow
- Review by: **2026-05-05** (2 weeks from filing)

### Alternatives evaluated

Option B from the original analysis — find an alternative
package — was investigated.

- **`prosemirror-search`** (by Marijn Haverbeke, ProseMirror
  author): MIT, v1.1.0, maintained. Not a TipTap extension but a
  ProseMirror-level plugin. Usable under TipTap 3 via `@tiptap/pm`
  with a thin adapter extension (~50-80 LOC). Authoritative
  maintainer. **Viable fallback.**
- **`@tiptap/extensions` meta-package**: exports
  `character-count`, `drop-cursor`, `focus`, `gap-cursor`,
  `placeholder`, `selection`, `trailing-node`, `undo-redo`. **No
  search-and-replace.** Confirmed by inspecting exports and
  tarball contents.
- **Easy-Martin/tiptap_search_replace_plugin**: personal GitHub
  repo, 5 stars, not on npm, low-trust signal. Not viable.
- No other npm package matches.

### Decision path

Three possible outcomes after the upstream issue:

1. **Maintainer publishes v0.2.0 (preferred):** zero code
   changes needed beyond the version bump in `package.json`.
   Cleanest migration.
2. **Maintainer unresponsive by 2026-05-05:** switch to
   `prosemirror-search` adapter. Higher initial cost (50-80 LOC
   adapter) but eliminates the external-maintainer dependency
   and is future-proof with an authoritative maintainer.
3. **Maintainer responds but can't release soon:** interim
   option — pin `@sereneinserenade/tiptap-search-and-replace` to
   a git URL at commit `2b1b7c69` in `package.json`. Functions as
   a bridge until npm release lands.

---

## 5. Other breaking changes (non-blocker)

Captured for the migration session so nothing is rediscovered
under time pressure:

- **StarterKit v3 bundles additional extensions.** v3 StarterKit
  dependencies include `extension-link`, `extension-underline`,
  `extension-list`, list-keymap, etc. Bibliogon currently
  imports some of these explicitly in Editor.tsx. Expect
  de-duplication work (remove redundant imports or rely on
  StarterKit defaults).
- **Custom Extension API signatures.**
  [StyleCheckExtension.ts](../../frontend/src/extensions/StyleCheckExtension.ts)
  wraps a ProseMirror Plugin via `Extension.create({
  addProseMirrorPlugins() })`. Verify signature compatibility in
  v3; core API is stable but import paths may shift.
- **ProseMirror dep bumps.** `@tiptap/pm` in v3 bumps transitive
  ProseMirror packages. Review no breaking change hits our PM
  imports in `StyleCheckExtension.ts`
  (`@tiptap/pm/state`, `@tiptap/pm/view`, `@tiptap/pm/model`).
- **Override block.** `frontend/package.json` `overrides` pins
  `@tiptap/core: "2.27.2"`. Must update to v3 or remove to allow
  resolution.
- **`useEditor` React internals reworked.** Already partially
  mitigated in commit 7507e40 via `useEditorState`. Remaining
  inline `editor.storage` reads should be audited for the same
  pattern.

---

## 6. Migration plan (when unblocked)

### Scope

Single dedicated session targeting:

- Bump all `@tiptap/*` core and extension packages to 3.x
- Update community extensions: `@pentestpad/tiptap-extension-figure`
  1.0.12 → 1.1.0, `tiptap-footnotes` 2.0.4 → 3.0.1
- Apply search-and-replace solution (Option 1/2/3 from Section 4)
- Remove `@tiptap/core` pin from `package.json` overrides (or
  update to v3)
- Adjust Editor.tsx, Toolbar.tsx, StyleCheckExtension.ts for API
  changes surfaced in Section 5
- Verify all 405 Vitest tests + Playwright smoke 169/1 still
  green

### Estimated effort

- Code work: **4-8 hours**
- Regression verification: **1-2 hours** across the test gate
  (make test + full Playwright smoke + tsc + vite build)

### Sessions

- **Session 1:** migration itself, single focused session
- **Session 2 (optional):** re-test Issue #12 (editor word
  count). If TipTap 3 CharacterCount + useEditorState path fixes
  the reactivity issue, #12 closes gratis. If not, dedicated
  debug session.

---

## 7. Triggers for starting migration

- **Primary:** `@sereneinserenade/tiptap-search-and-replace@0.2.0`
  published to npm (upstream unblocks)
- **Fallback after 2026-05-05:** switch to `prosemirror-search`
  adapter path. Migration proceeds independent of upstream
  timeline.
- **Accelerant:** if another dependency update forces a TipTap 3
  requirement (unlikely in next 3-6 months; flag when seen in
  routine `npm outdated`).

---

## 8. Out of scope

- Implementing the migration (waiting for trigger)
- Pre-building the `prosemirror-search` adapter (only if fallback
  activates)
- Modifying `Editor.tsx` or any editor-touching files
- Updating `package.json` dependency versions
- Any code changes in this exploration session

---

## 9. Cross-references

- [children-book-plugin.md](children-book-plugin.md) —
  architectural precedent for a deferred feature
- [article-authoring.md](article-authoring.md) — precedent for a
  deferred initiative with a validation plan
- [dependency-strategy.md](dependency-strategy.md) — dependency
  currency rules; DEP-02 follows the major-bump-in-own-session
  pattern
- [../ROADMAP.md](../ROADMAP.md) — DEP-02 tracking entry
- [../../frontend/package.json](../../frontend/package.json) —
  current TipTap pins
- [../../frontend/src/components/Editor.tsx](../../frontend/src/components/Editor.tsx)
  — primary file affected
- [../../.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md)
  — TipTap peer-dependency drift notes under "Peer dependencies"
