# Settings-Menu Architecture (Cross-Project Reuse Reference)

> **Purpose:** A precise, self-contained spec of Bibliogon's Settings menu —
> responsive layout, desktop sidebar, mobile hamburger, grouped navigation,
> deep-linkable tabs. Written so another project (e.g. adaptive-learner) can
> rebuild the pattern 1:1 without access to the Bibliogon source.
>
> **Status:** Analysis report. No code changed.
> **Stack assumed by the original:** React 18 + TypeScript (strict),
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
            - tab bodies are independent components:
              ErscheinungsbildSettings, VerhaltenSettings, EditorSettings,
              AiAssistantSettings, AutorenSettings, TopicsSettings,
              PluginSettings, CommentsAdminSection, BackupsSettings,
              SupportSection, AboutSettings, ErweitertSettings,
              DangerZoneSettings
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
// The shared data structure — defined once, consumed by sidebar + mobile menu.
export interface SidebarItem {
  value: string;   // tab key, e.g. "erscheinungsbild"
  label: string;   // i18n-resolved display label
  testId: string;  // e.g. "settings-tab-erscheinungsbild"
}

export interface SidebarGroup {
  key: string;            // e.g. "darstellung"
  items: SidebarItem[];
  label?: string;         // optional visible group header (<h2>). Omit it and
                          // only the items render (used by single-item groups
                          // like Danger Zone where a header duplicates the item).
  variant?: "default" | "danger"; // "danger" -> red accent + extra separation
}

// Both navigation components share this exact prop shape:
interface NavProps {
  groups: SidebarGroup[];
  activeTab: string;
  onChange: (next: string) => void;
}
```

The page also defines a closed union of valid tabs and a type guard, so an
unknown `?tab=` value can never select an invalid section:

```ts
const VALID_SETTINGS_TABS = [
  "erscheinungsbild", "verhalten", "editor", "ai", "autoren", "topics",
  "plugins", "comments", "backups", "support", "about", "erweitert",
  "danger_zone",
] as const;
type SettingsTab = (typeof VALID_SETTINGS_TABS)[number];

function isSettingsTab(v: string | null): v is SettingsTab {
  return v !== null && (VALID_SETTINGS_TABS as readonly string[]).includes(v);
}
```

---

## 3. Responsive Behaviour

### The breakpoint

**Single breakpoint at `max-width: 768px`.** Below it = mobile (hamburger),
above it = desktop (sidebar). The switch is driven in **two places that must
agree**:

1. `Settings.module.css` `.layout` media query — collapses the grid to one
   column and hides `.sidebarColumn`.
2. `global.css` `.settings-tabs-mobile` media query — reveals the hamburger.

There is **no JS breakpoint detection** and **no `--breakpoint-*` CSS
variable** for this menu; it is pure CSS media queries. Both the sidebar and
the hamburger are always in the DOM; CSS `display` toggles which one is visible.
The transition is **instant** (no animation on the layout switch itself; only
the hamburger *popover* fades in — see §4).

### Breakpoint table

| Viewport | Sidebar (`.sidebarColumn`) | Hamburger (`.settings-tabs-mobile`) | Grid columns |
|---|---|---|---|
| `> 768px` (desktop) | `display: flex` (visible) | `display: none` | `220px 1fr` |
| `<= 768px` (mobile/tablet) | `display: none` | `display: flex` | `1fr` (single col) |

### Desktop layout

- **Sidebar position:** left rail, fixed **220px** wide.
- **Content:** right column, `1fr`, capped at `max-width: 900px`.
- **Outer container:** `max-width: 1180px`, centered (`margin: 0 auto`),
  `padding: 24px`, `gap: 32px` between rail and content.
- **Independent scroll:** the sidebar is `position: sticky; top: 16px;
  max-height: calc(100vh - 32px); overflow-y: auto` — it scrolls
  independently of the content and stays pinned while the content scrolls.

### Mobile / tablet (`<= 768px`)

- Sidebar column hidden; grid becomes a single column; padding drops to `16px`,
  gap to `0`.
- The hamburger trigger sits **above** the content area (it is rendered before
  `.layout` in the JSX, so it stacks on top).
- **Open:** Radix `DropdownMenu` — an **anchored popover** (`align="start"`,
  `sideOffset={4}`), NOT a full-screen overlay or slide-in drawer. It fades in
  (`animation: fadeIn 100ms ease`) at `z-index: 2100`.
- **Close (all three, native Radix behaviour):** click an item, click outside,
  or press `Esc`.
- **Auto-close after selection:** yes — Radix `DropdownMenu.Item`'s default
  `onSelect` closes the menu. The handler does **not** call
  `e.preventDefault()` (Bibliogon rule: never `preventDefault` in `onSelect`
  when it would keep a menu open behind other UI). Selecting a tab closes the
  popover and switches the content.
- The trigger label reflects the **currently active tab** (`activeLabel`), so
  the closed hamburger always shows where you are.

---

## 4. Navigation

### Grouping

Menu items are grouped into labelled categories. Bibliogon's five groups:

| Group key | Header label | Items |
|---|---|---|
| `darstellung` | "Darstellung" | Erscheinungsbild, Verhalten, Editor |
| `inhalt` | "Inhalt" | KI-Assistent, Autoren, Themen |
| `system` | "System" | Plugins*, Kommentare, Backups, Erweitert |
| `info` | "Info" | Über, Unterstützen* |
| `danger` | *(no header)* | Gefahrenzone (`variant: "danger"`) |

\* conditionally present (see §5 gating). The `danger` group has **no
header label** (single item; a header would duplicate the item label) and uses
`variant: "danger"` for the red accent + a divider above it.

### Indentation (two-level hierarchy)

Group header (`.groupLabel`) is an uppercase, muted, small-caps `<h2>` with
`padding: 0 12px`. Each item label is indented one extra level so the two read
as a hierarchy. The indent uses a **Tailwind `text-indent` utility**
(`indent-[12px]`) applied on top of the CSS-Module padding:

```tsx
const linkClass = [
  styles.link,
  "indent-[12px]",                 // text-indent, shifts ONLY the label
  isActive ? styles.linkActive : "",
  isDanger ? styles.linkDanger : "",
].filter(Boolean).join(" ");
```

**Why `text-indent` and not `padding-left`:** `text-indent` shifts the text
glyph only, leaving the full-width clickable `<button>` (the 44px touch target)
intact. Padding would have shrunk the hit area.

### Active-tab highlight

| State | Sidebar classes | Visual |
|---|---|---|
| Default item | `.link` | `--text-secondary`, weight 500 |
| Hover | `.link:hover` | `--bg-hover` bg, `--text-primary` |
| **Active** | `.link.linkActive` | `--bg-hover` bg, **`--accent` text**, weight 600 |
| Danger active | `.linkDanger.linkActive` | `--danger-bg` bg, `--danger` text |
| Focus (keyboard) | `.link:focus-visible` | `2px solid --accent` outline, offset 2px |

Active item also sets `aria-current="page"`. In the mobile menu, the active
item shows a Lucide `<Check size={14}/>` glyph instead.

### URL routing — query param, deep-linkable

- **Mechanism:** `?tab=<value>` **query parameter** (NOT hash, NOT nested
  routes). Managed via react-router `useSearchParams`.
- **Deep links:** yes — `/settings?tab=backups` lands directly on the Backups
  tab. Initial tab is parsed from the URL on mount.
- **Reload/back survival:** the active tab is mirrored back into the URL on
  every change with `{ replace: true }` (so tab clicks don't pollute the
  history stack). A refresh re-parses `?tab=` and restores the same tab.
- **Unknown values:** fall back to the default tab (`erscheinungsbild`) via
  the `isSettingsTab` guard — a stale URL never lands on an invalid section.
- **Legacy redirects:** old tab names are remapped at parse time (e.g.
  `?tab=author` -> `autoren`) so bookmarks/help-doc links keep working:

```ts
const LEGACY_TAB_REDIRECTS: Record<string, SettingsTab> = {
  author: "autoren",
  authors_database: "autoren",
};
```

---

## 5. State Management

| Concern | Mechanism |
|---|---|
| **Active tab** | `useState<SettingsTab>`, initialized from `?tab=` on mount. |
| **Tab persistence across refresh** | Mirrored into the URL (`?tab=`), so refresh restores it. The state is initialized FROM the URL, the URL is the durable store. |
| **Hamburger open/close** | **Not app state** — owned internally by Radix `DropdownMenu.Root` (uncontrolled). No `useState` for it. |
| **Config data** | `appConfig` + `pluginConfigs` loaded async on mount; `appLoaded` / `pluginsLoaded` gate rendering. |
| **Sidebar groups** | `useMemo` over `[t, hasDonations, hasPlugins]` — rebuilt only when i18n or gating flags change. |

### Tab gating (conditional presence, not feature-strategy)

Bibliogon does **not** use its `feature-strategy` registry to gate Settings
tabs. Two tabs are conditionally present based on data availability:

- **Plugins tab** — present only when `Object.keys(pluginConfigs).length > 0`.
  In the backendless PWA there are no plugin configs, so the tab is absent
  (an "empty container", not a disabled feature). A deep-link to
  `?tab=plugins` with no plugins redirects to the default tab once the fetch
  settles:

  ```ts
  useEffect(() => {
    if (pluginsLoaded && activeTab === "plugins" && !hasPlugins) {
      handleTabChange("erscheinungsbild");
    }
  }, [activeTab, hasPlugins, pluginsLoaded]);
  ```

- **Support/Donations tab** — present only when a donations config exists
  (`hasDonations`).

Both conditions are computed booleans fed into the memoized `sidebarGroups`,
so the tab simply doesn't appear in either the sidebar or the hamburger.

### The load-gating pattern (avoids a save-clobber flake)

Tab bodies hydrate their local form state from the `config` prop. Rendering
them before the async `getApp()` resolves means a fast user edit can be
clobbered when the real config arrives. The fix: gate the whole content area
on a first-load flag:

```tsx
{!appLoaded ? (
  <p data-testid="settings-loading">Loading…</p>
) : (
  <>{/* the active tab body */}</>
)}
```

---

## 6. Code Snippets (the reusable core)

### 6a. Building the shared group data (page)

```tsx
const sidebarGroups: SidebarGroup[] = useMemo(() => [
  {
    key: "darstellung",
    label: t("ui.settings.group_darstellung", "Darstellung"),
    items: [
      { value: "erscheinungsbild", label: t("...", "Erscheinungsbild"),
        testId: "settings-tab-erscheinungsbild" },
      { value: "verhalten", label: t("...", "Verhalten"),
        testId: "settings-tab-verhalten" },
      { value: "editor", label: t("...", "Editor"),
        testId: "settings-tab-editor" },
    ],
  },
  // ...inhalt, system (with conditional plugins item), info...
  {
    key: "danger",
    variant: "danger",          // red accent, no header
    items: [
      { value: "danger_zone", label: t("...", "Gefahrenzone"),
        testId: "settings-tab-danger-zone" },
    ],
  },
], [t, hasDonations, hasPlugins]);
```

Conditional item via spread:

```tsx
items: [
  ...(hasPlugins ? [{ value: "plugins", label: t("...","Plugins"),
                      testId: "settings-tab-plugins" }] : []),
  { value: "comments", /* ... */ },
]
```

### 6b. Deep-link parse + URL sync (page)

```tsx
const [searchParams, setSearchParams] = useSearchParams();

const rawTab = searchParams.get("tab");
const redirected =
  rawTab && rawTab in LEGACY_TAB_REDIRECTS ? LEGACY_TAB_REDIRECTS[rawTab] : null;
const initialTab: SettingsTab =
  redirected ?? (isSettingsTab(rawTab) ? rawTab : "erscheinungsbild");
const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

const handleTabChange = (next: string) => {
  if (!isSettingsTab(next)) return;
  setActiveTab(next);
  const params = new URLSearchParams(searchParams);
  params.set("tab", next);
  setSearchParams(params, { replace: true });  // no history pollution
};
```

### 6c. Responsive breakpoint switch (CSS — the heart of it)

```css
/* Settings.module.css */
.layout {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  grid-template-columns: 220px 1fr;  /* sidebar | content */
  gap: 32px;
}
@media (max-width: 768px) {
  .layout { grid-template-columns: 1fr; padding: 16px; gap: 0; }
  .sidebarColumn { display: none; }   /* hide desktop sidebar */
}

/* global.css — hamburger is the mirror image */
.settings-tabs-mobile { display: none; }     /* hidden on desktop */
@media (max-width: 768px) {
  .settings-tabs-mobile { display: flex; }    /* shown on mobile */
}
```

### 6d. Sidebar item rendering (group + sub-items)

```tsx
<nav className={styles.sidebar} aria-label="Settings navigation"
     data-testid="settings-sidebar">
  {groups.map((group) => {
    const isDanger = group.variant === "danger";
    const headingId = group.label
      ? `settings-sidebar-heading-${group.key}` : undefined;
    return (
      <div key={group.key}
           className={`${styles.section}${isDanger ? ` ${styles.sectionDanger}` : ""}`}>
        {group.label && (
          <h2 id={headingId} className={styles.groupLabel}>{group.label}</h2>
        )}
        <ul className={styles.group} aria-labelledby={headingId}>
          {group.items.map((item) => {
            const isActive = item.value === activeTab;
            const linkClass = [
              styles.link, "indent-[12px]",
              isActive ? styles.linkActive : "",
              isDanger ? styles.linkDanger : "",
            ].filter(Boolean).join(" ");
            return (
              <li key={item.value} className={styles.item}>
                <button type="button" className={linkClass}
                        data-testid={item.testId}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => onChange(item.value)}>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  })}
</nav>
```

### 6e. Mobile hamburger (Radix DropdownMenu, reuses the same `groups`)

```tsx
<div className="settings-tabs-mobile">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button className="btn btn-secondary settings-tabs-mobile-trigger"
              data-testid="settings-tabs-mobile-trigger"
              aria-label="Open tab menu">
        <Menu size={16} />
        <span>{activeLabel}</span>   {/* label of the current tab */}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className="hamburger-menu-content"
                            align="start" sideOffset={4}>
        {groups.map((group, groupIdx) => (
          <div key={group.key}>
            {groupIdx > 0 && (
              <DropdownMenu.Separator className="hamburger-menu-separator" />
            )}
            {group.items.map((d) => (
              <DropdownMenu.Item key={d.value} className="hamburger-menu-item"
                                 data-testid={`${d.testId}-mobile`}
                                 onSelect={() => onChange(d.value)}>
                {d.label}
                {d.value === activeTab && <Check size={14} />}
              </DropdownMenu.Item>
            ))}
          </div>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</div>
```

Note: `groupIdx > 0` inserts a `Separator` **between** groups (not before the
first). Desktop group *headers* are not repeated inside the popover; the
separator carries the grouping on mobile.

---

## 7. Tailwind / CSS-Class Reference

### Container / layout (CSS Modules — `Settings.module.css`)

| Class | Purpose | Key declarations |
|---|---|---|
| `.container` | Page root | `min-height: 100vh; background: var(--bg-primary)` |
| `.header` | Top bar | `border-bottom: 1px solid var(--border); background: var(--bg-card)` |
| `.headerInner` | Header content | `max-width: 900px; margin: 0 auto; flex; justify-content: space-between` |
| `.layout` | **The grid** | `max-width: 1180px; display: grid; grid-template-columns: 220px 1fr; gap: 32px` |
| `.sidebarColumn` | Sidebar wrapper | `min-width: 0` (hidden `<=768px`) |
| `.main` | Content column | `min-width: 0; max-width: 900px` |

### Sidebar (CSS Modules — `SettingsSidebar.module.css`)

| Class | Purpose | Key declarations |
|---|---|---|
| `.sidebar` | Nav root | `position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto` |
| `.section` | Group wrapper | `flex column; gap: 4px` |
| `.sectionDanger` | Danger group | `margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border)` |
| `.groupLabel` | Group `<h2>` | `font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); padding: 0 12px` |
| `.group` / `.item` | `<ul>` / `<li>` | reset list styling |
| `.link` | Item button | `display: block; width: 100%; padding: 8px 12px; color: var(--text-secondary); transition: background 120ms, color 120ms` |
| `.linkActive` | Active item | `background: var(--bg-hover); color: var(--accent); font-weight: 600` |
| `.linkDanger` | Danger item | `color: var(--danger)` (+ `--danger-bg` on hover/active) |

### Mobile hamburger (global.css)

| Class | Purpose | Key declarations |
|---|---|---|
| `.settings-tabs-mobile` | Trigger wrapper | `display: none` → `flex` at `<=768px` |
| `.settings-tabs-mobile-trigger` | The button | `inline-flex; gap: 6px; margin: 12px 16px` |
| `.hamburger-menu-content` | Radix popover | `background: var(--bg-card); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); z-index: 2100; animation: fadeIn 100ms ease; min-width: 200px` |
| `.hamburger-menu-item` | Popover item | `flex; gap: 10px; padding: 10px 16px` |
| `.hamburger-menu-item[data-highlighted]` | Hover/keyboard | `background: var(--bg-hover); color: var(--accent)` |
| `.hamburger-menu-separator` | Group divider | `height: 1px; background: var(--border)` |

### Tailwind utilities used inline

- `indent-[12px]` — the only Tailwind utility in the nav; `text-indent` for the
  sub-item hierarchy (see §4). Everything else is CSS-Module classes.

### Theme tokens (all 6 themes identical structurally)

The menu is **fully theme-driven via CSS custom properties**; all 6 palettes
(light/dark) work with zero per-theme code. Tokens used:
`--bg-primary`, `--bg-card`, `--bg-secondary`, `--bg-hover`, `--border`,
`--text-primary`, `--text-secondary`, `--text-muted`, `--accent`,
`--danger`, `--danger-bg`, `--radius-sm`, `--radius-md`, `--shadow-lg`,
`--font-body`, `--font-display`.

> **Reuse note:** if the target project does not have this token set, map each
> token to its own theme variables. The structure does not change per theme —
> only the variable *values* do.

### Icons (Lucide)

`Menu` (hamburger trigger), `Check` (active marker in popover),
`ChevronLeft` (back), `Home` (dashboard).

---

## 8. Step-by-Step Rebuild Guide

A target project can reproduce this menu with the following steps. No Bibliogon
code is required — everything needed is in §2 and §6.

1. **Define the tab union + guard.** Enumerate your tab keys as a
   `const [...] as const` array; derive `type Tab` and an `isTab()` guard
   (§2). This makes every `?tab=` value safe.

2. **Define the shared data types.** Copy `SidebarItem`, `SidebarGroup`,
   `NavProps` (§2). These are the contract between the page and both nav
   renderers.

3. **Build the page shell** (`Settings`):
   - Parse the initial tab from `useSearchParams().get("tab")` with a
     legacy-redirect map + the guard + a default fallback (§6b).
   - Hold `activeTab` in `useState`, write a `handleTabChange` that sets state
     **and** mirrors `?tab=` with `{ replace: true }` (§6b).
   - Build `sidebarGroups` in a `useMemo` keyed on your i18n fn + any gating
     booleans (§6a). Use the spread trick for conditional items.

4. **Render three things in order:** `<header>`, `<SettingsMobileMenu>`, then
   `<div className="layout">` containing `<div className="sidebarColumn">
   <SettingsSidebar/></div>` and `<main>{active tab body}</main>` (§1).
   Gate the `<main>` body on a first-load flag (§5) if your tab bodies hydrate
   from async config.

5. **Build `SettingsSidebar`** (dumb): map `groups` → `<div.section>` with an
   optional `<h2.groupLabel>` + a `<ul.group>` of `<button>` items. Apply
   `linkActive` / `linkDanger` conditionally; set `aria-current` (§6d).

6. **Build `SettingsMobileMenu`** (dumb): a Radix `DropdownMenu` whose
   `Trigger` shows `<Menu/>` + the active tab's label, and whose `Content`
   maps the *same* `groups` to `DropdownMenu.Item`s with `Separator`s between
   groups. Wire `onSelect={() => onChange(value)}` — do **not** call
   `preventDefault` (§6e).

7. **Add the CSS:**
   - `.layout` grid `220px 1fr` + the `max-width:768px` media query that
     collapses to one column and hides `.sidebarColumn` (§6c).
   - `.settings-tabs-mobile { display:none }` flipped to `flex` at
     `<=768px` (§6c).
   - Sidebar classes (`.sidebar` sticky/scroll, `.link*`, `.groupLabel`,
     `.sectionDanger`) and hamburger classes
     (`.hamburger-menu-content/-item/-separator`) from §7.
   - Use your project's theme tokens throughout; never hardcode colors.

8. **Add the sub-item indent.** Either a `text-indent` utility (`indent-[12px]`
   if you have Tailwind) or a CSS rule `text-indent: 12px` on `.link`. Keep it
   `text-indent`, not padding, to preserve the full-width touch target.

9. **(Optional) Conditional tabs.** Compute booleans (data-availability) and
   gate items via spread. Add a redirect effect for the case where a deep-link
   targets a now-absent tab (§5).

10. **Test hooks.** Give every item a stable `testId`; the mobile menu derives
    its testids as `${testId}-mobile`. The sidebar root gets
    `data-testid="settings-sidebar"`, the mobile trigger
    `settings-tabs-mobile-trigger`. This lets E2E specs target both surfaces
    deterministically.

### Behaviour checklist (what "done" looks like)

- [ ] `> 768px`: 220px left sidebar + content, sidebar scrolls independently
      (sticky), hamburger hidden.
- [ ] `<= 768px`: sidebar hidden, hamburger shown above content, popover anchors
      under the trigger.
- [ ] Hamburger label always shows the current tab; active item has a check.
- [ ] Selecting a tab (either surface) switches content, updates `?tab=`, and
      (mobile) auto-closes the popover.
- [ ] Refresh / deep-link / back-button all restore the correct tab.
- [ ] Unknown / legacy `?tab=` values resolve to the default / remapped tab.
- [ ] Active item: accent color + weight 600 + `aria-current="page"`; keyboard
      focus shows an accent outline.
- [ ] Danger group reads as destructive (red accent + divider) with no header.
- [ ] All theme variants render correctly with zero per-theme code.

---

## 9. Notable Design Decisions (why it's shaped this way)

- **One data structure, two renderers.** `SidebarGroup[]` is built once and
  passed to both the desktop sidebar and the mobile hamburger. This is the
  single most important reuse lesson: never define the menu twice. Labels and
  testids stay in lock-step automatically.
- **CSS-only responsive switch.** No `window.matchMedia`, no resize listeners.
  Both navs are always mounted; media queries toggle `display`. Simpler,
  flicker-free, SSR-safe.
- **Query param, not nested routes.** Tabs are `?tab=` not `/settings/tab`.
  Keeps a single route, makes deep-linking trivial, and `{ replace: true }`
  avoids history spam.
- **Dumb nav components.** Neither `SettingsSidebar` nor `SettingsMobileMenu`
  knows about routing or persistence — they take `activeTab` + `onChange`. All
  routing logic lives in the page. This makes them trivially unit-testable.
- **`text-indent` for hierarchy.** Preserves the 44px full-width touch target
  while still visually nesting sub-items under group headers.
- **Conditional presence over disabling.** Tabs with no data (Plugins in the
  PWA, Support with no donations config) are simply absent, with a redirect
  guarding the deep-link case — rather than rendered-but-disabled.

---

*End of report. Source files referenced: `pages/Settings.tsx`,
`pages/Settings.module.css`, `components/settings/SettingsSidebar.tsx`,
`components/settings/SettingsSidebar.module.css`,
`components/settings/SettingsMobileMenu.tsx`, and the
`.settings-tabs-mobile` / `.hamburger-menu-*` blocks in `styles/global.css`.*

## See also

- [`MODULE-ARCHITECTURE.md`](MODULE-ARCHITECTURE.md) — folder structure + the feature-strategy gating that drives which settings controls render active / disabled-with-reason / hidden
- [`VIBE-CODING-POLICY.md`](VIBE-CODING-POLICY.md) — architectural discipline + the CI / security tiers
- [`EXPORT-IMPORT-FORMATS.md`](EXPORT-IMPORT-FORMATS.md) — the export / import surfaces reached from Settings > Backups
- [`manual-tests/MANUAL-TESTPLAN.md`](manual-tests/MANUAL-TESTPLAN.md) — the manual / E2E acceptance test plan
