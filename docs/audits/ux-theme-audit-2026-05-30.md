# UX/UI Theme + Accessibility Audit — 2026-05-30

**Phase A deliverable** of the "UX/UI Audit + Theme System Hardening"
work. Read-only audit; **no fixes applied**. STOP for user review
before Phase B/C.

- **HEAD at audit:** `f69bd6e8`
- **Baseline:** `make test` green (exit 0), tree clean, parity with
  `origin/main`.
- **Method:** code-level audit of the CSS-custom-property theme
  system in `frontend/src/styles/global.css`, every component's
  inline styles + CSS modules, the `theme-token-completeness`
  pre-commit hook (`scripts/audit_theme_tokens.py`), plus a one-off
  alpha-composited WCAG contrast computation across every variant
  and a static accessibility sweep. Dynamic axe-core runs (which
  need a running app + browser) are NOT part of this pass — see the
  Accessibility section.

---

## 0. Headline: the theme matrix is 6 palettes / 12 variants, not 5 / 10

The prompt, `CLAUDE.md`, the `architecture.md` rule, and the
`audit_theme_tokens.py` docstring all say **"5 palettes × light/dark
= 10 variants."** The code disagrees:

`frontend/src/themes/palettes.ts` registers **6 user-selectable
palettes**:

| id | label | CSS block |
|---|---|---|
| `warm-literary` | Warm Literary | `:root` (light) + `[data-theme="dark"]` (dark) |
| `cool-modern` | Cool Modern | `[data-app-theme="cool-modern"]` |
| `nord` | Nord | `[data-app-theme="nord"]` |
| `classic` | Classic | `[data-app-theme="classic"]` |
| `studio` | Studio | `[data-app-theme="studio"]` |
| `notebook` | Notebook | `[data-app-theme="notebook"]` |

`warm-literary` is the DEFAULT (no `data-app-theme` attr; it lives in
`:root`), so the "5 palettes" framing treats it as "the base" rather
than a palette. But it IS user-selectable in the Erscheinungsbild
picker, so the **user-facing count is 6 palettes / 12 variants.**

**Consequence for the audit:** every contrast/coverage claim below is
computed across all **12** variants. The `audit_theme_tokens.py` hook
DOES cover warm-literary correctly (via `:root` + `[data-theme=dark]`
as default-inheritance blocks), so completeness is fine — but the
docstring's "10 variants" wording is drift that should be corrected
to "12" (warm-literary counted as a palette) for consistency.

> **Phase D note:** the prompt's Phase D ("expand from 5×2=10")
> starts from the wrong baseline. Any expansion math is 6 palettes,
> not 5.

---

## 1. The theme-token-completeness hook has a structural blind spot

`scripts/audit_theme_tokens.py` currently reports **ALL 20 tokens
COVERED** across all variants. That is true — *for the tokens it
checks*. The hook's regex (`VAR_FALLBACK_RE`) only matches
`var(--token, #hexfallback)` callsites. It is **blind to**:

1. **Bare `var(--token)` with no fallback** — the most common form in
   the CSS modules. If `--token` is undefined, the declaration is
   invalid-at-computed-value-time and silently falls to the initial /
   inherited value. No hex leaks, so the hook never sees it.
2. **`var(--token, var(--other))` chains** where BOTH are undefined.
3. **Raw hardcoded `#hex` / `rgb()`** not wrapped in `var()` at all.

This blind spot is **not theoretical** — it is the root cause of the
CRITICAL findings in §2 below. **Phase E must extend the hook (or add
a companion) to also flag bare `var(--token)` referencing tokens not
defined in any palette block.**

---

## 2. CRITICAL — undefined CSS tokens used bare (hook blind spot)

Verified: each token below has **zero definitions** anywhere in
`frontend/src/` (checked `global.css` and every `.module.css`/`.tsx`).
Used via bare `var(--token)` → resolves to nothing → property invalid
→ falls to initial/inherited. Affects **all 12 variants** (not just
dark), which is why it shipped unnoticed: the result is "subtly flat"
rather than "obviously broken."

| Undefined token | Used in | Effect | Severity |
|---|---|---|---|
| `--bg` (15 bare callsites) | `Storyboard.module.css` (~12: card bg, focus bg, drag-handle bg, mood-swatch inner ring), `BookBulkActionBar.module.css:19`, `articles/ArticleBulkActionBar.module.css:18,32` | card/control backgrounds fall to transparent | **CRITICAL** |
| `--accent-bg` + `--accent-text` | `articles/ArticleBulkActionBar.module.css:39-40` (`.modeButton.active`) | **active/selected mode button is NOT visually distinct from inactive** — directly violates the prompt's "selected states must be OBVIOUS" | **CRITICAL** |
| `--error` | `BookBulkActionBar.module.css:33`, `articles/ArticleBulkActionBar.module.css:53` | error text renders in inherited color, not red (we use `--danger`, there is no `--error`) | HIGH |
| `--bg-surface` | `DonationReminderBanner.module.css:13` | banner background transparent | MED |
| `--accent-muted` + `--bg-subtle` (BOTH undefined) | `ChapterTemplatePickerModal.module.css:66` (`var(--accent-muted, var(--bg-subtle))`) | background fully unresolved → transparent | MED |
| `--surface-1` | `LayoutConfigSpeechBubble.module.css:184` (`var(--surface-1, transparent)`) | falls to transparent (intended bg lost) | LOW |
| `--bg-app` | `LayoutConfigImageRow.module.css:77` (`var(--bg-editor, var(--bg-app))`) | **no bug** — primary `--bg-editor` is defined, fallback never fires | — (note only) |

**Storyboard is the worst-hit surface.** `Storyboard.module.css`
uses `var(--bg)` for the card background
(`color-mix(in srgb, var(--text) 3%, var(--bg))` — line 96), the
inline-edit focus backgrounds (lines ~220, 305, 331), the drag-handle
(line 349), and the selected mood-swatch INNER ring
(lines 258-259) — every one resolves to nothing. Cards render
near-transparent; the selected mood-swatch loses its inner ring
(only the outer `var(--text)` ring survives).

**Fix direction (Phase C):** replace `--bg` → `--bg-primary` (or
`--bg-card` where a card surface is intended), `--accent-bg` →
`--accent-light` (or `--accent`), `--accent-text` → `--text-inverse`
(or `--accent`), `--error` → `--danger`, `--bg-surface` →
`--bg-card`/`--surface-2`, `--accent-muted`/`--bg-subtle` →
`--accent-light`/`--surface-2`, `--surface-1` → `--bg-card`. Confirm
each replacement against the intended visual (card vs page vs accent).

---

## 3. HIGH — WCAG contrast failures (alpha-composited, per variant)

Computed by parsing `global.css`, resolving each token per
palette×mode (with `:root` / `[data-theme=dark]` inheritance), and
**alpha-compositing translucent backgrounds over `--bg-card`** before
the ratio (so `--danger-bg: rgba(...,0.12)` is evaluated as the
blended color, not as opaque red). Full matrix in Appendix A.

**Important threshold caveat:** WCAG 4.5:1 applies to **body text**.
`--success` / `--warning` / `--danger` / `--accent` are frequently
used for **icons, badges, borders** which fall under WCAG 1.4.11
Non-text Contrast (**3:1**). A token at 3.3:1 PASSES as an icon and
FAILS as text. Each finding below is tagged with how the token is
actually used.

### 3a. `--text-muted` is unreadable as text in dark mode (REAL, text)
- `warm-literary` Dark: muted/card **2.77**, muted/page **3.03**, muted/surface-2 **2.50** — all < 4.5.
- `--text-muted` on `--surface-2` fails in **ALL 6 dark variants** (2.50–4.12) and warm-literary light (4.23).
- `--text-muted` is genuine secondary body text (timestamps, counts, helptext). **This is a real readability bug.** Darken/brighten the muted token in the dark blocks, or stop using it on `--surface-2`.

### 3b. `EditableTitle .warningAck`: white-on-accent fails in dark (REAL, text)
- `EditableTitle.module.css:92` sets `color: var(--btn-primary-text, #fff)` (white) on `background: var(--accent)`.
- In dark mode the accent is *lightened* (it's a foreground/link color), so white-on-light-accent fails: studio D **1.48**, nord D **2.0**, cool-modern D 2.54, classic D 2.53, notebook D 2.54, warm-literary D 3.19 — all < 4.5.
- **`--btn-primary-text` (#fff) is used in exactly ONE place** — this button. The canonical `.btn-primary` correctly uses `var(--text-inverse)` (which flips with mode and passes everywhere, 4.5–11.3). **Fix: change `.warningAck` to `var(--text-inverse)` and retire `--btn-primary-text`.**

### 3c. `--danger` as text on dark cards (REAL where used as text)
- danger/card fails in 5 of 6 dark variants (nord D **2.46**, cool-modern D 3.89, warm-literary D 4.23, studio D 3.93, notebook D 3.92) and nord light (4.09); danger/danger-bg fails broadly (nord D **2.11**).
- `--danger` is used both as icon (3:1 OK) AND as text ("Löschen" links, error messages, `.error` labels). Where it is text on a card/danger-bg in dark mode it fails. **Brighten the dark-mode danger token or use it only on solid danger fills with `--text-inverse`.**

### 3d. `--success` / `--warning` as TEXT in light mode (caveat: usually icons)
- success/card ~3.0–3.3 and success/success-light = 3.0 across ALL light variants; warning/warning-bg ~4.5 borderline.
- These tokens are *almost always icons/badges* (3:1 → PASS). They FAIL only the 4.5:1 text bar. **Action: per-callsite — where success/warning is rendered as readable text (not an icon), either darken the light-mode token or restrict to icon use.** Do NOT blanket-fail these.

---

## 4. HIGH — hardcoded status colors (don't flip with theme)

Genuinely hardcoded hex (NOT a `var(--token, #hex)` fallback). Total
genuinely-hardcoded `.tsx` sites = **31** (of which 10 are the
intentional Storyboard mood-color data palette). **`.module.css`
files have ZERO hardcoded hex** — excellent discipline. The real fix
list is the status-color sites below. All render the *light-mode*
shade even in dark mode (dark palettes define brighter
`--success:#4ade80` etc., which these bypass).

| File:line | Hardcoded | Should be | Note |
|---|---|---|---|
| `AudioExportProgress.tsx:170,171,178,180,258,259` | `#16a34a`/`#ef4444` | `var(--success)`/`var(--danger)` | progress phase + log-line colors |
| `settings/PluginCard.tsx:134,144,153,163` | `#16a34a`/`#dc2626`/`#2563eb` | `var(--success)`/`var(--danger)`/`var(--accent)` | status + filter-reason + core badges |
| `BackupCompareDialog.tsx:248-250` | `#16a34a`/`#dc2626`/`#d97706` | `var(--success)`/`var(--danger)`/`var(--warning)` | added/removed/changed badges |
| `AudioExportGate.tsx:248,249` | `#16a34a`/`#ef4444` | `var(--success)`/`var(--danger)` | phase color helper |
| `AppDialog.tsx:152` | `#16a34a` | `var(--success, #16a34a)` | success icon (danger+info already use vars — inconsistent) |
| `Editor.tsx:1381` | `#16a34a` | `var(--success)` | word-goal-met background |
| `settings/BackupsSettings.tsx:196` | `#16a34a` | `var(--success, #16a34a)` | restore-status badge |
| `CommentsAdminSection.tsx:591` | `#fff` | `var(--text-inverse)` / `var(--btn-primary-text)` | white text on danger button |
| `utils/notify.ts:76` | `#fff` + `rgba(255,255,255,0.15)` | toast button (toastify-managed bg — lower priority) | "Issue melden" button |

**Wrong-fallback variants (subtle):** these use `var()` but with a
fallback that doesn't match the real token value, so if the token
ever fails to resolve the wrong color leaks:
- `articles/PublicationsPanel.tsx:33` — `var(--success, #166534)` (fallback is a *darker* green than the real `#16a34a`; invisible on dark bg if it ever fires).
- `wizards/WizardShell.tsx:255` — `var(--success, #22c55e)` (Tailwind green, not `#16a34a`).
- `wizards/WizardShell.tsx:257` — `var(--accent, var(--primary))` — fallback to **undefined `--primary`** (see §2 class).

---

## 5. MED — comic bubble + page-canvas rendering (Phase F)

**Mirror discipline is intact** — frontend (`ComicBubble.tsx`,
`BubbleTail.tsx`) and the Python PDF walker
(`plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py`)
share byte-identical default fill/stroke/width/dash tables. No
divergence. **Any Phase F fix MUST be mirrored on both sides.**

**Nuance — distinguish comic convention from editor chrome:**

- **Bubble DEFAULTS (white fill, black text, black stroke; narration `#f5f5dc` beige)** are *comic-book convention* and are conceptually DATA — a white speech bubble with black text is correct regardless of app theme, because the bubble sits ON a panel (which carries the artwork/background). These are NOT automatically dark-mode bugs. **Recommendation: keep the printed/exported bubble defaults as-is (PDF must look like a comic, not like the app theme); only revisit if a bubble is rendered with no panel backdrop behind it.** This is a design-intent call for the user (see Open Questions).
- **Editor CHROME around bubbles IS a dark-mode bug:**
  - `ComicPanel.tsx:69,72` — panel border `black` + background `white` (hardcoded). The empty/editing panel renders white on a dark editor.
  - `ComicPanelGrid.tsx:209` — grid background `white`.
  - `ComicBubble.tsx:600` — tail drag-handle `border: 2px solid white` (invisible on light bubbles; should be `var(--border)` / `var(--bg-primary)`). Handle *fill* correctly uses `var(--accent)`.
  - `BubbleTail.tsx` — `bubbleBackgroundColor` mask defaults to `white` and `ComicBubble` never passes the actual fill, so a dark user-chosen bubble fill shows a white seam mask.
- **PageCanvas speech_bubble layout** (`PageCanvas.module.css:325-326`) hardcodes white bg + black text for the picture-book `speech_bubble` layout. Unlike comic bubbles these float on the *page* (theme surface), so this one **should** be theme-aware (`var(--bg-card)`/`var(--text-primary)`).

---

## 6. MED — storyboard + collage + layout previews (Phase G)

- **Storyboard** — primary issue is the `--bg` undefined-token bug (§2). Beat tags (`color-mix` of `--accent`/`--text`), act-group headers (`--text`), and LayoutPicker options (`--text-sidebar`/`--accent`) are correctly theme-aware. **Mood-color dots** render their preset hex (intentional DATA) but the unselected ring is only `var(--text)` at 12% — light mood dots (e.g. `#F4ECD8` gentle, `#FFC857` sunny) are weakly bounded on a dark card. **Recommendation: add a stronger neutral ring in dark mode** so light dots remain distinguishable.
- **CollageCanvas / PageCanvas image overlays** — `rgba(255,255,255,x)` text-region backgrounds and `rgba(0,0,0,x)` control-button backgrounds sit **on top of user images**, so image-relative hardcoding is *defensible* (the backdrop must contrast with the photo, not the theme). **Two exceptions are real bugs:**
  - `CollageCanvas.module.css:195-197` — drag-handle `rgba(0,0,0,0.05)` / border `rgba(0,0,0,0.08)` is nearly invisible in BOTH modes and especially on dark images. Should be `color-mix(in srgb, var(--text) Nx, transparent)`.
  - `CollageCanvas.module.css:234` — focus background snaps to opaque white `rgba(255,255,255,0.95)`, a jarring flash on a dark image.
- Per-Tier text backdrop opacity is user-tunable by design (acceptable).

---

## 7. AD header wraps to two lines (layout regression — user-flagged)

**Confirmed root cause.** `ArticleList.module.css`:
- `.appHeaderInner` — `max-width: 1100px; padding: 12px 24px` → usable content width caps at ~1052px (less at narrower viewports).
- `.headerActions` — **`flex-wrap: wrap`** (line 55). When the action cluster exceeds available width it wraps to a second line.

The Article-Dashboard action cluster is wide: logo · **"Neuer Artikel" SplitButton (primary + chevron)** · "Aus Vorlage" · "Bücher" · separator · "Backup" · **Import split-button (button + chevron)** · separator · Rocket · Help · Settings · Trash(+badge) · Fullscreen · ThemeToggle.

**Regression chain:** v0.38.0's top-nav fix had narrowed AD to
~908px (matching the Book Dashboard, by collapsing the standalone
Medium-import button into the Import chevron). Then **ARTICLE-TYPES-SSOT-01
C5 (2026-05-29, commit in the v0.40.0 line)** replaced the plain
"Neuer Artikel" button with a `SplitButton` — the added chevron
(~32px + its left border) pushed AD back over the wrap threshold.
The Book Dashboard has its own `newBookGroup` split-button but a
lighter overall cluster, so it stays single-line.

At a **900px viewport** the inner width is ~852px and the cluster
wraps for certain.

**Fix in Phase C (single-line at 900px+ is a HARD requirement).**
Candidate consolidations (mirror the prior fix's approach — collapse,
don't widen):
1. Fold the standalone **"Backup"** button into the Import
   split-button's chevron menu (Import + Backup are both
   data-movement actions), OR
2. Fold **"Aus Vorlage" (NewFromTemplate)** into the "Neuer Artikel"
   split-button's dropdown (it already creates articles), OR
3. Make "Backup"/"Importieren" **icon-only** below a width threshold
   (drop the text labels, keep the icons + tooltips), OR
4. Reduce the separators / gaps.
Recommended: option 1 or 2 (removes a whole button), verified to keep
AD ≤ ~908px to match BD. **Do not rely on `flex-wrap` as the
"solution"** — wrapping IS the symptom.

---

## 8. Accessibility (integrated into Phase A; fixes → Phase C2)

Static, code-level a11y sweep of post-v0.38.0 features. **Dynamic
axe-core runs require a running app + browser and were NOT performed
in this pass** — per the project convention ("Claude Code writes the
specs, Aster runs them"), the axe-core run on each page is listed as
an Aster-run step below.

### 8a. Already-correct (verified present)
- **Panel reorder keyboard support:** `ComicPanelGrid.tsx:186-189` wires BOTH `PointerSensor` AND `KeyboardSensor` (with `sortableKeyboardCoordinates`). ✓ `OrderedListEditor.tsx` likewise. ✓
- **SplitButton chevron:** `aria-label={chevronTooltip}` + Radix `DropdownMenu.Trigger` (provides `aria-haspopup`/`aria-expanded`, Enter/Escape/Arrow handling). ✓
- **EditableTitle:** pencil button `aria-label={editLabel}`; input `onKeyDown` handles Enter (save) + Escape (cancel); has an aria-live region. ✓
- **FullscreenButton:** `aria-pressed` + `aria-label` + `title`. ✓
- **SearchClearButton:** `type="button"` + `aria-label`. ✓
- **ComicPanel:** `role="button"` + `aria-label="Comic panel N"` when clickable. ✓
- **MovePanelToPageMenu:** `role="menu"`/`role="menuitem"`, full pages `disabled`, capacity shown in visible item text ("Seite 3 - 2/4 Panels", "(voll)"). ✓ (capacity is in the visible label so SR reads it; an explicit combined `aria-label` would be a nice-to-have.)
- **aria-live regions present** in: OfflineBanner, CollageCanvas, ComicBookEditor, EditableTitle, LoadingIndicator, PageEditor, PageCanvas, DonationReminderBanner, ConvertToBookWizard.

### 8b. Gaps → Phase C2
- **Bubble drag handle + tail drag handle (`ComicBubble.tsx`): pointer-only, no keyboard fallback, no aria-label/role.** Keyboard/SR users cannot reposition a bubble or its tail. **Highest-priority a11y gap.** Needs either a keyboard-operable affordance or a sidebar slider alternative (mirrors the collage approach) + aria-labels.
- **Collage image drag + resize handles (`CollageCanvas.tsx`): pointer-only.** Per-region position/size has no keyboard path. Provide slider fallback + aria-labels.
- **Storyboard inline editing:** beat selector / mood-color picker / act-group input — verify Tab order and that the mood-color picker is operable by keyboard (the swatches need to be real buttons/radios with labels, not click-only divs). To confirm in the dynamic pass.
- **Toast announcements after panel move / title save:** verify the success toasts are announced (react-toastify needs `role="alert"`/aria-live or an explicit live region). The post-panel-move toast ("Panel auf Seite X verschoben") in particular.
- **Published-warning banner:** confirm it carries `aria-live="polite"` (EditableTitle has a live region — verify the warning text routes through it).
- **Content-type selector in ArticleEditor / LayoutPicker categories:** confirm keyboard navigability in the dynamic pass.

### 8c. Aster-run axe-core checklist (Phase A completion + Phase C2 re-run)
Run axe-core (zero critical/serious target) on: Book Dashboard, Article Dashboard (grid + list + trash), BookEditor, PageEditor (picture-book), ComicBookEditor, ArticleEditor, Storyboard view, Settings (all 12 tabs + sidebar), KDP Wizard (5 steps), ConvertToBookWizard, Import Wizard. Record results back into this doc.

---

## 9. Stop-condition assessment

- **>50 issues → session-split?** No. Distinct fixable issues cluster
  into ~6 groups (undefined tokens, contrast, hardcoded status colors,
  comic chrome, storyboard/collage, AD header) + the a11y set.
  Tractable in the planned Phase B/C/C2 sequence.
- **>100 hardcoded color sites → scope expansion?** No. Genuinely
  hardcoded = 31 `.tsx` sites (10 are intentional mood data), 0 in
  `.module.css`. The grep's raw "221" was inflated by `var(--token,
  #fallback)` fallbacks (legitimate, hook-validated).
- **Phase D (new palettes):** user adjudication required — and note
  the baseline is 6 palettes, not 5.
- **Phase F mirror divergence:** none currently; the bubble-default
  design-intent question (keep comic-convention vs theme-aware) is
  for the user (Open Questions).

No stop-condition tripped. Proceed to user review, then Phase B.

---

## 10. Recommended Phase E hardening (beyond color completeness)

1. **Extend the token hook** to flag bare `var(--token)` (no
   fallback) where `--token` is undefined in every palette block —
   this is the §2 blind spot that shipped 6 real token bugs. Stdlib
   regex addition to `audit_theme_tokens.py`.
2. **Contrast spot-check** for the §3 text pairs across all 12
   variants, wired into `make release-test` (the Appendix A script is
   a starting point; gate on text pairs, advise on icon pairs).
3. **No-hardcoded-color lint** for genuinely hardcoded hex/rgb in
   `.tsx`/`.css` excluding `var()` fallbacks, test files, comments,
   and an allowlist for intentional data palettes (Storyboard mood
   colors, comic bubble defaults).

---

## Appendix A — WCAG contrast matrix (alpha-composited)

Columns: warm-literary · cool-modern · nord · classic · studio ·
notebook. `L` = light, `D` = dark. `!` = below the stated threshold.
Threshold 4.5 = text (WCAG 1.4.3); 3.0 = large-text/non-text
(1.4.11). Tokens like success/warning/danger/accent are often icons
(3:1) — read the §3 caveat.

```
muted text / card            L 4.5  4.80   4.97   5.53   5.48   5.15   4.98
                             D      2.77!  4.51   4.50   4.56   4.55   4.50
muted text / page            L 4.5  4.53   4.75   4.80   5.08   4.85   4.84
                             D      3.03!  5.50   5.59   4.97   5.14   5.14
muted text / surface-2       L 4.5  4.23!  4.54   4.54   4.57   4.51   4.56
                             D      2.50!  3.19!  3.86!  4.12!  3.96!  3.91!
primary-btn / text-inverse   L 4.5  4.74   4.55   4.50   6.62   4.55   4.51   (PASS all)
                             D      5.49   7.02   6.24   7.23  11.28   6.62
warningAck white-on-accent   L 4.5  5.02   4.76   5.19   7.71   4.84   4.63
                             D      3.19!  2.54!  2.00!  2.53!  1.48!  2.54!
danger text / card           L 4.5  4.83   4.83   4.09!  5.38   4.83   4.83
                             D      4.23!  3.89!  2.46!  6.04   3.93!  3.92!
danger text / danger-bg      L 4.5  4.41!  4.41!  3.24!  4.57   4.41!  4.25!
                             D      3.74!  3.51!  2.11!  4.74   3.52!  3.48!
success text / card          L 4.5  3.30!  3.30!  3.30!  3.05!  3.30!  3.30!  (icon=3:1 OK)
                             D      9.13   8.40   5.77   9.61   8.49   8.47
warning text / card          L 4.5  4.92   4.92   4.92   4.56   4.92   4.92
                             D      9.53   8.76   6.03  10.04   8.86   8.84
accent / card (link, 3:1)    L 3.0  5.02   4.76   5.19   7.14   4.84   4.63   (PASS all)
                             D      4.99   5.75   5.03   6.63  10.00   5.81
```

Script used: `/tmp/contrast_check2.py` (parses `global.css`,
alpha-composites translucent bgs over `--bg-card`). To be productized
in Phase E.

---

## Questions and assumptions

- **RESOLVED (Phase F scope, user 2026-05-30):** Comic-bubble
  DEFAULTS (white fill / black text / black stroke / beige narration)
  stay **comic-convention / theme-independent** (a comic must look
  like a comic, and the PDF export must match). **Phase F fixes ONLY
  the editor chrome** around bubbles — panel bg, drag-handle border,
  white seam mask, empty-panel placeholders — and the picture-book
  `speech_bubble` page layout (which floats on the theme surface, not
  a comic panel). Bubble default tables + the frontend↔Python mirror
  are left untouched.
- **RESOLVED (Phase D, user 2026-05-30):** **Skip Phase D.** Keep the
  6 existing palettes; do NOT add High-Contrast/Sepia now. Fix the
  existing matrix first (Phases B/C/C2/E); revisit expansion later.
  (Baseline for any future expansion is 6 palettes, not 5.)
- **Assumption:** the §3 success/warning "failures" are predominantly
  icon usage (3:1 → pass). Phase C will classify per-callsite rather
  than blanket-darkening, to avoid regressing the icon cases. Marked
  for per-site review, not a blind global change.
- **Assumption:** dynamic axe-core is an Aster-run step (no running
  app in this session); §8c lists the pages. Static a11y findings
  (§8a/§8b) stand on code inspection.
- **Verified-not-a-bug:** `--bg-app` (used only as the fallback of
  the defined `--bg-editor`) and `--notebook-rule`/`--notebook-margin`
  (defined, palette-specific) are NOT undefined-token bugs.
- **Doc drift to fix (not code):** `audit_theme_tokens.py` docstring,
  `CLAUDE.md`, and `architecture.md` say "5 palettes / 10 variants";
  reality is 6 / 12. Correct alongside Phase E or Phase H.

---

## Resolution (Phases B–H, shipped 2026-05-30)

All fix phases landed as atomic, individually-green commits on `main`.

| Phase | Commit | What shipped |
|---|---|---|
| P1 (AD header) | `fa5ff138` | Folded "Backup" into the Import chevron → AD header single-line at 900px+ with margin; regression-pin E2E. |
| B | `1474dcdd` | All undefined-token refs from §2 → defined tokens; all hardcoded status colors → `var(--success/danger/accent/warning)`. |
| C | `fdd2d7e3` | Dark `--text-muted` brightened (≥4.5 on card+surface-2, all 6 dark variants); nord dark `--danger` 2.46→3.22; `EditableTitle .warningAck` → `--text-inverse`. |
| C2 | `0a151ee1` | Comic bubble + tail keyboard operation (Enter/Space select, arrow-key reposition) + 6 Vitest pins. |
| E | `8d1b0e66` | `make verify-theme` (token-undefined gate + 96-check WCAG contrast gate + hardcoded-hex lint), wired into `release-test`; **+12 more undefined tokens** closed (see open-set note below). |
| F | `7ccdd7f9` | Comic editor chrome themed (panel/grid bg+border, tail-handle ring, PB speech_bubble); bubble defaults kept comic-convention per adjudication. |
| G | `408d5d12` | Storyboard mood-dot ring 12%→25% for dark visibility; collage drag-handle affordance bump (kept image-relative by design). |
| H | this commit | 6/12 drift corrected in CLAUDE.md + architecture.md + the audit script; `docs/development/theming.md` dev guide; this section. |

### Open-set correction (important)

Phase A reported **6** undefined tokens. The Phase E bare-`var()`
scan — the very blind-spot detector this work added — found **18**
(2 runtime-exempt, 16 real). This audit's manual grep under-counted;
the §2 list was the subset reachable from the `var(--token,#hex)`
pattern + a few bare ones. The full set was closed in Phase E and the
`audit_theme_tokens.py` undefined-token gate now prevents recurrence.
This is the canonical "closed-set vs open-set drift" lesson: a manual
audit finds what it greps for; the automated gate finds the rest.

### Deferred (tracked follow-ups, not regressions)

- **Dynamic axe-core run** per page (§8c) — needs a running app +
  browser; an Aster-run step. Static a11y (§8a/§8b) is done; comic
  bubble/tail keyboard shipped in C2.
- **Collage image drag/resize keyboard repositioning** — pointer-only;
  a feature-sized follow-up (the regions are plain divs, no role, so
  not an axe button-name violation today).
- **Playwright screenshot regen** + 4-variant visual spot-check —
  Aster-run (no app in the implementing session).
- **Phase D (new palettes)** — skipped by adjudication; baseline for
  any future expansion is 6 palettes.
- Unused `--btn-primary-text` token definition remains in `:root` /
  `[data-theme="dark"]` (its sole consumer moved to `--text-inverse`
  in Phase C); harmless, no gate flags it. Remove in a future sweep.
