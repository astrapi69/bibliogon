# A11y Known Issues

Tracked accessibility violations surfaced by the axe-core audit
(`e2e/smoke/a11y-audit.spec.ts`, WCAG 2.0 A/AA). The audit gate is green
with no `.exclude()` workarounds. Critical violations (button-name,
image-alt, label, link-name) and the active-tab color-contrast class are
all resolved.

When a new tracked issue is opened, add a row under **Open** and (only if
genuinely unfixable now) a narrowly-scoped `.exclude()` in the audit
spec with the issue reference — never disable a rule.

## Open

_None._

## Resolved

| Rule | Element | Route | Issue | Resolution |
|------|---------|-------|-------|-----------|
| button-name | RadixSelect triggers on the Appearance tab | `/settings` | [#43](https://github.com/astrapi69/bibliogon/issues/43) / [#54](https://github.com/astrapi69/bibliogon/issues/54) | Added `ariaLabel` to all five appearance selects (reusing each adjacent label's i18n key). |
| color-contrast | active settings-tab link (`[data-testid^="settings-tab-"][aria-current="page"]`) | `/settings`, `/settings?tab=about` | [#55](https://github.com/astrapi69/bibliogon/issues/55) | Theme-token fix. `--accent`/`--bg-hover` was below 4.5:1 in **7 of 12** variants (axe only catches the default warm-literary theme; the others were latent). Darkened `--accent` in the 5 affected light variants (warm-literary, cool-modern, nord, studio, notebook) and darkened `--bg-hover` in the 2 affected dark variants (cool-modern, nord) — each the minimal change keeping the button/card contrast intact. Added the `--accent`/`--bg-hover` pair to `scripts/check_theme_contrast.py` so `verify-theme` now guards all 12 variants (108 checks); the axe `.exclude()` is removed. |
