# Settings-Menu Architecture (Cross-Project Reuse Reference)

> **Purpose:** A precise, self-contained spec of Bibliogon's Settings menu —
> responsive layout, desktop sidebar, mobile hamburger, grouped navigation,
> deep-linkable tabs. Written so another project (e.g. adaptive-learner) can
> rebuild the pattern 1:1 without access to the Bibliogon source.
>
> **Status:** Analysis report. **Stack:** React 18 + TypeScript (strict),
> react-router v6/v7, Radix UI (`@radix-ui/react-dropdown-menu`), Lucide icons,
> Tailwind v4 (token-mapped, Preflight-omitted) + CSS Modules, CSS custom
> properties for theming (6 palettes x light/dark).

---

## 1. Component Hierarchy

```
Settings (page)                       pages/Settings.tsx
│  - owns: appConfig state, activeTab state, sidebarGroups data
│  - owns: deep-link parse (?tab=) + URL sync
│  - owns: per-tab save handlers (onSave -> storage.updateApp)
│
├── <header>  (inline JSX, styled by Settings.module.css)
│     - Back button (history-aware), Title, Home / Fullscreen / Theme icons
│
├── SettingsMobileMenu                components/settings/SettingsMobileMenu.tsx
│     - mobile-only hamburger (display:none on desktop via global.css)
│     - Radix DropdownMenu, flattens groups -> items + separators
│
└── <div .layout>  (CSS grid: 220px sidebar | 1fr content)
      │
      ├── <div .sidebarColumn>   (display:none on mobile)
      │     └── SettingsSidebar         components/settings/SettingsSidebar.tsx
      │           - desktop vertical nav, grouped <ul> lists
      │           - group headers + Danger-Zone red accent
      │
      └── <main #main-content .main>
            - renders exactly ONE tab body, switched on activeTab
            - tab bodies are independent components
```

### Responsibility split (the important part)

| Component | Responsibility |
|---|---|
| **Settings (page)** | Single source of truth for `activeTab`, the `sidebarGroups` data structure, URL deep-link parsing/sync, and async config load/save. Renders header, mobile menu, sidebar, and the active tab body. |
| **SettingsSidebar** | Pure presentational. Takes `groups`, `activeTab`, `onChange`. Renders grouped vertical nav. No state, no routing knowledge. |
| **SettingsMobileMenu** | Pure presentational. Same three props. Renders a Radix dropdown reusing the *same* `groups` data so labels/testids stay in lock-step with the sidebar. |
| **Tab body components** | Each owns its own form state, hydrated from the `config` prop; calls `onSave(data)` upward. The page does the persistence. |

**Key design principle:** `SettingsSidebar` and `SettingsMobileMenu` are both
**dumb renderers of one shared `SidebarGroup[]` data structure**. The page
builds that array once (memoized) and passes it to both. This is what keeps
desktop and mobile navigation identical without duplicating the menu
definition.

---

## 2. Props Interfaces (TypeScript)

```ts
export interface SidebarItem {
  value: string;   // tab key, e.g. "erscheinungsbild"
  label: string;   // i18n-resolved display label
  testId: string;  // e.g. "settings-tab-erscheinungsbild"
}

export interface SidebarGroup {
  key: string;            // e.g. "darstellung"
  items: SidebarItem[];
  label?: string;         // optional visible group header (<h2>)
  variant?: "default" | "danger"; // "danger" -> red accent + extra separation
}

interface NavProps {
  groups: SidebarGroup[];
  activeTab: string;
  onChange: (next: string) => void;
}
```

The page also defines a closed union of valid tabs and a type guard, so an
unknown `?tab=` value can never select an invalid section.

---

## 3. Responsive Behaviour

**Single breakpoint at `max-width: 768px`.** Below it = mobile (hamburger),
above it = desktop (sidebar). The switch is driven in two CSS places that must
agree: the `.layout` grid media query (collapses to one column, hides the
sidebar column) and the `.settings-tabs-mobile` media query (reveals the
hamburger). No JS breakpoint detection; both navs are always in the DOM and
CSS `display` toggles which is visible. The layout switch is instant; only the
hamburger popover fades in.

| Viewport | Sidebar | Hamburger | Grid columns |
|---|---|---|---|
| `> 768px` (desktop) | `display: flex` | `display: none` | `220px 1fr` |
| `<= 768px` (mobile/tablet) | `display: none` | `display: flex` | `1fr` |

- **Desktop sidebar:** left rail, fixed **220px**, `position: sticky; top:
  16px; max-height: calc(100vh - 32px); overflow-y: auto` (scrolls
  independently, stays pinned).
- **Content:** `1fr`, capped `max-width: 900px`. Outer container `max-width:
  1180px`, centered, `padding: 24px`, `gap: 32px`.
- **Mobile:** sidebar hidden, single column, padding `16px`. Hamburger renders
  above the content. Open = Radix `DropdownMenu` anchored popover
  (`align="start"`, `sideOffset={4}`), fades in at `z-index: 2100`.
  Close = click item / click outside / Esc. **Auto-close after selection** via
  Radix default `onSelect` (do NOT call `e.preventDefault()`). The trigger
  label reflects the active tab.

---

## 4. Navigation

### Grouping + indentation

Items are grouped into labelled categories. Group header (`.groupLabel`) is an
uppercase, muted, small-caps `<h2>` (`padding: 0 12px`). Each item label is
indented one extra level via a **Tailwind `indent-[12px]` (`text-indent`)
utility** — `text-indent` shifts only the glyph, leaving the full-width
clickable `<button>` (44px touch target) intact. Padding would shrink the hit
area.

### Active-tab highlight

| State | Visual |
|---|---|
| Default | `--text-secondary`, weight 500 |
| Hover | `--bg-hover` bg, `--text-primary` |
| **Active** | `--bg-hover` bg, **`--accent` text**, weight 600, `aria-current="page"` |
| Danger active | `--danger-bg` bg, `--danger` text |
| Focus (keyboard) | `2px solid --accent` outline, offset 2px |

In the mobile menu, the active item shows a Lucide `<Check size={14}/>`.

### URL routing — query param, deep-linkable

`?tab=<value>` query param (NOT hash, NOT nested routes), via react-router
`useSearchParams`. Deep links land on the tab; the tab is mirrored back into
the URL on change with `{ replace: true }` (no history pollution); a refresh
re-parses `?tab=`. Unknown values fall back to the default via a type guard;
legacy tab names are remapped at parse time.

---

## 5. State Management

| Concern | Mechanism |
|---|---|
| **Active tab** | `useState`, initialized from `?tab=` on mount. |
| **Persistence across refresh** | Mirrored into `?tab=`; the URL is the durable store. |
| **Hamburger open/close** | Not app state — owned by Radix `DropdownMenu.Root` (uncontrolled). |
| **Sidebar groups** | `useMemo` over `[t, ...gating flags]`. |

### Tab gating (conditional presence, not disabling)

Conditionally-present tabs are computed booleans fed into the memoized
`sidebarGroups` (spread trick), so an absent tab simply doesn't render in
either surface. A redirect effect guards the deep-link case where a now-absent
tab is targeted.

### Load-gating (avoids save-clobber)

Tab bodies hydrate from the `config` prop; gate the whole content area on a
first-load flag so a fast edit isn't clobbered when async config arrives.

---

## 6. Reusable core

- **One data structure, two renderers.** `SidebarGroup[]` is built once and
  passed to both the desktop sidebar and the mobile hamburger. Never define the
  menu twice — labels and testids stay in lock-step.
- **CSS-only responsive switch.** No `matchMedia`, no resize listeners; both
  navs mounted, media queries toggle `display`.
- **Query param, not nested routes.** Single route, trivial deep-linking,
  `{ replace: true }` avoids history spam.
- **Dumb nav components.** They take `activeTab` + `onChange`; all routing /
  persistence lives in the page.
- **`text-indent` for hierarchy.** Preserves the 44px full-width touch target.
- **Conditional presence over disabling.** Tabs with no data are absent (with a
  deep-link redirect guard), not rendered-but-disabled.

---

## 7. Theme tokens

Fully theme-driven via CSS custom properties; all 6 palettes (light/dark) work
with zero per-theme code. Tokens: `--bg-primary`, `--bg-card`,
`--bg-secondary`, `--bg-hover`, `--border`, `--text-primary`,
`--text-secondary`, `--text-muted`, `--accent`, `--danger`, `--danger-bg`,
`--radius-sm`, `--radius-md`, `--shadow-lg`, `--font-body`, `--font-display`.
Icons (Lucide): `Menu` (trigger), `Check` (active marker), `ChevronLeft`
(back), `Home`.

---

## 8. Reuse in Bibliogon — `lib/components/NavigationSidebar`

This pattern is generalized into `frontend/src/lib/components/NavigationSidebar.tsx`
(props-driven, no app imports): a single component that renders the desktop
sidebar AND the mobile hamburger from one `groups` array, matching the Settings
look 1:1 via the theme tokens above. First consumer beyond Settings:
`BookMetadataEditor`'s section navigation (was Radix Tabs).

*Source files referenced: `pages/Settings.tsx`, `pages/Settings.module.css`,
`components/settings/SettingsSidebar.tsx` (+ `.module.css`),
`components/settings/SettingsMobileMenu.tsx`, and the `.settings-tabs-mobile`
/ `.hamburger-menu-*` blocks in `styles/global.css`.*
