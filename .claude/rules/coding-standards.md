# Coding standards (summary)

Binding rules only. Full text with reasons, examples and incident history:
`docs/development/rules/coding-standards.md` - read the matching section before
work in that area. This summary must not contradict it (#1143).

## General
Pragmatic and maintainable, no over-engineering. When unclear: ask, do not guess.

## Python (Backend + Plugins)
Python 3.12+ (plugins stay 3.11-compatible), Poetry, type hints always, Google-style docstrings, pytest fixtures, Pydantic v2 validators, HTMLParser not regex for nested HTML.

## TypeScript (Frontend)
Strict, no `any`. Functional components, props as interfaces, logic out of components. Radix for dialogs/menus/select, @dnd-kit, Lucide, react-toastify. No `window.alert`, no `console.log` for user feedback.

## Naming
snake_case (Python), PascalCase/camelCase (TS), `bibliogon-plugin-{name}` / `bibliogon_{name}`, no I-prefix, `.bgb`/`.bgp`. No generic names (`data`, `info`, `result`, `tmp`...).

## Formatting
No em-dash, plain UTF-8, no emojis in code. 4 spaces Python, 2 TypeScript/CSS. Prettier is configured but not gated: match each file's existing style, never mass-reformat.

## Git
Gitflow: branch `feature/*`/`fix/*`/`chore/*` from `develop`, PR to `develop`; only releases reach `main`. Conventional commits with scope, one logical change each. No AI `Co-Authored-By` and a human git identity - both enforced by hooks and the `Commit trailers` CI job (#768, #786).

## Function design and cohesion
One responsibility per function, about 40 lines (50 = refactor). One abstraction level. Route handlers only validate, delegate, return. Dataclasses instead of loose dicts. Guard clauses, crash early.

## DRY - Don't Repeat Yourself
Same logic or constant twice: extract. Three duplicates: refactor now.

## Recurring-Component Unification Rule
A UI pattern in 2+ surfaces is extracted into one shared component AND every site is migrated in the same session - no half-migration, no parallel implementation. Before adding a UI component, grep for an existing pattern.

## Tailwind-first for visual consistency
New visual/layout work uses Tailwind utilities (token-mapped). `global.css` is frozen: reuse its classes, never extend. Inline `style` only for computed values. No hardcoded hex/rgb, not even `bg-[#...]`.

## Test Quality Rule
Passing tests != working feature. A regression test must fail on the pre-fix code. Mock only true external boundaries, never the layer the bug lives in. "Verified red" needs the red run linked; otherwise say it cannot be reproduced and name the gate that covers it. UI-visibility bugs need a Playwright spec.

## Boy Scout Rule
Leave touched code cleaner; fix rule violations in what you touch.

## Error reporting
No `except` without `logger.error(..., exc_info=True)`. Services raise `BibliogonError` subclasses with `str(e)`. Frontend passes the `ApiError` to `toast.error`. Generic messages ("Export failed") are forbidden.

## Tests
pytest, Vitest, Playwright. Every endpoint gets a happy-path test; bug fixes start with a failing test. Mock external services. Heavy runs on CI only.

## Touch targets (TOUCH-TARGETS)
Every interactive element has a hit area of at least 44x44px from the start.

## Backup parity (BACKUP-PARITY-PIN)
Export == restore == sync. A new model or column extends the `.bgb` serializer in the same change, with a create -> export -> wipe -> import -> compare test and FK-order pins.

## BACKUP-AKZEPTANZTEST
Any change to storage schemas, Dexie tables, the storage seam or backup/restore must pass `e2e/smoke/backup-acceptance.spec.ts`. Red there is a release blocker; never loosen its assertions.

## Synced-rule reconciliation notes (2026-06-05)
Offline-unavailable features are disabled with a reason, not hidden. Tailwind-first replaces CSS-first.

## Security
No secrets in git, `.env` ignored, licence keys only via LicenseStore, validate uploads, plugin ZIPs get name and path-traversal checks.

## Performance
SQLite is single-writer: batch writes. Autosave is debounced. Lazy-load plugin UI where possible.

## Dependencies
New dependencies only after asking. Prefer what the stack already has (see library-first.md).
