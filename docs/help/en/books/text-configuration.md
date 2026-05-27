# Text configuration for picture-book pages

Picture-book pages with text regions (image_top_text_bottom, image_left_text_right, image_full_text_overlay) carry **Tier 1 + Tier 2** text-configuration sections in the page editor's properties pane. Same shape as the speech-bubble configuration — the layout's text container takes the same 14 properties (8 visual-style + 6 typography), plus the overlay layout's two extra dimension sliders.

## Opening the Tier sections

Open any picture-book page that uses one of the three image-based layouts. The properties pane shows the layout-specific controls (image position, image fit, etc.) followed by two collapsible sections:

- **Visual Style** (Tier 1) — backgrounds, borders, shadow, padding
- **Typography** (Tier 2) — font, weight, size, color, alignment

Click the chevron to open each section. The sections start collapsed by default to keep the properties pane tidy.

## Tier 1 — Visual Style (8 fields)

| Field | Range / values | Default |
|---|---|---|
| **Background color** | Hex color picker | none (transparent) |
| **Border color** | Hex color picker | `#000000` |
| **Border width** | 0-8 px | 0 (no border) |
| **Border style** | Solid / Dashed / Dotted / None | none |
| **Corner radius** | 0-50 % | 0 |
| **Shadow** | Toggle | off |
| **Shadow intensity** | 0-10 | 5 (disabled while shadow off) |
| **Padding** | 0-32 px | inherits CSS-module default |

Borders only render when both **Border width > 0 AND Border style ≠ None**. Default border style is "None" so a non-zero width alone won't paint a border by accident.

## Tier 2 — Typography (6 fields)

| Field | Range / values | Default |
|---|---|---|
| **Font family** | Children-book-friendly font catalog | Atkinson Hyperlegible |
| **Font size** | 10-32 pt | inherits CSS-module default |
| **Font weight** | Normal / Bold | inherits CSS-module default |
| **Italic** | Toggle | off |
| **Text color** | Hex color picker | inherits CSS-module default |
| **Text alignment** | Left / Center / Right | inherits CSS-module default |

When a Tier 2 field is left at "inherits", the CSS-module default takes effect — the same look as a fresh picture-book before any Tier configuration. Set any field to override.

## Overlay-only — text container width + height

The `image_full_text_overlay` layout adds two **dimension sliders** above the Tier sections:

- **Text container width** (30-100%, default 100%) — narrows the text band centered horizontally on the canvas
- **Text container height** (15-100%, default "auto") — caps the band's height; "auto" lets the band size to its content per the text position

These compose with the existing **text position** (top/middle/bottom) and **backdrop opacity** controls. Setting a custom width centers the band; the side offsets fill the rest of the canvas width.

## How configuration is saved

Each Tier control auto-saves after a short debounce (300 ms for sliders + color pickers, instant for dropdowns + checkboxes). The save happens through the page's `layout_config` field; per-layout namespacing keeps each layout's settings independent (so switching between image_top → image_left → image_top preserves the image_top config across the round-trip).

There is no Save button. If a save fails, an error toast surfaces; your in-progress edit stays in the field so you can retry.

## Layout switching preserves Tier config

Earlier versions of Bibliogon (v0.33.1) **purged** the layout_config when switching layouts (to prevent stale keys from one layout bleeding into another). With Fix B (this release), each layout's settings live in its own namespace inside `layout_config`. Switching between layouts preserves the settings of both — switching back to a prior layout re-applies its Tier configuration.

If you experimented with the layouts before Fix B shipped, your old configurations were already cleared (Fix A purged them). Going forward, configurations stick.

## What's covered + what's deferred

**Covered (this release):**
- Tier 1 + Tier 2 for image_top_text_bottom, image_left_text_right, image_full_text_overlay
- Overlay-only width + height dimension sliders
- Layout-switch preservation via per-layout namespace
- TipTap rich-text editing (already shipped in v0.35.0) for image_top, image_left, text_only
- Active text-conversion on layout switch: when you switch from a TipTap layout (image_top, image_left, text_only) to a Tier-Property layout (speech_bubble, image_full_text_overlay), the text content is automatically converted to its plain-text shape. Switching back wraps the plain text into a TipTap doc on read.

**Deferred to follow-ups:**
- `text_only` layout has no Tier sections in this release (no image to compose against; the layout currently has no config UI at all). Filed as a follow-up if author demand surfaces.

## Where to find the controls

| Layout | What's in the properties pane (top-to-bottom) |
|---|---|
| `image_top_text_bottom` | Image position radio + Image fit dropdown + Tier 1 + Tier 2 |
| `image_left_text_right` | Split ratio slider + Image fit dropdown + Tier 1 + Tier 2 |
| `image_full_text_overlay` | Text position dropdown + Backdrop opacity slider + Container width + Container height + Tier 1 + Tier 2 |
| `speech_bubble` | Anchor 9-cell grid + Opacity + Width + Height + Tier 1 + Tier 2 |
| `text_only` | (no config UI in this release) |

All Tier configurations render identically in the editor preview and in the exported PDF.

## Related

- [Storyboard View](storyboard.md) — drag-reorder grid with notes, story beats, mood colors, and act groups
- [Editor Display Settings](../editor/display-settings.md) — font / size / line-height per browser
- [Export](../export/pdf.md) — how Tier configuration renders in the exported PDF
