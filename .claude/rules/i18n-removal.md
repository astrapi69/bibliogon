# i18n Key Removal Checklist

Removing an i18n key looks trivial but has a wide blast radius: the
key may be referenced by a *dotted path* (`t("ui.settings.foo")`), by a
*bare name* in a structural guard test, by a *seed mirror* consumed by
the offline PWA, or by backend code. A frontend-only / dotted-path-only
grep misses the guards and the mirrors.

## Before removing any i18n key

Run all four greps. **All four must return zero hits** before the
removal is safe:

1. **Dotted paths** (frontend call sites):
   ```bash
   grep -rn "ui.settings.plugin_export" frontend/src
   ```
2. **Bare names** (structural guards reference keys by name, not path):
   ```bash
   grep -rn "plugin_export" backend/tests/
   ```
3. **Critical-key guards** (hard-coded required-key sets):
   ```bash
   grep -rn "plugin_export" backend/tests/**/test_i18n_*.py
   ```
4. **Seed-data mirrors** (the offline PWA reads these, not the YAML):
   ```bash
   grep -rln "plugin_export" frontend/src/storage/seed/seed-i18n-*.json
   ```

A non-zero hit in (1) means a live consumer still needs the key — do
not remove. A hit in (2)/(3) means a guard test asserts the key exists
— update the guard in the same commit as the removal. A hit in (4)
means the seed mirror still carries the key — prune it (and re-run
`make generate-seed-data` when a local `backend/config/app.yaml`
exists, otherwise hand-edit the seed JSON) so the catalog and its
offline mirror stay in parity.

## After removing

- Re-run the four greps to confirm zero hits.
- Verify i18n key-parity across all 8 catalogs (the
  `test_i18n_parity` shape): every catalog must carry the identical
  key set.
- `git grep` the removed key name once more across the whole repo to
  catch help docs, e2e specs, and config defaults.

## Why this rule exists

The White-Label removal (#150) removed 14 keys after a frontend +
dotted-path grep, but `backend/tests/test_i18n_structure.py`
referenced three of them by **bare name** in a critical-key guard. The
guard turned both CI Backend Tests and Backend Coverage red on a
legitimate removal. Greps (2) and (3) above would have caught it before
the push.
