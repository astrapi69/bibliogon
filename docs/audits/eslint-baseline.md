# ESLint + Prettier Baseline

Datum: 2026-06-10
Branch: `fix/eslint-prettier` (Issue #48)
Tooling: ESLint 10.4.1 (Flat-Config), Prettier 3.8.4, typescript-eslint 8.x

> Baseline-Messung, **kein** CI-Gate. ESLint/Prettier blockieren weder
> Commits noch CI. Die Schwellen werden in späteren Sessions iterativ
> verschärft (Warnungen → Errors), wenn die jeweiligen Befunde abgearbeitet
> sind.

## Setup

- `frontend/eslint.config.js` — Flat-Config (kein `.eslintrc`). Reihenfolge:
  `js.recommended` → `typescript-eslint.recommended` → `security.recommended`
  → react-hooks → projektspezifische Regeln → `eslint-config-prettier`
  **zuletzt** (deaktiviert alle Formatierungsregeln, damit ESLint und
  Prettier nicht kollidieren).
- `frontend/.prettierrc` — `tabWidth: 4`, `semi: true`, `singleQuote: false`,
  `trailingComma: "all"`, `printWidth: 100`.
- `frontend/.prettierignore` — `dist/`, `dev-dist/`, `node_modules/`,
  `coverage/`, `src/storage/seed/*.json`.
- Makefile: `make lint-frontend`, `make format-frontend`
  (`make format-frontend ARGS="--write src/components/Foo.tsx"` für gezielte
  Formatierung einzelner geänderter Dateien).

### Prettier-`tabWidth`: warum 4, nicht 2

`coding-standards.md` nennt „2 spaces (TypeScript/CSS)", aber Prettier wurde
nie auf den Bestand angewendet, und der Bestand ist davon abgedriftet. Messung
über alle `src/**/*.{ts,tsx}` (dominanter Einrück-Schritt pro Datei):

| Einrück-Schritt | Dateien |
|-----------------|---------|
| 4 Spaces | 213 |
| 2 Spaces | 92 |
| 1 Space | 6 |

Der tatsächliche Stil ist mehrheitlich **4-Space** mit Doppel-Quotes und
Semikolons. `.prettierrc` bildet diesen Bestand ab (Regel: „Config muss zum
Bestand passen") — das minimiert künftigen Churn beim Formatieren geänderter
Dateien. Die Doku-Regel (2-Space) ist gegenüber der Realität veraltet; ein
Abgleich Doku↔Bestand ist ein separates Follow-up.

**Prettier wurde NICHT auf die gesamte Codebasis angewendet** (würde
git-blame brechen). Formatierung läuft nur auf geänderten Dateien beim Editieren.

## Baseline-Messung

`npx eslint "src/**/*.{ts,tsx}"`:

```
73 problems (15 errors, 58 warnings)
```

### Top-Regeln nach Häufigkeit

| Anzahl | Regel | Stufe |
|--------|-------|-------|
| 40 | `@typescript-eslint/no-unused-vars` | warn |
| 7 | `react-hooks/exhaustive-deps` | warn |
| 5 | `security/detect-non-literal-fs-filename` | warn |
| 5 | `react-hooks/rules-of-hooks` | **error** |
| 4 | `jsx-a11y/media-has-caption` (unbekannte Regel) | **error** |
| 2 | `@typescript-eslint/no-this-alias` | **error** |
| 1 | `security/detect-unsafe-regex` | **error** |
| 1 | `security/detect-non-literal-regexp` | **error** |
| 1 | `no-useless-assignment` (mehrfach) | **error** |

### Die 15 Errors — Einordnung (nicht in dieser Session gefixt)

Per Vorgabe „keine ESLint-Errors mass-fixen". Die Baseline ist non-blocking;
die Errors sind Signale für gezielte Folge-Sessions:

- **5× `react-hooks/rules-of-hooks`** — potenziell echte Bugs (Hook bedingt
  bzw. in Nicht-Komponenten-Funktion aufgerufen). Höchste Priorität für ein
  Follow-up, jeweils einzeln zu prüfen.
- **4× `jsx-a11y/media-has-caption` „Definition for rule not found"** —
  Config-Artefakt: im Code stehen `eslint-disable`-Direktiven für
  `eslint-plugin-jsx-a11y`, das (noch) nicht installiert ist. Behebbar durch
  Hinzufügen des Plugins (neue Dependency → erst freigeben) ODER Entfernen der
  veralteten Direktiven. Bewusst offengelassen, kein ungefragter Dep-Zuwachs.
- **2× `@typescript-eslint/no-this-alias`**, **4× `no-useless-assignment`**,
  Rest — kleinere Korrektheits-/Hygiene-Hinweise.

### Bewusst justierte Regeln

- `no-undef: off` — tsc deckt undefinierte Identifier ab; die Core-Regel
  produziert nur Fehlalarme bei TS/DOM/Service-Worker-Globals.
- `@typescript-eslint/no-explicit-any: warn` — der Bestand hat nur ~7 echte
  `any` (alle dokumentiert); als Warnung gehalten, bis sie abgearbeitet sind.
- `security/detect-object-injection: off` — extrem hohe Fehlalarmquote
  (jeder berechnete Property-Zugriff); die gezielten Security-Regeln bleiben an.

## Offene Follow-ups

- `react-hooks/rules-of-hooks` (5×) einzeln verifizieren und beheben.
- `eslint-plugin-jsx-a11y` evaluieren (Dependency-Freigabe) oder veraltete
  `jsx-a11y`-Disable-Direktiven entfernen.
- Warnungen schrittweise auf `error` ziehen, sobald die jeweilige Klasse
  auf 0 ist.
- Husky + lint-staged (Pre-Commit-Hook für ESLint/Prettier auf geänderte
  Dateien) — in dieser Session zurückgestellt; eigenes Follow-up.
- Doku-Regel `coding-standards.md` (2-Space TS) gegen den 4-Space-Bestand
  abgleichen.
