# Test-Driven Development (TDD)

## Pflicht fuer alle Code-Aenderungen

Jede Code-Aenderung folgt dem Red-Green-Refactor Zyklus:

### Phase 1: RED (Test zuerst)
- Test schreiben der die gewuenschte Aenderung beschreibt
- Test muss fehlschlagen (beweist dass das Feature/der Fix
  noch nicht existiert)
- Kein Produktionscode vor dem fehlschlagenden Test

### Phase 2: GREEN (Minimale Implementierung)
- Nur exakt den Code schreiben der den Test gruen macht
- YAGNI: keine vorzeitige Optimierung
- tsc + vitest/pytest gruen

### Phase 3: REFACTOR (Aufraeumen)
- Code-Smells, Duplikation, Benennung verbessern
- Tests muessen gruen bleiben

## Minimum 4 Tests pro Feature/Fix

1. Reproduktionstest (Red vor dem Fix)
2. Happy-Path
3. Edge-Cases
4. Grenzwerte / Boundary

## Bug-Fixes

- IMMER zuerst einen Test schreiben der den Bug reproduziert
- Test muss RED sein (beweist den Bug)
- Dann fixen bis GREEN
- Der Test bleibt als Regression-Guard

## Ausnahmen

- Reine Doku-Aenderungen (kein Code)
- Reine Konfiguration (CI, Makefile) ohne Logik
- Refactoring existierender Dateien mit bestehenden Tests
  (Tests muessen weiterhin gruen sein)
