# Lessons learned: Frontend

TipTap, React, CSS, Radix, Vite/TypeScript, service worker, IndexedDB.

Index of every entry: `.claude/rules/lessons-learned.md`. Moved here from that file unchanged (#1141).

## TipTap image node in Bibliogon is `imageFigure`, not `image`

Bibliogon's editor ([frontend/src/components/Editor.tsx](../../../frontend/src/components/editor/Editor.tsx)) does NOT load `@tiptap/extension-image`. It loads `@pentestpad/tiptap-extension-figure`, which registers its node under `name: "imageFigure"`. `@tiptap/extension-image` IS in `package.json` but is never imported.

Consequence: any TipTap doc that contains a plain `{type: "image", ...}` node fails the editor's strict ProseMirror schema. The unknown node breaks doc construction and the editor renders empty — for the WHOLE doc, not just the image.

Anyone writing an HTML→TipTap converter, a TipTap-emitting importer, or generating TipTap JSON from any other source (AI, scraper, migration) MUST emit `imageFigure`, not `image`. Same attrs (`{src, alt, title}`) — the imageFigure node spec is `content: "inline*"` so omitting `content` is fine; the schema accepts both `{type, attrs}` and `{type, attrs, content: []}`.

Symptom of the wrong type: title + metadata appear in the editor chrome, the editor body is empty, no console error in the browser (ProseMirror logs the schema rejection at debug level only). The article-list dashboard shows everything fine because it reads `Article.title` directly, not `content_json`. The bug is invisible until someone actually opens the editor.

Why this is easy to miss:
- TipTap's official docs and tutorials universally use `image` in code samples, so any importer modeled on those docs gets the type wrong by default.
- The toolbar's image-upload button works regardless: `Figure.addCommands.setImage(...)` dispatches an `imageFigure`-typed node internally, masking that the schema doesn't accept the literal name `image`.
- The editor's own markdown serializer at [Editor.tsx:1396](../../../frontend/src/components/editor/Editor.tsx#L1396) handles `type === "image"` as if it expected to see one, which is misleading; the serializer is reading nodes already in the doc, where they would only appear if some other extension produced them.

If a switch to `@tiptap/extension-image` ever happens (e.g. dropping the Figure extension), be aware that both extensions register a `setImage` command. Adding both side-by-side will silently shadow one toolbar behavior.

Walker shipped with this bug originally (commit `b986397`); fix landed in `cfd8b57` along with a regression-pin test in `tests/test_walker.py::test_image_node_type_is_imageFigure_not_image` that fails loudly with the actionable error message if the type ever regresses to `image`. A one-time data-fix script at `scripts/fix_medium_import_image_nodes.py` patched the 209 already-imported articles (152 had image nodes; 451 nodes total renamed).

## TipTap editor

### Storage format
- TipTap stores as JSON. NOT HTML, NOT Markdown.
- TipTap CANNOT render Markdown. Markdown must be converted to HTML before storage.
- On import: convert Markdown files to HTML with the Python `markdown` library, then store as TipTap JSON.
- When switching WYSIWYG -> Markdown: convert JSON to Markdown (nodeToMarkdown).
- When switching Markdown -> WYSIWYG: convert Markdown to HTML, then to JSON.

### Extensions
- StarterKit does NOT include an image extension. @tiptap/extension-image is required separately.
- Figure/Figcaption: use @pentestpad/tiptap-extension-figure, NO custom code.
- Character count: use @tiptap/extension-character-count, NO custom code.
- Currently 15 official + 1 community extension installed (see CLAUDE.md).
- Before writing custom code, ALWAYS check whether an official TipTap extension exists.

### Peer dependencies
- Community extensions (@pentestpad/tiptap-extension-figure, tiptap-footnotes) can silently upgrade to @tiptap/core v3. Always pin with --save-exact.
- @pentestpad/tiptap-extension-figure: pin to 1.0.12 (last v2-compatible); 1.1.0 requires @tiptap/core ^3.19.
- tiptap-footnotes: pin to 2.0.4 (last v2-compatible); 3.0.x requires @tiptap/core ^3.0.
- `npm ci` in CI fails on peer-dep conflicts. Do NOT use --legacy-peer-deps as a fix.

### CSS
- TipTap renders inside .ProseMirror. CSS selectors have to account for that.
- Specificity: `.ProseMirror p.classname` instead of `.tiptap-editor classname`.
- All styles MUST work through CSS variables (3 themes x light/dark = 6 variants).

## TypeScript 6 no longer auto-includes all `@types/*`

- TS 5 silently included every `@types/*` package from `node_modules` when the `types` compilerOption was absent. TS 6 stopped doing this: if `@types/node` is installed transitively but not named in `types`, `import fs from "node:fs"` fails with `TS2591: Cannot find name 'node:fs'`.
- Concrete: `frontend/src/components/ChapterSidebar.test.tsx` imports `node:fs`/`node:path` to load fixture data. Worked under TS 5 (`@types/node` came in transitively via `happy-dom`/`vite`/`vitest`). Broke on TS 6 bump.
- Fix: add an explicit `@types/node` devDependency AND list it in `tsconfig.json` under `"types": ["node", "vite/client"]`. Both halves are needed - installing the package alone does not bring it in on TS 6.
- Applies going forward: any `@types/*` you want in scope under TS 6 must be named in `types` explicitly.

## `@types/node` major bumps cascade into tsconfig `lib`

- `@types/node@22` shipped polyfilled lib augmentations (e.g. typing `Array.prototype.at()` even under `lib: ES2020`). `@types/node@24` dropped them, deferring entirely to whatever lib the project declares. Symptom on a ^22 → ^24 bump: `TS2550: Property 'at' does not exist on type 'any[][]'. Do you need to change your target library? Try changing the 'lib' compiler option to 'es2022' or later.` even though no source code changed.
- This is NOT a breakage in `@types/node`; it is correct behavior. The earlier convenience was the anomaly.
- Fix at the consuming repo: bump `tsconfig.json` `target` and `lib` to `ES2022` together with the `@types/node` major bump. `Array.prototype.at()` is ES2022 standard library. Vite 8 / esbuild emit ES2022 fine; runtime is Node 24 / modern browsers. Zero source-side changes required.
- General rule: when bumping `@types/node` across majors, run `tsc --noEmit` in the same change window. If it newly fails on stdlib globals, bump `lib` to match the runtime ES level - do NOT carry per-call workarounds (`as any[]`, casts) and do NOT pin `@types/node` back to the old major.
- Concrete bump landed 2026-05-07 in commit on `main` after the v0.28.0 cycle: `^22.19.17` → `^24.12.2`, `target` + `lib` ES2020 → ES2022, 8 `.at(-1)` sites in `PreviewPanel.test.tsx` cleared without modification.

## Vite 7 requires Node 20.19+ / 22.12+

- Vite 7 uses Node's `crypto.hash` top-level API which landed in Node 20.12+ / 21.7+ (backported to 22 LTS). On Node 18, `vite build` fails with `[postcss] crypto.hash is not a function` coming from `vite-plugin-pwa`'s postcss handling. The error is misleading: it is not a PWA/postcss bug, it is a Node version issue.
- Vitest 4 does NOT exercise the same code path, so `npm run test` can still pass on Node 18 even though `npm run build` fails. Do not rely on tests alone to validate a Vite major bump; always build too.
- CI runs Node 24 (`.github/workflows/{ci,coverage}.yml`), which is fine. Local envs on Node 18 must upgrade to Node 24+.

## Vite 8 migration (DEP-09 + SEC-01)

- `vite-plugin-pwa@1.3.0` (published 2026-05-06) added Vite 8 to its peer-dep range (`^3.1.0 || ^4 || ^5 || ^6 || ^7 || ^8`) and unblocked the bump. The CVE chain `workbox-build` -> `@rollup/plugin-terser` -> `serialize-javascript` (3 high-severity advisories: GHSA-5c6j-r48x-rmvq RCE + GHSA-qj8w-gfj5-8c6v DoS) clears as a side effect; `npm audit --audit-level=high` returns zero high findings after the bump. The unrelated moderate `uuid` advisory (GHSA-w5hq-g745-h8pq) stays open and is its own track.
- **Vite 8 (Rolldown) requires `manualChunks` as a function, not an object.** Vite 7 used Rollup, which accepted both forms. Vite 8 ships Rolldown by default, which only accepts the function form. Symptom: `Invalid output options ... For the "manualChunks". Invalid type: Expected Function but received Object` followed by `TypeError: manualChunks is not a function at rolldown/dist/shared/...`. Fix: convert the package-list-per-chunk object to a function that matches the module id and returns the chunk name. Use a trailing slash (`id.includes('/node_modules/${pkg}/')`) to prevent prefix collisions (`react` vs `react-dom` vs `react-router-dom`). The `id` is always an absolute path; bare-package matching is unreliable.
- DEP-04 landed Vite 6 -> 7 deliberately because vite-plugin-pwa 1.2.0 did not yet ship Vite 8 compat; DEP-09 + SEC-01 paired in one session because both items resolve on the same upstream release.
- Vitest 4 covers the matrix `vite: ^6 || ^7 || ^8`; bumping Vite alone keeps Vitest configuration untouched. The `@vitest/coverage-v8` peer-dep is exact-pinned to its own Vitest version, so when bumping Vitest itself bump both in lockstep or `npm install` will downgrade the parent.
- The check that caught this in production was the build step, not the test step (per `lessons-learned.md` rule "Do not rely on tests alone to validate a Vite major bump; always build too"). Vitest 707/707 passed with the broken `manualChunks` config. `npm run build` was the first signal.

## Global CSS rules: distinguish viewport containers from app container

Setting `overflow: hidden` on `html, body, #root` as a single rule blocks document scroll but also blocks every full-page component that relied on scroll (Settings, Dashboard, GetStarted, Help).

Correct pattern when preventing document-level scroll for editor zoom behavior:

```css
html, body { height: 100%; overflow: hidden; }  /* viewport lock */
#root { height: 100%; overflow-y: auto; }       /* app scroll */
```

html and body control the browser viewport. `#root` is the React application root and must remain scrollable for pages that don't implement their own scroll container.

When a layout fix requires setting `overflow: hidden` on one of the three, think explicitly about whether full-page components inside the app need internal scroll, and expose it via `#root`.

### Incident record

- `ef7ce5c`: added `html, body, #root { overflow: hidden; }` as fix for Issue #11 (chapter sidebar at 150% zoom). Broke scroll on Settings, Dashboard, GetStarted, Help pages.
- `c25483e`: split the rule. Kept html/body locked (preserves zoom fix), restored `#root overflow-y: auto`.

## Split-button (default + chevron disclosure) for primary + alternative outputs

Surfaced 2026-05-14 designing the v0.32.0 F3 Copy button.
When a feature has two outputs where one is the obvious
90%-case default and the other is a discrete alternative
("Copy as Markdown" vs "Copy as plain text"), use a
split-button: a primary action button glued to a chevron
disclosure that exposes the alternative.

Anti-patterns this avoids:

- **Two equal-weight buttons** ("[Copy MD] [Copy plain]"):
  forces the user to make a format decision in technical
  jargon every time, even when they know they want the
  default. Doubles the toolbar footprint.
- **A modal "Copy options" dialog**: extra round-trip for
  the 90%-case; users have to read + click to confirm what
  they already wanted.
- **Right-click context menu only**: invisible to anyone
  who doesn't know to right-click. Discoverability dies.

Implementation pattern (verified in F3):

- Primary button + chevron use the same Radix
  DropdownMenu trigger that's already in the codebase.
- The dropdown menu has the primary action first (so a
  user who opens the menu by mistake doesn't have to
  re-orient) plus the alternative below it.
- The primary button's default click bypasses the menu
  entirely — one click, no flicker.
- Tooltip on the chevron says "More options" / "Copy
  options" so users know it expands the action set.

Cross-platform precedent: GitHub's "Squash and merge" /
"Create a merge commit" / "Rebase and merge" split button,
Notion's "Copy" → "Copy link" / "Copy as Markdown" picker,
Linear's view-switcher. The pattern is well-understood.

When NOT to use a split-button:

- Three or more alternatives at roughly equal weight: use
  a full menu, not a split. Cognitive load of "pick one of
  three" is higher than "default plus one alternative".
- The alternatives have no clear primary: use a regular
  dropdown.
- The action is destructive: a split-button can fire the
  primary by accident. Use a confirm dialog instead.

## Workbox "No route found" is benign info, not a bug indicator

Established 2026-05-14 after Bug A's user-reported Articles-Trash
Restore-Button "broken" symptom resolved as **not a code bug** —
the restore worked end-to-end; the workbox console message was
misread as causal.

### The trap

Bibliogon's SW config has a single `urlPattern: /^\/api\//`
runtime-cache rule registered for `'GET'` only. **Every non-GET
API call** (every POST, PATCH, DELETE) triggers a Workbox
`No route found for: <url>` console message. **This is
informational — it means "no runtime-cache rule applied,
falling through to default fetch"**, which is exactly the
intended pass-through behavior.

Bibliogon ALSO has `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` in
workflows and SW dev-tools that show precaching-attempt logs for
every API URL. None of those messages indicate an error.

### What an actual SW block looks like

If Workbox were genuinely blocking a request, you'd see:
- The request NEVER appearing in the Network tab (filtered to
  XHR/Fetch).
- A console error like `Failed to fetch` from the application
  code that initiated the request.
- The application code's `.catch()` branch firing.

You would NOT see a successful 2xx response in the Network tab
AND a "No route found" workbox info line — those two together
prove the request DID reach the network and DID succeed.

### Diagnostic recognition pattern

When a user reports "feature X is broken" + cites a workbox
console message as evidence:

1. **Verify the network actually fired**: open Network tab, look
   for the expected request, check its status code.
2. **Verify the backend processed it**: hit the relevant API
   endpoint via curl to check current state.
3. **Cross-check with the parallel feature**: if Books works
   and Articles doesn't, see whether the SW route is actually
   asymmetric in `vite.config.ts` (in Bibliogon's case it's not
   — single rule covers all `/api/*`).
4. **Read the workbox doc text literally**: "No route found"
   ≠ "blocked"; it's "no special handling, default fetch
   proceeds".

### Bug A reframe (the actual 2026-05-14 finding)

Once the workbox red-herring was cleared, the real signal was
the `[Violation] 'click' handler took 419ms` log entry. The
restore worked correctly; it just felt sluggish because
`handleRestore` chains two network roundtrips (`POST .../restore`
+ `GET /articles`) inside a single click handler with `setTrash`
+ `setArticles` synchronous state updates in between. 419ms is
within "perceived as slow" range for UI feedback.

The user-reported "broken" was actually "feels broken due to
perception lag + subtle feedback". Real fix path is optimistic
update + clearer post-restore feedback (filed as
`RESTORE-UX-FEEDBACK-01` in the backlog).

### Rule

When triaging a "feature broken" report that includes a workbox
console message:

- Don't accept the workbox log as bug-causal evidence without
  the corroborating Network-tab + backend-state check.
- Re-frame the symptom: ask "what did the user actually
  observe?" vs "what diagnostic message did the user notice?".
  The two often don't match — users tend to grep the console
  for red-looking text and report that as "the bug".

### Pairs with

The existing "Audit findings need production-vs-dev environment
classification before urgency-tier" rule. Same root cause:
acting on surface-level evidence without verifying against the
authoritative source (in that case, the dev vs prod Docker
config; here, the actual network state).

## Periodic theme-token completeness audit as pre-release hygiene

**Recurring-issue-class observed 2 times across 2 release cycles.**

Bibliogon's theming system uses CSS custom properties
(``var(--token, #hex-fallback)``) for color, spacing, and shadow
tokens. Each token must be defined in all 10 theme variants
(5 palettes × light/dark). When a token is undefined in one
palette, the hex fallback leaks through, producing visually
wrong rendering that's invisible to all UI tests because the
fallback IS a valid color.

### Concrete occurrences

1. **v0.31.0 Pre-Release Audit D3** identified 9 components
   silently falling through to hex when ``--surface-2``,
   ``--danger-bg``, ``--success``, ``--warning`` were undefined
   in some palettes. Fix: added the missing tokens.
2. **2026-05-15 UX-Full-Audit (G4-F4)** inventory:
   ``grep -rhE 'var\(--[a-z-]+, *#' frontend/src/`` returned
   **111 callsites** of the same fall-through-vulnerable pattern.
   Token-vs-palette cross-check not yet performed.

### Rule

**Theme-token completeness audit MUST be part of every
release-cycle pre-release sweep** — alongside ``poetry show
--outdated`` and the test-count verification.

### Audit recipe

```bash
# 1. Inventory every var(--token, #fallback) callsite.
grep -rhE 'var\(--[a-z-]+, *#' frontend/src/ \
  --include='*.tsx' --include='*.ts' --include='*.css'

# 2. Extract the unique --token names referenced.
grep -rhoE 'var\(--[a-z-]+' frontend/src/ \
  --include='*.tsx' --include='*.ts' --include='*.css' \
  | sort -u

# 3. For each --token, check it's defined in all 10 palette
#    × mode combinations in frontend/src/styles/global.css.
#    Missing definitions = the fall-through bug.

# 4. Optionally: add an ESLint rule that flags
#    var(--token, #fallback) usage and require either
#    var(--token) (no fallback — forces existence) OR a
#    documented exception comment.
```

### Pairs with

The existing "Boy Scout rule" + the audit's filed
``THEME-TOKEN-COMPLETENESS-AUDIT-01`` backlog item. Together they
formalize the cadence: ad-hoc fix when an issue fires (the v0.31.0
patch) is reactive; pre-release sweep with the grep recipe above
is proactive.

## Menu-Dialog Lifecycle: do not `preventDefault` inside `onSelect`

Radix `DropdownMenu.Item` (and the sibling `ContextMenu.Item`)
auto-closes the surrounding menu on item-select by default —
that's the desired UX. Calling `e.preventDefault()` inside the
`onSelect` handler suppresses the close. If the handler then
opens a dialog (AppDialog confirm, TypeToConfirmDialog, any
Radix Dialog the parent controls imperatively), the dialog
floats above a still-visible menu — overlapping UI, confused
focus management, and a violation of the "one modal surface at
a time" UX contract.

### Rule

A `DropdownMenu.Item`'s `onSelect` MUST NOT call
`e.preventDefault()` when the handler triggers a dialog. The
default close-on-select is what you want. Let Radix close the
menu; THEN the dialog mounts against a clean stage.

### Why this trap is easy to fall into

Two common mental models lead developers to add the
`preventDefault`:

1. **"I want the menu to stay open while the dialog confirms."**
   A reasonable instinct, but it's the wrong UX contract. Once
   the user picks "Endgültig löschen", the menu's job is done —
   the next decision happens in the dialog. Leaving the menu
   visible behind the dialog adds visual noise and competes for
   focus.
2. **"I'm worried about double-fires or focus-bouncing."**
   Radix handles that internally. The auto-close transition
   precedes the imperative dialog open in your handler, so the
   focus moves from menu trigger → dialog confirm button cleanly.

### Positive precedent (the bulk-action bars)

The Article / Book / Comment bulk-action bars (see
`frontend/src/components/articles/ArticleBulkActionBar.tsx`,
`BookBulkActionBar.tsx`,
`comments/CommentBulkActionBar.tsx`) all use the correct
pattern:

```tsx
<DropdownMenu.Item onSelect={() => onBulkDeletePermanent()}>
    Endgültig löschen
</DropdownMenu.Item>
```

No event arg, no `preventDefault`. The dialog opens after the
menu has finished closing. This pattern has been in production
since 2026-04 and works correctly — it's the precedent every
other surface should match.

### Anti-pattern

```tsx
// WRONG — menu lingers around the dialog
<DropdownMenu.Item onSelect={(e) => {
    e.preventDefault();
    onDeletePermanent();
}}>
    Endgültig löschen
</DropdownMenu.Item>
```

Bug 6 (2026-05-16) shipped this anti-pattern across 6 surfaces:
`ArticleCard`, `BookCard`, `BookListView` (the trash + permanent
items), `pages/ArticleEditor` (reclassify), `Toolbar` (Copy
split-button items), `pages/Dashboard` (theme toggle). The fix
in commit `02fc66b` simplified each callsite to
`onSelect={() => handler()}`.

### Detection recipe (automatable)

```bash
grep -rnE 'onSelect.*e\.preventDefault|onSelect=\{?\(e\)' \
  frontend/src/components/ frontend/src/pages/ \
  --include='*.tsx' --include='*.ts'
```

Any match outside of a clearly-justified case (e.g. a Copy
menu where the user *intentionally* wants the menu to stay
open for a follow-up copy-action AND the handler does NOT
trigger a dialog) is a Bug-6 regression candidate. Future
audits can wire this grep into a pre-commit hook or a CI
check; the fix is mechanical (remove `preventDefault`, drop
the `(e) =>` wrapper) and the regression-pin lives in
`e2e/smoke/menu-dialog-close.spec.ts`.

### Exceptions

The rule covers `onSelect` handlers that **trigger dialogs**.
The same `preventDefault` call would be the *right* answer in
narrowly-scoped cases where you legitimately need Radix to NOT
auto-close — for example:

- An "advanced options" sub-flow where the menu stays open
  while a popover-style inline panel expands beneath the
  item. (Not currently used in Bibliogon.)
- A multi-step picker where each click reveals another tier
  of the same menu. (Use Radix `DropdownMenu.Sub` instead —
  the composed sub-menu has the right semantics natively.)

If you're about to add `preventDefault` for any other reason,
the answer is almost always that you want a different Radix
primitive (Sub, Popover) — not a workaround.

### Pairs with

- "Radix DropdownMenu + happy-dom is brittle for Vitest" —
  the reason this rule's regression pin lives in E2E
  (`e2e/smoke/menu-dialog-close.spec.ts`), not Vitest.
- "Split-button (default + chevron disclosure) for primary +
  alternative outputs" — the Toolbar Copy split-button is one
  of the Bug-6 surfaces; the fix preserves the split-button
  pattern while removing the lingering-menu UX smell.

## CSS-first beats per-component fixes for visual consistency

Surfaced 2026-05-30 from the full component-consistency sweep
(~40 commits unifying buttons / selects / inputs / checkboxes /
sliders / badges / cards). The recurring finding: every "the
same control looks different on screen X vs Y" bug traced back
to the look being **re-implemented per component** — a CSS-module
`.card`/`.btn`/`.select` re-declaring the shared surface, an
inline `style={{background, color, padding}}`, or a
`var(--token, #hex)` fallback — instead of a single global class
keyed off tokens.

Concrete proof points from the sweep:

- A one-line `input[type="checkbox"] { accent-color: var(--accent) }`
  themed **all 52 checkboxes** at once. The per-component
  alternative was 52 inline `accentColor` edits that would drift
  the next time any two were touched separately.
- The audit over-counted "inconsistent" buttons/selects/inputs by
  ~3x: most "duplicates" were actually thin layout supplements on
  top of an already-global class (fine), OR genuine re-declarations
  of the shared look (the real bug). The classifier that mattered
  was "does this CSS-module class re-state background/border/
  radius/color, or only layout?" — re-stated surface = duplication.
- `verify-theme` (token completeness + 96 WCAG contrast checks +
  hardcoded-hex lint) can only see tokens + global classes. Every
  dark-mode/contrast regression the sweep fixed hid in an inline
  `style` or a hex fallback — exactly the places the gate is
  blind to. So inline-style/hex aren't just drift risk; they're
  where the *un-auditable* bugs live.

The discipline (now `coding-standards.md` "CSS-first for visual
consistency"): a control's look comes from a global class
(`.btn*`/`.input`/`.slider`/`.radix-select-trigger`/`.badge*`/
`.card*`) or a shared component, with only layout deltas in a
CSS-module supplement. Inline `style` is for computed/dynamic
values only (drag transforms, `width: ${pct}%`, image URLs).
Hardcoded hex — even as a `var(--token, #fallback)` — is
forbidden outside the allowlisted data-color exemptions.

Pairs with: the "Periodic theme-token completeness audit" rule
(the gate this discipline keeps effective) and the
Recurring-Component-Unification Rule in `coding-standards.md`
(shape-level unification; this is the look-level counterpart).

## Store IndexedDB binary as ArrayBuffer, not Blob (fake-indexeddb round-trip)

Filed 2026-06-06 (P3c offline assets). When persisting binary (image
bytes, file uploads) in IndexedDB via Dexie, store the bytes as a raw
`ArrayBuffer`, NOT a `Blob`. Reconstruct the Blob on read:
`new Blob([row.data], { type: row.mimeType })`.

Why: a `Blob` stored and read back through the test stack
(happy-dom + `fake-indexeddb`, which clone via the environment's
`structuredClone`) loses its prototype methods — the retrieved object
has neither `.text()` nor `.arrayBuffer()` (`TypeError: blob.arrayBuffer
is not a function`), so the round-trip is untestable and the value is
effectively opaque. A real browser stores Blobs fine, but the test
environment does not, and you want the data layer covered by Vitest.
`ArrayBuffer` structured-clones losslessly in EVERY implementation
(Node, happy-dom, browsers), is equally efficient (binary, not base64),
and the service worker reads it directly into a `Response`
(`new Response(arrayBuffer, { headers: { 'Content-Type': mimeType } })`)
while the resolver wraps it into a `Blob` for `createObjectURL`.

Extraction helper (handles an input File whose `.arrayBuffer()` may be
absent in older happy-dom): try `blob.arrayBuffer()`, else `FileReader`.
See `storeAssetBlob` / `getBlob` in
`frontend/src/storage/dexie-storage.ts`. The handover note "store images
as native Blobs (base64 is wasteful)" was right to avoid base64 but
wrong on Blob-vs-ArrayBuffer — ArrayBuffer is the testable, equally
non-wasteful choice.

## Service-worker intercept is the right tool for non-React-owned URLs — but is untestable in the SW-less dev E2E

Filed 2026-06-06 (P3c offline assets). Two facts that shape any
"serve-from-IndexedDB" feature in Bibliogon:

1. **A sub-path-scoped SW DOES intercept root-absolute `/api/...`
   requests.** GH Pages serves the app under `/bibliogon/`; the SW scope
   is `/bibliogon/`, and `BASE = "/api"` makes asset URLs root-absolute
   (`/api/books/...`, outside that path). Scope limits which *pages* the
   SW controls, NOT which *request URLs* it sees: once it controls a
   page, it gets that page's fetches (and `<img>` loads) to ANY path. So
   the intercept works on GH Pages despite the scope/path mismatch.

2. **The offline E2E runs against `npm run dev`, where the SW is disabled
   (`devOptions.enabled: false`).** So an SW intercept is invisible to
   the dev-server Playwright suite, and the hard `route.abort('**/api/**')`
   gate would catch any `<img src="/api/...">` the SW would otherwise
   serve. A pure-SW approach cannot be E2E-verified there.

Design rule: **hybrid**. For images whose `<img>` element you CONTROL
(covers, cards, thumbnails), use a resolver hook (`useAssetUrl`) that
returns a `blob:` URL offline — works without the SW, so it is
E2E-testable in dev AND fires zero `/api`. For URLs you do NOT control at
render time (embedded inside TipTap bodies; id-served images rendered by
a string `src`), the SW intercept is the only option — production-only,
build-validated, NOT unit/E2E covered. Pin the SW's URL-shape regexes in
a Vitest (the SW file can't be loaded — top-level `self.addEventListener`)
and flag the IndexedDB read path as a known coverage gap for Aster's
live-build verification.

`workbox.importScripts` (generateSW mode) adds a dependency-free custom
fetch listener at the top of the generated SW; it `respondWith`s only the
asset URLs and returns for everything else, so it composes with Workbox's
own routing without a race (the existing `/^\/api\//` regex doesn't match
full URLs, so there's no conflict). This avoids migrating to
`injectManifest`. See `public/asset-intercept-sw.js`.

## react-router setSearchParams: multiple calls in one tick clobber (stale snapshot)

Filed 2026-06-10 (BookEditor chapter-switch blocker, fix `8288adec`).
In react-router (verified on v7.16), calling `setSearchParams` more than
once inside the same event handler / tick CLOBBERS: each call resolves
its argument against the **render-time `searchParams` snapshot**, not the
state produced by the prior call's navigate. The second `navigate` wins
and overwrites the first's param.

Crucially, the **functional updater form does NOT save you**. The hook is
implemented as:

```js
const newSearchParams = createSearchParams(
  typeof nextInit === "function"
    ? nextInit(new URLSearchParams(searchParams))   // <- closure value, stale
    : nextInit,
);
navigate("?" + newSearchParams, navigateOptions);
```

`nextInit(prev)` receives `new URLSearchParams(searchParams)` from the
render closure. Within one synchronous tick `searchParams` (memoised off
`location.search`) has not recomputed, so a second call's `prev` is the
SAME stale value as the first's — the functional form reads exactly what
the value form reads. It does not see the param the first call just set.

### Concrete incident

BookEditor's chapter-select handler did two writes in one tick — set
`?chapter=` (via `setActiveChapterId`) then clear `?view=` (via
`_setShowMetadata(false)`). Both built `URLSearchParams` from the same
stale snapshot; the view-clear navigate clobbered the chapter set, so
`?chapter=` never changed and the content-load effect kept the previous
chapter on screen. Symptom: clicking a sidebar chapter did nothing.

### Rule

When an action needs to change MORE THAN ONE search param, do it in a
SINGLE `setSearchParams` call that mutates all of them:

```js
setSearchParams((prev) => {
  const params = new URLSearchParams(prev);
  params.set("chapter", id);
  params.delete("view");
  return params;
}, { replace: true });
```

One call → one navigate → no clobber. Do NOT chain
`setActiveChapterId(id)` + `_setShowView(false)` and expect both to land.

### Detection

Grep a component for two `setSearchParams` (or helpers that wrap it) in
the same handler body:

```
grep -nE "setSearchParams|_setShow[A-Z]|setActiveChapterId" <file>.tsx
```

Two such calls reachable in one event handler that touch DIFFERENT params
are a clobber candidate. (Two calls that BOTH unconditionally `set` the
SAME param are safe — the last set wins, which is the intended result.)

### Regression-pinning

Render the component under a real `MemoryRouter`, add a `LocationProbe`
(`useLocation().search`) sibling, drive the handler, and assert the probe
shows ALL the expected params. Such a test fails on the pre-fix
double-write (`expected '?chapter=a' to contain 'chapter=b'`) and passes
after — a genuine pin. See `BookEditor.test.tsx` "chapter switch updates
?chapter= (regression)".

## God-Folder relocation: ship re-export shims first, remove them in a later batch, keep the CSS module beside the component

Filed 2026-06-20 (#466, the God-Folder campaign close-out). Grouping a flat
`frontend/src/{components,hooks,utils,services}` into single-concern
sub-packages touches hundreds of import sites. Doing the move and the
import-rewrite in one commit produces a giant, un-bisectable, conflict-magnet
change (and races hard against parallel sessions). The campaign instead used a
two-phase shape that stayed green at every step:

1. **Relocate + shim:** move the file into its sub-package and leave a thin
   flat **re-export shim** at the old path (`export * from "./book/BookCard"`).
   Every existing importer keeps working; the diff is a move + one-line shim.
2. **Remove shims + rewrite importers (later batch):** delete the shims and
   rewrite the importers to the new path, in small batches (the campaign ran 7
   batches for components). Each batch is independently green.

Two concrete sub-rules that saved rework:

- **Keep the CSS module beside its component.** When a component moves into a
  sub-package, its co-located `*.module.css` moves WITH it (same folder). Do
  not centralize CSS modules during a structural move — that turns a pure
  relocation into a styling change and breaks the "each commit is one concern"
  property. (The legacy `global.css` stays frozen and in place per the
  Tailwind-first rule; only the per-component CSS module travels.)
- **Ratchet the guard, don't whitelist.** A **directory-size ratchet CI guard**
  (#466 Phase 5) records the post-split baseline and fails if a directory
  regrows past it — so the campaign's win cannot silently erode. Same spirit as
  the `.filesize-baseline` god-file ratchet.

Pairs with "Atomic commits are bounded by 'green individually', not 'one
thing'": the shim is exactly what keeps the intermediate state green so the
move and the rewrite CAN be separate commits.

## Prettier is configured but ungated — respect each file's existing style, never mass-reformat

Filed 2026-06-24 (KDP package session). `frontend/.prettierrc` exists
(`semi: true, singleQuote: false, tabWidth: 4`) but **no gate runs it**: there is
no prettier hook in `.pre-commit-config.yaml`, no prettier step in any
`.github/workflows/*`, and no `format`/`prettier` script in
`frontend/package.json`. Proof it isn't enforced: the committed frontend files do
NOT pass `npx prettier --check` against that very config — e.g. `ExportPackage.tsx`
ships with no semicolons + tight braces (`{useState}`), the opposite of what
`.prettierrc` wants. Different files even use different styles: `api/platform.ts`
is 2-space + semicolons, `components/kdp-wizard/*.tsx` is 4-space + no semicolons.

Consequence: running `npx prettier --write` on a touched file reformats the
**entire** file to the `.prettierrc` style, producing an enormous diff that
diverges from the repo's actual committed style and collides with parallel
sessions (one `--write` turned an 83-line logical change into an 887-line diff).

Rule: do NOT run `prettier --write` (or `--check` as a gate) on this repo. Match
each file's OWN existing style when editing — read the surrounding lines for
indent width, semicolons, and brace spacing, and write additions to match. This
is the same "write code that reads like the surrounding code" principle, here
forced by the absence of an authoritative formatter. If a future session wants
prettier to be authoritative, that is a separate, deliberate repo-wide
reformat-and-gate change — not a side effect of touching one file. (ESLint is in
the same boat: configured via `eslint.config`, run manually, not a CI gate; a
pre-existing `eslint-disable` warning is not yours to "fix" while touching an
unrelated line.)

## Two state machines for one save: the one that reports success is not the one on screen

Filed 2026-10-09 (#1021), found while diagnosing the above.

`useArticlePersistence.persistContent` catches its own failures and does not
rethrow. `useEditorAutosave.performSave` awaits it:

```ts
setSaveStatus("saving");          // the EDITOR's status
try {
    await onSave(json);           // persistContent - catches, never throws
} catch (err) { ... }             // unreachable for a persistence failure
lastSaved.current = json;         // "this content is safely stored"
setSaveStatus("saved");
```

So a dropped write leaves the editor hook convinced the save succeeded: it
advances `lastSaved`, deletes the recovery draft, and reports `saved`. Mean-
while the persistence hook - whose status the header actually renders - never
left `saving`, because its catch only handled `ApiError` (#1021). One component
believes the content is on disk; the other shows a spinner; the content is
nowhere.

The rule: when a callback owns its own error reporting, its caller cannot also
own the success decision. Either the callback rethrows after reporting, so the
caller's catch is reachable, or the caller must not treat a resolved promise as
proof of success. A boundary where both sides have a status field and only one
is rendered is a boundary where the user is told the wrong thing by
construction.

Detection: a `catch` with no `throw` inside a function passed as a callback to
something that awaits it and then records success. Grep for callbacks named
`onSave`/`onSubmit`/`onApply` and check whether the implementation swallows.

## A Node builtin in a browser bundle fails at runtime, and a Node-hosted test suite cannot see it

Filed 2026-10-10 (#1070). Client-side EPUB export threw in every built
bundle - the static GitHub-Pages PWA and the Docker frontend alike, since it
is one bundle - and the Vitest suite was green the whole time.

Vite does not fail a browser build on a bare `require('path')`. It
externalizes it and substitutes a stub whose members are `undefined`. So
`ejs`, reached through `epub-gen-memory`, ran

```js
path.basename(filename, path.extname(filename))
```

and got `r.extname is not a function` - at runtime, in the shipped app,
after a build that printed no error. Vitest runs in Node, where
`require('path')` is the real module, so the suite exercised a code path
that cannot exist in a browser.

The specific trigger was worth tracing because it is not obvious from the
call site: `ejs.render(template, data)` with exactly **two** arguments
copies a fixed list of names out of the DATA into the OPTIONS
(`_OPTS_PASSABLE_WITH_DATA`), and that list contains `'filename'`.
`epub-gen-memory` spreads a chapter object that has a `filename`, so every
chapter render set `opts.filename` and reached the `path` call. Nothing in
the calling code mentions `filename` as an option.

### The rule

A dependency that reaches a Node builtin is a runtime fault in a browser
bundle and an invisible one in a Node-hosted test. Two things follow:

- **Every format a build can emit needs at least one test in a real
  browser against the real bundle.** EPUB had none: the bulk-export spec
  covered Markdown, the picture-book and comic specs covered PDF. The
  format with no browser-level coverage is the format that breaks, and
  component tests cannot stand in for it - this is the Coverage-Illusion
  rule with the environment, rather than the mocking, doing the lying.
- **Alias the shim unconditionally, not per-environment.** One
  implementation that both the build and the suite resolve beats a pair
  that can disagree. (With the caveat worth stating in the config: Vitest
  externalizes node_modules, so a dependency there still gets Node's real
  module - what proves the browser path is the E2E, not the alias.)

### Detection

Find which dependencies in the bundle touch a Node builtin:

```bash
cd frontend
grep -rl "require(['\"]\(path\|fs\|os\|crypto\)['\"])" node_modules \
  --include=*.js --include=*.cjs | sed 's#node_modules/##; s#/.*##' | sort -u
```

Cross-reference against what is actually imported by `src/`. A hit that is
CLI-only (a bundled `commander`, a build script) is fine; a hit on a module
a page imports is this bug waiting for the right input.

### Corollary: verify the test an issue proposes, not just the fix

The #1066 issue filed alongside this one proposed an axe-core assertion
over the form as the class-level pin. Written and run, it **passed against
the broken code**: axe accepts an input's `placeholder` as its accessible
name, so the `label` rule never fired for a label pointing at a
nonexistent id. Measured rather than assumed:

```
WITH placeholder:    []
WITHOUT placeholder: [["label","critical"]]
```

The same shape hit #1065's first draft: three cases counting
`unhandledrejection` events were green before the fix, because happy-dom
does not fire the event. Both were dropped or rewritten rather than shipped.

An issue's suggested test is a hypothesis about what the tool measures.
Run it against the unfixed code first; a green there means the approach
cannot see the bug, whatever its name says.

### Pairs with

- "Coverage Illusion: passing tests != working feature" - the parent. This
  is its environment-shaped instance: not a mock standing in for the real
  thing, but a different runtime providing it.
- "Do not rely on tests alone to validate a Vite major bump; always build
  too" - same family, one step further: the build passes here as well, so
  only running the artifact finds it.
- `coding-standards.md` "A red-pin claim needs the red run linked" - the
  corollary above is that discipline applied to a test someone else
  proposed.
