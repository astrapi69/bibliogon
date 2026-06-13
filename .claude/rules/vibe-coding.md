# Vibe Coding Rules

Vollstaendige Policy: docs/VIBE-CODING-POLICY.md

## Kurzregeln fuer jeden Task

1. PROMPT-PRAEZISION: Referenziere existierende Patterns (guardedFetch,
   IStorageService, Repository Pattern, feature-strategy Gates) statt neu
   zu erfinden. Nenne Datei, Funktion, erwartetes Verhalten.

2. SCHICHTARCHITEKTUR: Keine Business-Logik in Komponenten. Keine
   DB-Queries in Routern. Keine direkten fetch-Calls. Dependency
   Direction: Router -> Service -> Repository -> Models.

3. TESTS: Jede Verhaltensaenderung braucht Tests. Neue Tests muessen
   auf Pre-Fix-Code rot sein. Coverage Illusion vermeiden: Playwright-
   visible ist nicht User-visible, Hoehe pruefen nicht nur Sichtbarkeit.

4. DEPENDENCIES: Keine neuen Dependencies ohne manuelle Pruefung auf
   Wartungsstatus und Sicherheit. Bestehende Dependencies bevorzugen.

5. REFACTORING: God-Files splitten, nicht whitelisten. Whitelist nur
   fuer Single-Concern Dateien (Models, Schemas, statische Daten).

6. GIT: Issue ZUERST (GITHUB-ISSUE-PFLICHT). Closes #XX in jedem
   Commit. Docstrings statt Inline-Kommentare. Ein Concern pro PR.
   Explicit git add [paths], kein git add -A.

## Prioritaet (fest, nicht verhandelbar)

1. Offene PRs mergen
2. P0/P1 Bugs
3. Infrastruktur (CI, Security, Guards)
4. UI-Fixes
5. Cleanup/Refactoring
6. Features
7. Release

Fundament vor Features. Erst messen, dann absichern.
