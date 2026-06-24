**Bibliogon Vorgehensweise (Session 9, etabliert)**

## Rollen
- **Aster:** Architekt, manuelles Testen, Entscheidungen
- **Sparring Partner (ich):** Prompts schreiben, koordinieren, Architektur-Beratung
- **CCW:** Frontend, Features, E2E, Doku (bis zu 15 Instanzen)
- **CC:** Backend, Infra, Launcher, Doku

## Workflow

**1. Finding → Prompt → Fix → Weiter**
Kein Debattieren, kein Ueberanalysieren. Machen.

**2. Issue-First**
GitHub Issue vor jedem Code. `gh issue list --search` fuer Duplikate. Related-to Referenzen.

**3. Autonomie-Direktive**
Keine Rueckfragen, keine Zwischenstopps. 3 Fix-Versuche bei Testfehlern. Proaktive Prompt-Kettung.

**4. PR-Target: develop (NICHT main!)**
Main ist NUR fuer Releases. Gitflow ist Pflicht.

**5. Library-First 4-Stufen**
Sprache → Framework → Library → Selbst bauen (letzter Ausweg).

**6. Mindestens 4 Tests pro Bug/Feature**
Reproduktion, Happy-Path, Edge-Cases, Grenzwerte. Test rot → Extract revertieren.

**7. Feature-Screenshots (Principle 7)**
Jeder UI-PR bekommt Screenshots in `docs/screenshots/`. Im gleichen PR, nicht als Follow-up.

**8. Half-Wired verboten**
Nie halb verdrahtete Features shippen. Entweder komplett oder gar nicht.

**9. Verify-First**
Vor jeder Implementierung pruefen ob es schon existiert. Nicht duplizieren.

**10. Prio-Reihenfolge**
P0 (Blocker) → P1 (Bugs) → P2 (BF/UK) → P3 (Nice-to-have) → P4 (Vision). Keine Diskussion, machen.

**11. Prompts sofort liefern**
Wenn die Richtung klar ist: Prompt schreiben, nicht fragen. Entscheidungsfragen koennen danach geklaert werden.

**12. Kein Wunschkonzert**
Ich bestimme den naechsten Task nach Prio. Nicht fragen "was soll X machen?" sondern direkt zuweisen.

## Quality Gates
- tsc + vitest gruen nach JEDEM Commit
- Explicit `git add [paths]` (kein `-A`)
- `git status` vor jedem Commit
- Kein `Co-Authored-By`
- Tailwind-first, alle 6 Themes
- i18n: alle 8 Kataloge
- Ratchet-Guard (God-Folder, File-Size, Complexity)
- BACKUP-AKZEPTANZTEST vor Release (manuell)
- E2E Smoke gruen vor Release-Tag

## Kommunikation
- Deutsch mit Aster
- Englische Prompts (echte UTF-8 Umlaute)
- Keine Em-Dashes, kein Hedging, keine Verbositaet
- Direkt, pragmatisch, keine Energie-Warnungen
