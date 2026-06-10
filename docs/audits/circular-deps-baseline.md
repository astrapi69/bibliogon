# Circular Dependencies Baseline — 2026-06-10

First baseline for [madge](https://github.com/pahen/madge) circular-
dependency detection on the TypeScript frontend. Issue #51.

## Ergebnis

- **Zirkuläre Ketten: 0** ✔
- Verarbeitete Dateien: 653 (`src/`, `.ts` + `.tsx`)
- madge: `8.0.0`

```
$ npx --yes madge@8 --circular --extensions ts,tsx src/
Processed 653 files (1.7s) (4 warnings)
✔ No circular dependency found!
```

Because the baseline is clean, the check is wired as a **CI gate**
(`frontend-tests` job in `.github/workflows/ci.yml`): a newly introduced
circular dependency fails the build. Locally: `make circular-deps`.

## Kritisch (müssen aufgelöst werden)

Keine. Es gibt keine zirkulären Ketten.

## Akzeptiert (bekannt, niedrige Priorität)

madge skips 4 imports it cannot resolve. None affect circular detection
(an unresolvable module simply isn't followed):

| Import | Reason |
|--------|--------|
| `@/components/ui/dialog` | `@/` path-alias; madge resolves by extension, not tsconfig `paths` |
| `@/lib/utils` | same path-alias class |
| `tailwindcss/theme.css` | CSS import (madge scans TS only) |
| `tailwindcss/utilities.css` | CSS import |

The two `@/` aliases could be resolved by passing `--ts-config
frontend/tsconfig.json` to madge; deferred as cosmetic — the circular
result is unaffected.

## Tooling note: why madge runs via `npx`, not as a devDependency

madge@8 declares an optional peer `typescript@^5.4.4`, but the frontend
is on `typescript@6.0.3`. `npm install -D madge` fails the strict
resolver, and the project rule forbids `--legacy-peer-deps`
(see `.claude/rules/lessons-learned.md`, TipTap peer-dep section — a
peer conflict would break `npm ci` in CI). madge is therefore invoked
ephemerally via `npx --yes madge@8`, pinned to the v8 major. Revisit
adding it as a pinned devDependency once madge ships a `typescript@^6`
peer range.

## SVG dependency graph

Skipped. The optional `--image` graph over 653 files is not a useful
artifact (and requires Graphviz `dot`). Re-run on demand:

```bash
cd frontend && npx --yes madge@8 --image graph.svg --extensions ts,tsx src/
```

## Regenerating this baseline

```bash
make circular-deps
```
