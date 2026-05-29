# Theme system (developer guide)

How Bibliogon's theming works, the token vocabulary, how to add a
palette, and the gates that keep every variant correct. Companion to
the `.claude/rules/architecture.md` "Theming" bullet.

## The matrix: 6 palettes × light/dark = 12 variants

| Palette | id | Where it lives in `global.css` |
|---|---|---|
| Warm Literary (**default**) | `warm-literary` | `:root` (light) + `[data-theme="dark"]` (dark) |
| Cool Modern | `cool-modern` | `[data-app-theme="cool-modern"]` (+ `…[data-theme="dark"]`) |
| Nord | `nord` | `[data-app-theme="nord"]` (+ dark) |
| Classic | `classic` | `[data-app-theme="classic"]` (+ dark) |
| Studio | `studio` | `[data-app-theme="studio"]` (+ dark) |
| Notebook | `notebook` | `[data-app-theme="notebook"]` (+ dark) |

The canonical registry is **`frontend/src/themes/palettes.ts`** (drives
the Settings → Erscheinungsbild picker). Light/dark is an orthogonal
dimension toggled by `[data-theme="dark"]` on the root, handled by
`useTheme`.

> **Counting gotcha:** the recipe
> `grep -oE 'data-app-theme="[a-z-]+"' global.css | sort -u` returns
> only the **5** explicit overrides — Warm Literary has no
> `data-app-theme` attribute (it's `:root`). The real count is **6**.
> Count from `palettes.ts`, not that grep. (This drift had `CLAUDE.md`,
> the architecture rule, and the token-audit script all saying "5
> palettes / 10 variants" until the 2026-05-30 audit.)

## How a palette resolves

`var(--token)` resolves at use-time through the cascade:

1. the active `[data-app-theme="X"][data-theme="dark"]` block (if dark + X overrides it), then
2. `[data-app-theme="X"]` (light X override), then
3. `[data-theme="dark"]` (default dark), then
4. `:root` (default light).

So a palette only needs to override the tokens that differ from Warm
Literary; everything else inherits. A token defined in **no** block
resolves to *nothing* and the property falls to its initial/inherited
value — a silent bug (see the gates below).

## Semantic token vocabulary

Defined in `global.css`. Use these; do not invent parallel names
(`--color-border`, `--bg-surface`, `--surface-1`, `--error`,
`--text-on-accent` etc. were all undefined-token bugs cleaned up on
2026-05-30 — map to the real token instead).

- **Backgrounds:** `--bg-primary` (page), `--bg-secondary` (sidebar/
  fill), `--bg-card`, `--bg-hover`, `--bg-editor`, `--bg-sidebar`,
  `--surface-2` (soft panel / code block, one step deeper than card).
- **Text:** `--text-primary` (alias `--text`), `--text-secondary`,
  `--text-muted`, `--text-inverse` (text on an accent/colored fill —
  flips with mode), `--text-sidebar`.
- **Accent:** `--accent`, `--accent-hover`, `--accent-light` (pale
  tint), `--accent-subtle`.
- **Borders:** `--border`, `--border-strong`.
- **Status:** `--success` / `--success-light`, `--warning` /
  `--warning-light` / `--warning-dark` / `--warning-bg` / `--bg-warning`,
  `--danger` / `--danger-hover` / `--danger-bg`.
- **Shape/motion:** `--shadow-sm|md|lg`, `--radius-sm|md|lg`,
  `--transition`, `--font-display|body|mono`.

Status colors (`--success`/`--warning`/`--danger`/`--accent`) are
usually **icons/badges/borders** — WCAG's 3:1 non-text bar applies to
those. When you render one as body **text**, it must clear 4.5:1
(the contrast gate checks the common pairs).

## Adding a new palette

1. Add `{id, label}` to `frontend/src/themes/palettes.ts`.
2. Add an i18n label `ui.themes.<id>` to all 8 catalogs (the picker
   renders `t("ui.themes.<id>", label)`).
3. In `global.css`, copy an existing palette's two blocks and rename:
   - `[data-app-theme="<id>"] { … }` (light) — override the tokens
     that differ from `:root`.
   - `[data-app-theme="<id>"][data-theme="dark"] { … }` (dark).
   You only need to redefine tokens that differ; the rest cascade.
4. Add `<id>` to `PALETTES` in `scripts/audit_theme_tokens.py` and to
   `PALETTES` in `scripts/check_theme_contrast.py` so both gates cover
   it.
5. Run `make verify-theme` and fix any token/contrast failure it
   reports for the new variant. Adjust the failing token's value in
   the new palette's block until contrast clears.

## The gates (`make verify-theme`, run in `make release-test`)

| Script | Catches |
|---|---|
| `scripts/audit_theme_tokens.py --enforce` | (a) any `var(--token, #hex)` whose token isn't defined in some palette × mode (hex-fallback completeness — also the pre-commit hook); (b) any bare `var(--token)` referencing a token defined in **no** block (the blind spot that hid 18 undefined-token bugs). Runtime tokens (`--radix-*`) and JS-set props (`setProperty`) are exempt. |
| `scripts/check_theme_contrast.py --enforce` | WCAG ratio of 8 critical pairs × 12 variants (96 checks), alpha-compositing translucent backgrounds over `--bg-card`. 4.5:1 for text, 3:1 for graphical. |
| `scripts/check_hardcoded_colors.py --enforce` | Hardcoded hex outside `var()` fallbacks, comments, pure white/black, and the DATA allowlist. |

## Intentional non-themed colors (allowlisted / by design)

Not every color is a token — some are data or convention:

- **Storyboard mood-color presets** (`Storyboard.tsx`): a fixed palette
  of named mood hexes — user-facing DATA, not styling. Allowlisted in
  `check_hardcoded_colors.py`.
- **Comic bubble defaults** (`comics/ComicBubble.tsx`,
  `comics/bubbleConfigReads.ts`): white fill / black stroke / beige
  narration are **comic convention** and are mirrored 1:1 with the
  Python PDF walker so the editor matches the print. Kept
  theme-independent by decision (2026-05-30). The editor *chrome*
  around bubbles (panel bg/border, drag-handle ring) IS themed.
- **Collage / picture-book image overlays** (`CollageCanvas.module.css`,
  parts of `PageCanvas.module.css`): text-region backdrops and
  control buttons are **image-relative** (a fixed white-ish/dark scrim
  so text reads over arbitrary photos) — deliberately NOT theme-aware,
  because the photo, not the app theme, is what they must contrast.
  These carry inline comments saying so; don't "fix" them to
  `var(--text)`.
- **Pure white/black `#fff`/`#000`** on a colored fill (button labels
  on `--danger`/`--accent`, hairlines): correct in every theme; the
  hardcoded-color lint allows them.
