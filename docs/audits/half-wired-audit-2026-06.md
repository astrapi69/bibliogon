# Half-Wired Feature Audit — 2026-06

Project-wide scan for half-wired features: code that exists but is not
called (dead exports), feature-gates without a feature, empty module
stubs, foundation utilities not yet integrated, dead UI, and backend
endpoints without a consumer.

Context: the *Half-Wired-Lifecycle* rule (see
`.claude/rules/lessons-learned.md`) — a feature that is half-wired AND
user-visible in production triggers P1; a function that exists but is
never called is dead code (lower tier, hygiene).

**Methodology:** `knip` (run with default config — see the false-positive
note below), a targeted dead-export scan over `lib/utils` / `shared/utils`
/ `hooks`, plus manual cross-referencing with `grep`. Each candidate was
verified against real importers before classification; `tsc` and Vitest
(3727) are green on the audited tree.

---

## Summary table

| Kategorie | Fund | Schwere | Empfehlung |
|-----------|------|---------|------------|
| Foundation nicht verdrahtet | `isCheckDue()` (`lib/utils/updateChecker.ts`) | Mittel | Auto-Update-Check (#477 Phase 2) verdrahten **oder** entfernen |
| Foundation nicht verdrahtet | `shouldShowBanner()` (`lib/utils/updateChecker.ts`) | Mittel | dito — Banner-Trigger fehlt |
| Foundation nicht verdrahtet | `UPDATE_INTERVALS_MS`, `RELEASE_TAG_BASE_URL` (updateChecker) | Niedrig | mit dem Auto-Check verdrahten |
| Fehlender Hook | `useUpdateAutoCheck()` existiert nicht | Mittel | #477 Phase 2 (5c): Startup-Hook bauen |
| Toter Export | `RELATIONSHIP_COLORS` (`components/story-bible/relationshipColors.ts`) | Niedrig | entfernen (0 Importer) |
| Toter Export | `syncAllDrafts` (`components/shared/OfflineBanner.tsx`) | Niedrig | entfernen oder verdrahten (0 Importer) |
| Toter Export | `findPictureBookFont` (`data/picture-book-fonts.ts`) | Niedrig | entfernen (0 Importer) |
| Toter Export | `useAuthorChoices` (`hooks/useAuthorChoices.ts`) | Niedrig | test-only; entfernen oder verdrahten |
| Export-Hygiene | `MARKETING_PROMPTS`, `BISAC_CODE_RE`, `STATUS_FILTERS`, `DEFAULT_*` (bubbleConfigReads), `ROYALTY_35_PRICE_RANGES`, `WORDS_PER_PAGE`, … | Niedrig | intern/test-genutzt — `export` entfernen wo nicht gebraucht |
| Dependency-Hygiene | `@radix-ui/react-toggle`, `@tiptap/extension-code-block-lowlight`, `@types/dompurify` ungenutzt | Niedrig | aus `package.json` entfernen |
| Dependency-Hygiene | `hast-util-to-jsx-runtime` genutzt aber nicht deklariert (`textarea/CssPreview.tsx`) | Niedrig | als direkte Dependency aufnehmen |
| Gate ohne Feature | — keine gefunden | OK | alle 34 `FEATURES.*` Gates sind hinterlegt |
| Provider-Gate | `CORS_BLOCKED_PROVIDERS` = leeres Set | OK | alle 6 Provider browser-faehig (Fix #467/#468 bestaetigt) |
| Modul-Stub | alle `modules/*/index.ts` | OK | echte Exporte, keine leeren Barrels |
| UI ohne Funktion | — keine gefunden | OK | kein `onClick TODO/console`, 0 Stub-Marker |

---

## 1. Update-Checker Phase 2 — die eine echte Half-Wired-Stelle

`frontend/src/lib/utils/updateChecker.ts` liefert die Phase-2-Foundation
(`#477`): `isCheckDue()`, `shouldShowBanner()`, `UPDATE_INTERVALS_MS`,
`RELEASE_TAG_BASE_URL`. Alle sind **getestet** (`updateChecker.test.ts`),
aber **kein Laufzeit-Code importiert sie** (verifiziert: 0 Importer ausser
Tests).

Konkret fehlt die Integration:

- `useUpdateAutoCheck()` — der Startup-Hook, der `isCheckDue()` prueft und
  bei abgelaufenem Intervall `checkForUpdate()` + `shouldShowBanner()`
  ausloest — **existiert nicht**.
- `AppUpdateBanner` ist in `App.tsx` gemountet, nutzt aber den
  **Service-Worker-Pfad** (`shared/utils/swUpdateManager.checkForUpdate`),
  nicht den GitHub-API-Auto-Check.
- `UpdateCheckButton` (Settings > Ueber) ruft `checkForUpdate(APP_VERSION)`
  **manuell** auf — dieser Pfad ist verdrahtet und funktioniert.

**Einordnung:** Foundation ist da + getestet, die App-Integration steht
aus. Nicht user-sichtbar kaputt (kein toter Button), daher **Mittel**, nicht
P1. Das ist exakt der offene `#477`-Phase-2-Scope (Settings-Schema +
Allgemein-Abschnitt + `useUpdateAutoCheck` + Banner + i18n).

**Empfehlung:** In `#477` Phase 2 verdrahten. Falls Phase 2 verschoben
wird, sollten die ungenutzten Foundation-Exporte als „reserved for #477
Phase 2" im Docstring markiert bleiben (sie sind bereits getestet, also
kein Risiko), damit sie nicht versehentlich als toter Code entfernt werden.

`compareVersions()` ist **kein** Fund — es wird modul-intern von
`checkForUpdate()` und `shouldShowBanner()` genutzt (korrekt verdrahtet).

## 2. Genuinely dead exports (Hygiene, niedrig)

Verifiziert ohne nicht-Test-Importer:

- `RELATIONSHIP_COLORS` (`components/story-bible/relationshipColors.ts`) —
  der genutzte Wert kommt aus `relationshipColors` (Funktion); die
  Konstante ist verwaist.
- `syncAllDrafts` (`components/shared/OfflineBanner.tsx`) — definiert,
  nirgends aufgerufen.
- `findPictureBookFont` (`data/picture-book-fonts.ts`).
- `useAuthorChoices` (`hooks/useAuthorChoices.ts`) — nur in Tests.

Dazu eine Reihe modul-intern/test-genutzter `export`-Konstanten
(`MARKETING_PROMPTS`, `BISAC_CODE_RE`, `STATUS_FILTERS`, die `DEFAULT_*`
aus `comics/bubbleConfigReads.ts`, `ROYALTY_35_PRICE_RANGES`,
`WORDS_PER_PAGE`, …). Diese sind nicht „half-wired" — sie funktionieren,
ihr `export` ist nur breiter als noetig. Aufraeumen ist Boy-Scout-Arbeit,
kein Feature-Gap.

## 3. Verifiziert OK (keine Half-Wired-Stellen)

- **Feature-Gates:** 34 `FEATURES.*`-IDs, alle ueber die
  `@astrapi69/feature-strategy`-Registry (`features/featureConfig.ts`)
  hinterlegt. Desktop-only-Features (git/tts/pandoc/lan/…) sind korrekt
  als `disabled` + Reason sichtbar (Policy #78). Kein Gate ohne Feature.
- **AI-Provider (Task #467/#468):** `CORS_BLOCKED_PROVIDERS` ist ein
  **leeres Set** → `isProviderBrowserCapable()` ist `true` fuer alle 6
  Provider (Gemini/Anthropic/OpenAI/Mistral/LM Studio/Custom). Das
  `PROVIDER_CORS_BLOCKED`-Gate feuert nur, falls kuenftig ein Provider in
  das Set aufgenommen wird — bewusst inerte Zukunfts-Absicherung, kein
  Half-Wired. Die verbleibenden `DESKTOP_ONLY`-Referenzen betreffen
  ausschliesslich Git-Operationen (`BookMetadataEditor`, `GitRepoInfo`,
  `useGitStatus`) — korrekt.
- **Module:** alle `modules/*/index.ts` exportieren echte Funktionalitaet
  (1–8 Exporte), keine leeren Barrels.
- **Dead UI:** kein `onClick` mit `TODO`/`console.`/`() => {}`, 0
  `TODO/FIXME/STUB`-Marker im `src/`-Code.

## 4. knip-Befund: einzuordnende False-Positives

`knip` lief mit Default-Config (keine `knip.json` mit Entry-Points), daher
**ueber-meldet** es. Konkret als False-Positive verifiziert und **nicht**
in der Tabelle gefuehrt:

- *Unused files (26)* — die Konvention-Barrels (`components/*/index.ts`,
  `modules/*/index.ts`, `lib/components/index.ts`) und
  `public/asset-intercept-sw.js`. Die Barrels sind API-Flaeche (kein
  Pflicht-Importeur); der SW wird zur Build-Zeit via
  `workbox.importScripts` geladen (dokumentiert in lessons-learned). Kein
  toter Code.
- *Unused exports* der `default function`-Komponenten (comics:
  `ComicBubble`, `ComicPanel`, … ; `LanAccessSettings`; …) — verifiziert,
  dass z. B. `ComicBubble` in `ComicPanel.tsx:27` importiert wird. knip
  loest Default-Export-Komponenten ohne Entry-Point-Config nicht
  zuverlaessig auf.

Empfehlung: eine `knip.json` mit den echten Entry-Points (`src/main.tsx`,
SW, Vitest-Setup) wuerde knip CI-tauglich machen — separater Track, kein
Half-Wired.

## 5. Backend-Endpunkte & i18n — Methodik-Grenze

- **Backend:** 235 Endpunkte (`@router.*` in `backend/app/routers/` +
  Plugin-`routes.py`). Eine vollstaendige Endpoint→Frontend-Konsumenten-
  Matrix braucht dediziertes Tooling. Stichprobe: `reset-token`,
  `toc-validation`, `import-staging` haben keine direkten Frontend-Pfad-
  Referenzen — das sind aber **backend-interne Service-Flows** (Reset-Nonce,
  Export-TOC-Pruefung, Import-Staging), keine half-wired UI. Kein
  klarer Half-Wired-Befund in der Stichprobe.
- **i18n:** 3347 Keys im `de.yaml`. Systematische Unused-Key-Erkennung
  braucht ein `i18next-parser`-artiges Tool (nicht im Projekt); nicht
  erschoepfend gelaufen. Als eigener Hygiene-Track vermerkt.

---

## Priorisierte Empfehlungen

1. **Jetzt (P2, user-naher Wert):** Update-Checker Phase 2 (#477)
   verdrahten — `useUpdateAutoCheck()` + Banner-Trigger + Settings-Schema.
   Das schliesst die einzige echte Half-Wired-Foundation. (Bis dahin: kein
   user-sichtbarer Schaden, da kein toter Button.)
2. **Bald (P3, Hygiene):** verwaiste Exporte entfernen
   (`RELATIONSHIP_COLORS`, `syncAllDrafts`, `findPictureBookFont`,
   `useAuthorChoices`); ungenutzte Dependencies droppen
   (`@radix-ui/react-toggle`, `@tiptap/extension-code-block-lowlight`,
   `@types/dompurify`); `hast-util-to-jsx-runtime` als direkte Dependency
   deklarieren.
3. **Optional (P4, Tooling):** `knip.json` mit Entry-Points hinzufuegen,
   damit Dead-Code-Erkennung CI-tauglich + zuverlaessig wird.

**Gesamtbild:** Das Projekt ist erstaunlich frei von Half-Wired-Features.
Die einzige substantielle Stelle ist die bewusst phasenweise gebaute
Update-Checker-Integration (#477 Phase 2) — Foundation + Tests vorhanden,
App-Verdrahtung ausstehend. Alles Uebrige sind kleine Export-/Dependency-
Hygiene-Punkte ohne User-Impact.
