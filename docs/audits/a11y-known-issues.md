# A11y Known Issues

Tracked, non-blocking accessibility violations surfaced by the axe-core
audit (`e2e/smoke/a11y-audit.spec.ts`, WCAG 2.0 A/AA). The audit gate is
green: critical violations (button-name, image-alt, label, link-name)
are fixed; the remaining cosmetic violation below is narrowly excluded in
the spec via `.exclude()` and tracked by issue, never by disabling the
rule.

When a tracked issue is fixed, remove its `.exclude()` from the audit
spec and delete the row here.

## Open

| Rule | Element | Route | Issue | Grund |
|------|---------|-------|-------|-------|
| color-contrast | active settings-tab link (`[data-testid^="settings-tab-"][aria-current="page"]`) | `/settings`, `/settings?tab=about` | [#55](https://github.com/astrapi69/bibliogon/issues/55) | Theme-token bug: `--accent` (#b45309) on `--bg-hover` (#f5f0ea) = 4.43 vs the 4.5 AA threshold in warm-literary light. Needs a `verify-theme`-coordinated theme pass; only this single element is excluded, so the `color-contrast` rule stays live on the rest of the route. |

## Resolved

| Rule | Element | Route | Issue | Resolution |
|------|---------|-------|-------|-----------|
| button-name | RadixSelect triggers on the Appearance tab | `/settings` | [#43](https://github.com/astrapi69/bibliogon/issues/43) / [#54](https://github.com/astrapi69/bibliogon/issues/54) | Added `ariaLabel` to all five appearance selects (reusing each adjacent label's i18n key). |
