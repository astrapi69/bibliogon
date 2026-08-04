# Editor menu model — extracting the shipped `EditorMenu` shape into a package

> **Status:** Exploration. Design done and validated against the four shipped
> builders. No repository, no package, no implementation.
> **Scope decided:** the editor-menu family only. Settings navigation and
> primary navigation are explicitly OUT — see §3.
> **Date:** 2026-08-04. **Umbrella issue:** #706.

---

## 1. Context

`lib/components/EditorMenu.tsx` renders a grouped menu from a plain data
structure and dispatches by string id. Four builders feed it:

| Builder | LOC |
|---|---|
| `pages/buildArticleEditorMenu.tsx` | 181 |
| `pages/buildBookEditorMenu.tsx` | 266 |
| `components/comics/buildComicEditorMenu.tsx` | 177 |
| `components/picture-book/buildPictureBookEditorMenu.tsx` | 129 |

That consolidation was deliberate, finished work — issue #382, "reuse the
generic EditorMenu in the Article, Comic and Picture-book editors". The
question here is only whether the *shape* those four share is worth publishing.

### The strongest argument: the transfer already happened, in prose

`docs/SETTINGS-MENU-ARCHITECTURE.md` is 636 lines whose header reads:

> *"A precise, self-contained spec of Bibliogon's Settings menu … Written so
> another project (e.g. adaptive-learner) can rebuild the pattern 1:1 without
> access to the Bibliogon source."*

adaptive-learner's `lib/settings/sidebar-model.ts` plus its two renderers is
the result. The abstraction therefore already exists — as a document that
instructs a human to retype it. That is the most expensive possible form of
reuse, and it is evidence that the shape is genuinely portable.

(That document itself is covered by an obligation, see §7.)

### Second data point: the same command set exists twice

The TipTap editor context-menu command set exists independently in both
repositories — `bibliogon/components/editor/editorContextMenuActions.ts` (228
LOC) and `adaptive-learner/components/editor/editor-commands.tsx` (487 LOC),
roughly the same 30 commands, written separately.

**This is named, not addressed here.** It is a different undertaking: a
duplicated *command set* is a content problem; this document is about a
*shape*. Bundling them because both involve menus would be exactly the
over-generalisation this exploration argues against.

---

## 2. Options evaluated

**A. Do nothing.** Four builders keep sharing one in-repo type. Cost: the
next project retypes 636 lines of prose again. Rejected — the transfer cost is
already proven, and it recurs.

**B. One package covering every menu-like structure** (`menu-core`: editor
menus + settings navigation + primary navigation). Rejected — see §3. The
touchstone test failed, and it failed for a structural reason, not a fixable
one.

**C. One package covering the editor-menu family only** (`editor-menu-model`).
**Recommended.** Validated against all four builders.

**D. A second package for the menu-button focus state machine.** Rejected —
see §5. Nine of ninety-one code lines are pure logic.

---

## 3. Decision: the scope halves, and the name follows

**The package is `editor-menu-model`, not `menu-core`.**

A settings navigation carries a selection state, per-item test ids and a
danger variant. A menu carries actions, separators and submenus. They resemble
each other only from far enough away.

The touchstone check — can the model express `sidebar-model.ts` (39 lines)
without ceremony? — produced four hard blockers, each independently fatal:

| Blocker | Evidence |
|---|---|
| `SidebarItem.testId` is a REQUIRED field; the model has none | `sidebar-model.ts:18-19`, rendered verbatim at `SettingsSidebar.tsx:54`, 34 occurrences |
| `SidebarGroup.variant?: "danger"` — one token implying divider + accent + header suppression | `sidebar-model.ts:29-30`, read at four sites across both renderers |
| `SidebarGroup.label` is OPTIONAL — danger groups deliberately have no heading | `sidebar-model.ts:27-28`; both renderers guard `group.label && …` |
| `activeTab` — selection state — has no home in a menu model | `SettingsNavProps` has three fields, a menu model has two |

Plus an invented discriminant `kind: "action"` on all eight items, in a target
with zero separators and zero submenus — a tag with exactly one inhabitant.

**These blockers are not a defect of the model. They are the evidence that
these are two different things.**

### Explicitly out of scope

Named so nobody later assumes they were forgotten:

- **Settings navigation** (`sidebar-model.ts` + its two renderers, both repos).
- **Primary navigation** (`nav-targets.ts` + `Navigation.tsx`, adaptive-learner).

Both may deserve their own shared shape one day. Neither is this one.

---

## 4. The model

Types only. No rendering, no loading format, no validation library, no runtime
code, no tree structure. Every field is demanded by at least one measured call
site.

```ts
export interface MenuSeparator {
    readonly kind: "separator"
}

export interface MenuAction<TId extends string = string, TIcon = MenuIconSlot> {
    readonly kind: "action"
    readonly id: TId                    // reaches onAction verbatim
    readonly label: string              // already translated
    readonly icon?: TIcon
    readonly shortcut?: string          // display hint only, registers nothing
    readonly disabledReason?: string    // presence means disabled
}

export type MenuSubmenuEntry<TId extends string = string, TIcon = MenuIconSlot> =
    | MenuAction<TId, TIcon>
    | MenuSeparator

export interface MenuSubmenu<TId extends string = string, TIcon = MenuIconSlot> {
    readonly kind: "submenu"
    readonly key: string                // NOT an id — never dispatched
    readonly label: string
    readonly icon?: TIcon
    readonly items: readonly MenuSubmenuEntry<TId, TIcon>[]   // one level, as a type
}

export type MenuEntry<TId extends string = string, TIcon = MenuIconSlot> =
    | MenuAction<TId, TIcon>
    | MenuSubmenu<TId, TIcon>
    | MenuSeparator

export interface MenuGroup<TId extends string = string, TIcon = MenuIconSlot> {
    readonly key: string
    readonly label: string
    readonly items: readonly MenuEntry<TId, TIcon>[]
}

export interface MenuModel<TId extends string = string, TIcon = MenuIconSlot> {
    readonly groups: readonly MenuGroup<TId, TIcon>[]
    onAction(id: TId): void
}
```

### Four shape changes worth their churn

**`disabledReason` on the entry, not a side map.** Today's
`disabled: Record<actionId, string>` is unbound to the tree: it can name ids
that do not exist, can target a submenu parent the renderer never consults
(`EditorMenu.tsx:213-249`), and can target a separator. Moving it onto the
entry removes four invalid states at once.

**A submenu parent carries `key`, not `id`.** Article ships `id: "export"` on
a parent that can never dispatch (clicking only expands,
`EditorMenu.tsx:221`) — and the article switch correspondingly has no
`export` case. An id that never arrives.

**One submenu level becomes a type.** `submenu?: EditorMenuItem[]` is
self-referential today: depth 2 type-checks while the renderer refuses to
recurse (`EditorMenu.tsx:240-244`), so a depth-2 entry silently renders as
something else.

**Action ids are a caller-supplied closed set (`TId`), not a free string.**
This is the one decision that overrides the conservative default, and it is
taken for the second of the two defects it removes, not the first:

- The unchecked cast `actionId.slice("export-".length) as ArticleExportFormat`
  (`buildArticleEditorMenu.tsx:149`) becomes unnecessary — a template-literal
  member narrows it.
- **An unknown id does nothing at all today.** None of the four dispatch
  switches has a `default` branch, so a typo'd or renamed id is a click that
  silently goes nowhere. Successfully executed, wrong result, no signal. A
  closed `TId` makes the switch exhaustive and the typo a compile error.

The cost is a second type parameter on six declarations. Article's generated
family stays expressible:

```ts
type ArticleMenuId =
    | "delete" | "shortcuts" | "help"
    | `export-${ArticleExportFormat}`
```

Consumers who fix the icon type once can alias the ceremony away:

```ts
type AppMenu<TId extends string> = MenuModel<TId, ReactNode>
```

### Eleven invalid states become unrepresentable

Including `{ separator: true, label: "Export" }` (type-checks today, extra
fields silently ignored at `EditorMenu.tsx:307-311`); the empty entry `{}`
(legal today because `id` and `label` are both optional, `:18-20`); disabling
without a reason; a reason on something not disabled; a disabled id that does
not exist; a disabled separator; a shortcut on a separator.

### Feature state: `hidden` becomes a compile error

```ts
export type MenuFeatureState =
    | { state: "active" }
    | { state: "disabled"; reason: string }
```

Two members, so `{ state: "hidden" }` does not type-check. Both repositories'
written policy already says a product feature is never hidden — here at
`frontend/src/features/featureConfig.ts:303-305`, and in adaptive-learner at
`frontend/src/features/featureConfig.ts:14-17` (policy #335) — today pinned
only by prose plus a test comment (`featureConfig.test.ts:29`, `:47`). The
`reason` is required on the disabled member: the one real disabled-entry site
reads it into a `title` tooltip, so a disabled state without a reason has no
call site.

The fold from the app's three-valued `FeatureState` happens in the app, via
`MenuFeatureAdapter<TSource> = (source) => MenuFeatureState | null`. The
package never names `TSource`, imports no feature library and calls no
registry.

### The two n=1 features sit at the edge

Below a marked divider, with a structural guarantee: **no type above it
references any type below.** Delete the edge section and the centre still
compiles.

- **Per-entry feature gating** needs no new mechanism at all. It folds into
  the two the centre already has: omit the entry from the array, or set
  `disabledReason`. Evidence that it belongs to the component rather than the
  data: in the one real case the same boolean also suppresses a
  `Ctrl+Shift+P` listener (`ClientExportMenu.tsx:81-94`).
- **Async entries** stay two standalone aliases. `MenuGroup.items` is always a
  plain array, never "entries or a loader", so no consumer ever narrows "is
  this group loaded yet".

---

## 5. The focus state machine is not a package

`shared/hooks/useMenuButtonBehavior.ts` (adaptive-learner, 143 lines) already
solves menu focus, keyboard and dismissal, and is documented as *"App-agnostic
and render-free"*. It was the obvious second package. It is not one.

**Measured, not estimated:**

| | lines |
|---|---|
| total | 143 |
| comments / blank | 52 |
| **code** | **91** |
| — React- or DOM-bound | 58 |
| — pure syntax (braces, return literal) | 12 |
| — framework-free type declarations | 12 |
| — **genuine pure logic** | **9** |

**The decisive finding: the hook holds no index state.** It has exactly two
`useState` cells, `open` and `pos`, and neither tracks which item is focused.
Every ArrowUp/ArrowDown re-derives the world from the DOM — query the items,
locate "where am I" by node identity, compute the neighbour, push the result
back with `.focus()`.

So "which item becomes focused" is a DOM round-trip, not a state transition.
Extracting a state machine would mean **inventing state that does not exist
today**, not lifting state that is already there. The largest contiguous pure
fragment is the modulo arithmetic for the neighbour index.

Two related facts, recorded because they were previously mis-stated:

- **There is no roving tabindex.** `grep tabIndex` across the hook and both
  consumers returns nothing; items are plain focusable `<button>` elements.
- **It uses real DOM focus, not `aria-activedescendant`** — confirmed three
  ways, including `expect(document.activeElement).toBe(…)` in the consumer
  tests. `aria-activedescendant` could not even be wired without adding `id`
  attributes the items do not have.

This is a refusal, recorded with numbers so it is not proposed again in a
year.

---

## 6. Condition, not a risk: renderer and builders migrate in the same PR

Adopting the model in a builder without changing the renderer produces wrong
rendering **without a compile error**. Three independent mechanisms:

1. **The separator rename fails silently.** The renderer branches on
   `item.separator` (`EditorMenu.tsx:303`), then `item.submenu` (`:308`), else
   action. `MenuSeparator` has neither — and because every `EditorMenuItem`
   field is optional (`:16-29`), it is still assignable. The separator renders
   **as an action row**.
2. **The `disabled` map is shared, not local.** It sits on `BuiltEditorMenu`,
   the return type of three builders, and is read at five render sites.
   `EditorMenuProps.disabled` is optional and defaults to `{}` (`:47`, `:98`),
   so dropping it in one builder is not a type error — every disabled entry in
   that menu silently becomes **enabled**.
3. **`readonly` variance blocks the call site.** `MenuModel.groups` is
   `readonly`; `EditorMenuProps.groups` is `EditorMenuGroup[]` (`:41`).
   `readonly T[]` is not assignable to `T[]`.

**A half migration is worse than none here.** This is a precondition on the
first adoption PR, not a risk to monitor.

Coordinated change set: `EditorMenu.tsx` (types + all three render branches +
the `disabled` prop), all four builders, `ArticleEditor.tsx:173`,
`PageEditor.tsx:354`, `ComicBookEditor.tsx:178`, `BookEditor.tsx:325`,
`EditorMenu.test.tsx`, `editorMenus.test.tsx`, and
`e2e/smoke/book-editor-menu.spec.ts:47` (which pins the index-derived group
testid that `MenuGroup.key` replaces).

---

## 7. Obligation on `SETTINGS-MENU-ARCHITECTURE.md`

That document exists to make someone rebuild the pattern by hand. Once a
package exists, it describes a rebuild that should no longer happen.

**Mark it superseded — do not delete it — with a pointer to the package, in
the same PR as the first package adoption.** Not a follow-up ticket.

A document written as build-it-yourself instructions does not become *wrong*
when superseded; it becomes *misleading*. Wrong gets noticed. Misleading does
not.

(Strictly this applies when the settings-navigation shape gets a package,
which §3 puts out of scope — so the marking should say what actually
supersedes it and what does not. If nothing does yet, the honest marking is
"still current for settings navigation; the editor-menu half now lives in
`editor-menu-model`".)

---

## 8. Findings independent of the package

Two came out of the audit and stand on their own. Each has its own issue.

### 8.1 The primary-nav parity check is self-referential and passes on an empty model

> Filed as astrapi69/adaptive-learner#2343.

`Navigation.viewport.test.tsx:110-133`. Four assertions; **none asserts
anything about `NAV_TARGETS`' own shape**. The expected value is derived from
the same constant the DOM is rendered from (`:127`), so the check can only
detect a renderer disagreeing with the model — never a model that is empty,
reordered or wrong.

If `NAV_TARGETS` becomes empty — the realistic outcome of moving the model
into a package with an overridable default — the whole parity block passes
green while the app renders no navigation. Caught today only on mobile, by a
literal list in `Navigation.test.tsx:42-52` that runs mobile-only. Desktop is
uncovered.

Also unpinned by it: entry order (both sides are `.sort()`ed), group
membership, and labels.

**Correction to the source, found on the way:** `nav-targets.ts:5-9` claims
the model "drives EVERY renderer … the desktop top bar and the mobile
hamburger drawer". There is one production consumer (`Navigation.tsx:12`) and
one emission site (`:228-293`), switched by a single boolean (`:74`) surfaced
as `data-variant` (`:233`) — the same DOM, restyled by CSS, as `:48` itself
says. The docstring appears to have been copied from `sidebar-model.ts`, where
it is true.

### 8.2 The settings navigation has no parity check at all

> Filed as astrapi69/adaptive-learner#2344.

This is the case the nav docstring imagines: `SettingsSidebar` and
`SettingsMobileMenu` are two genuinely separate components consuming one
model. **Nothing compares them.** Their two test files use different
hand-built fixtures (three groups with a danger group vs. two groups without),
so the danger branch is exercised on one side only.

A parity test must key on `item.value`, **not** `item.testId`:
`SettingsSidebar.tsx:54` renders `data-testid={item.testId}` while
`SettingsMobileMenu.tsx:120` ignores it and derives
`settings-mobile-tab-${item.value}`. The `testId` field is half-consumed — a
real drift surface the model does not capture.

---

## 9. Corrections to this exploration's own audit

Left in deliberately. A document that hides its own errors invites their
repetition.

| Claimed | Actual |
|---|---|
| `nav-targets.ts` is "1 model → 2 renderers", a second instance of the pattern | One consumer, one emission site, a CSS variant. **Not** a second instance. |
| `useMenuButtonBehavior` implements a roving tabindex | No tabindex anywhere. Real DOM focus, plain `<button>` elements. |
| `sidebar-model.ts` is a touchstone the model must satisfy | It is a *different shape*. Treating it as a touchstone was right; expecting it to pass was not. |

The third is the productive one: the touchstone did its job precisely by
failing.

---

## 10. Design decisions — all settled

Twelve decisions the evidence alone did not settle. All are now taken; the
full text with the reasoning for each is in issue #706.

**The two load-bearing ones, decided 2026-08-04:**

**Action ids are a caller-supplied closed set.** This overrides the
conservative default (`string`). The deciding argument was the second defect,
not the first: an unknown id does nothing at all today — no `default` branch
in any of the four switches — so a typo'd or renamed id is a click that goes
nowhere with no signal. Successfully executed, wrong result. A second type
parameter is cheap against that. See §4.

**Icons stay a generic `TIcon`; no type-only import.** "Literally
dependency-free" is a promise given once and never withdrawn. One extra type
parameter across six declarations is a small price for nobody ever having to
ask what the package drags in.

**The remaining ten stand as designed** — the conservative choice in each
case. Two are worth restating because they carry cost:

- **`MenuGroup.key` is required.** It forces ~5 short literals per builder,
  and it fixes two measured renderer defects: the React key is
  `group.label || groupIndex` (`EditorMenu.tsx:284`), so two groups sharing a
  heading collide; and the group testid is index-derived (`:292-295`), so
  comic's optional Ansicht group shifts every later testid when omitted —
  `e2e/smoke/book-editor-menu.spec.ts:47` pins `book-editor-menu-group-0`.
- **The `disabled` side map moves onto the entry**, accepting the call-site
  churn. It is what removes four of the eleven invalid states, and it is
  bounded by the same-PR precondition in §6 anyway.

## 11. Triggers to act

- **Build the package** when a third repository needs the shape, or when the
  first coordinated renderer+builders PR is scheduled anyway.
- **Revisit the scope** if settings navigation grows actions, separators or
  submenus — then §3's blockers may dissolve and one model may cover both.
- **Revisit the focus state machine** only if it grows real index state. As
  long as focus is a DOM round-trip, there is nothing to extract.
- **Do not revisit** the JSON/loading format, a validation library or a tree
  structure without new evidence: all three measured zero use cases across
  three repositories.
