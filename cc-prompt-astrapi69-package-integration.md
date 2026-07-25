# CC-Prompt: Bibliogon — Integration des @astrapi69-Paket-Oekosystems (Phase 1: Audit + Design)

## Single-Session-Auftrag

**Audit- und Designauftrag, keine Umsetzung.** Das @astrapi69-Oekosystem ist
auf neun npm-Pakete gewachsen; Bibliogon konsumiert davon bisher drei. Dieser
Auftrag klaert, was Bibliogon uebernehmen sollte, was es behalten sollte, und
wo umgekehrt die Pakete von Bibliogon lernen muessen.

Phase 1 = Audit + Design + Migrationsplan. Phase 2 (Umsetzung) erst nach
expliziter Freigabe. Gleiche Disziplin wie bei den Extraktionen in
adaptive-learner.

## Ausgangslage (verifiziert gegen die npm-Registry)

| Paket | npm | Bibliogon heute | adaptive-learner |
|---|---|---|---|
| `@astrapi69/entity-kit` | 0.3.1 | `^0.3.1` | — |
| `@astrapi69/feature-strategy` | 0.1.2 | `^0.1.0` | `^0.1.2` |
| `@astrapi69/feature-strategy-react` | 0.1.2 | `^0.1.0` | `^0.1.2` |
| `@astrapi69/passphrase-vault` | 0.1.1 | — | transitiv |
| `@astrapi69/ai-key-vault` | 0.1.1 | — | `0.1.0` |
| `@astrapi69/ai-key-vault-react` | 0.1.2 | — | `0.1.1` |
| `@astrapi69/pwa-update` | 0.1.0 | — | in PR |
| `@astrapi69/pwa-update-react` | 0.1.1 | — | in PR |
| `@astrapi69/vite-plugin-build-version` | 0.1.0 | — | in PR |
| `learn-content-engine` (unscoped) | 0.13.1 | — | `0.13.0` |

Repos liegen als Geschwister-Checkouts vor (`../pwa-update-kit`,
`../ai-key-vault`, `../adaptive-learner`). READMEs lesen — insbesondere
"Platform quirks this package encodes" im pwa-update-Kern.

## WICHTIG: Bibliogon ist kein Swap-Fall

In adaptive-learner war die pwa-update-Extraktion ein 1:1-Tausch, weil der
Code dort ohnehin app-agnostisch geschrieben war. In Bibliogon ist das
anders — und das ist der eigentliche Kern dieses Auftrags. Vorab verifizierte
Abweichungen:

1. **Bibliogon emittiert kein `version.json`.** `frontend/vite.config.ts`
   definiert nur `__APP_VERSION__` / `__BUILD_HASH__`; die Update-Erkennung
   laeuft ueber den Service Worker plus die GitHub-Releases-API. Die
   Kernannahme des Kits (ein deployter Manifest-Endpunkt) existiert dort
   nicht. Klaeren: version.json einfuehren, das Kit SW-only betreiben, oder
   nicht adoptieren.

2. **`frontend/src/shared/utils/swUpdateManager.ts` kann zwei Dinge, die das
   Kit NICHT kann** — und die auf keinen Fall verloren gehen duerfen:
   - **Autosave-Sicherheit:** der Reload ist bewusst eine normale Navigation,
     damit `beforeunload`/`pagehide` feuern und `useFlushOnUnload` den
     Editor-Inhalt vorher nach IndexedDB schreibt. Ein Update-Mechanismus,
     der ungespeicherten Kapiteltext verliert, ist in einer Autoren-App
     schlimmer als gar kein Update-Mechanismus.
   - **Proaktives Polling:** Fokus / Visibility / stuendliches
     `registration.update()` (seit v0.48.0). Das Kit kennt nur den
     Foreground-Recheck mit Throttle.

   Das ist der wahrscheinlichste Fall, in dem der Fluss UMGEKEHRT laufen
   muss: nicht "Bibliogon uebernimmt das Kit", sondern "das Kit lernt von
   Bibliogon". Ein Paket-PR gegen `pwa-update-kit` ist ein voellig legitimes
   Ergebnis dieses Audits.

3. **Drei Banner-Komponenten nebeneinander:**
   `components/shared/AppUpdateBanner.tsx`,
   `components/shared/AppVersionUpdateBanner.tsx`,
   `lib/components/UpdateBanner.tsx`. Pruefen, ob das gewachsene Dubletten
   sind oder drei bewusst verschiedene Faelle. Wenn Dubletten: eigener Befund,
   eigenes Issue, unabhaengig von jeder Paket-Adoption.

4. **6 AI-Provider statt 3.** `frontend/src/utils/ai/aiProviders.ts` fuehrt
   anthropic / openai / google / mistral / lmstudio / custom. `ai-key-vault`
   kennt drei. `lmstudio` und `custom` sind Base-URL-Provider (lokale bzw.
   frei konfigurierbare Endpunkte) — eine Kategorie, die die Paket-Registry
   heute gar nicht modelliert. Das ist eine Paket-Erweiterung, kein
   Consumer-Detail.

## Scope Phase 1

### A. pwa-update-Familie
Vollstaendig lesen, nicht rekonstruieren: `shared/utils/swUpdateManager.ts`,
`hooks/ui/useUpdateAutoCheck.ts`, `lib/utils/updateChecker.ts`, die drei
Banner, `settings/UpdateCheckButton.tsx`, `settings/NextUpdateCheck.tsx`,
`vite.config.ts`. Pro Modul: adoptieren / behalten / ans Paket zurueckgeben,
mit Begruendung.

### B. ai-key-vault-Familie
`utils/ai/aiProviders.ts`, `settings/ConfiguredProvidersTable.tsx` und alles,
was Provider-Keys liest oder schreibt. Konkret klaeren:
- Was fehlt der Paket-Registry fuer `lmstudio` + `custom` (Base-URL, ggf.
  kein Key noetig, ggf. abweichende Auth)?
- Wie sieht Bibliogons Key-Storage aus, und passt der
  `ISettingsNamespace`-Adapter des Pakets darauf?
- Braucht Bibliogon den passphrasen-verschluesselten Tresor ueberhaupt?

### C. Bereits konsumierte Pakete
`entity-kit` und `feature-strategy(-react)`: laufen sie auf der aktuellen
Version, und nutzt Bibliogon sie so, wie adaptive-learner es tut? Divergenz
in der Nutzung desselben Pakets ist ein eigener Befund.

### D. Querschnitt (fuer JEDE Adoption zu pruefen)
1. **Storage-Key-Kompatibilitaet.** In adaptive-learner war
   `storageNamespace: "adaptive-learner"` load-bearing: es reproduziert die
   Alt-Keys byte-genau, sonst vergisst jede installierte PWA den bereits
   angewendeten Update-Zustand. Welche localStorage-/sessionStorage-Keys hat
   Bibliogon heute, und bleiben sie erhalten?
2. **i18n-Keys.** Das Kit bringt eigene `pwa.update.*`-Keys mit. In
   adaptive-learner wurden die BESTEHENDEN App-Keys durchgereicht statt die
   Paket-Keys zu uebernehmen — sonst fallen alle Kataloge auf englischen
   Fallback. Welche Keys hat Bibliogon?
3. **E2E-Selektoren.** Welche `data-testid`s haengen an den betroffenen
   Flaechen? Falls das Kit sie nicht abbilden kann: das Kit anpassen, nicht
   die geraeteverifizierten Specs umschreiben (Praezedenz: `VersionCard`
   bekam dafuer eine `testIds`-Prop).
4. **Exakte Dependency-Pins.** Beide Kits pinnen ihre internen
   Abhaengigkeiten exakt, nicht per Caret. Jeder Patch eines unteren Pakets
   erzwingt ein Bump aller darueberliegenden (deshalb wurde ai-key-vault-react
   0.1.2 statt 0.1.1). Einordnen, ob Caret-Ranges die bessere Wahl waeren —
   das betrifft dann beide Kits, nicht nur Bibliogon.

## Verify-First

Jedes genannte Modul vollstaendig lesen. Keine Aussage aus der Erinnerung
oder aus Analogie zu adaptive-learner. Wo eine Behauptung ueber
Laufzeitverhalten noetig ist ("der SW aktiviert hier so"), kennzeichnen ob
gelesen oder gefolgert.

## Nicht verhandelbar

- **Autosave-Sicherheit beim Update-Reload.** Wenn eine Adoption diese
  Garantie nicht halten kann, ist die Antwort "nicht adoptieren", nicht
  "vermutlich reicht es schon".
- **"Behalten" ist ein vollwertiges Ergebnis.** Es gibt keine Punkte fuers
  Adoptieren um des Adoptierens willen. Ein Paket, das weniger kann als der
  bestehende Code, wird nicht uebernommen.
- Keine Code-Aenderung, kein Paket-Install, kein PR in dieser Session.

## Endbericht

- Pro Modul: adoptieren / behalten / ans Paket zurueckgeben, mit Begruendung
- Autosave-Sicherheit: haelt das Kit sie, oder muss es sie lernen?
- version.json: einfuehren, SW-only fahren, oder nicht adoptieren?
- Die drei Banner: Dubletten oder drei Faelle?
- Provider-Registry: was fehlt dem Paket fuer lmstudio + custom
- Storage-Key- und i18n-Kompatibilitaet
- Nutzungsdivergenz bei entity-kit / feature-strategy gegenueber
  adaptive-learner
- Konkrete PR-Liste fuer Phase 2, getrennt nach "gegen bibliogon" und "gegen
  die Paket-Repos"
- Aufwandsschaetzung
- Offene Designfragen vor Phase 2

## Geraeteverifikation

Fuer Phase 1 nicht zutreffend. Fuer Phase 2 vormerken: auf einer installierten
iOS-Standalone-PWA aktiviert sich ein neuer Service Worker erst nach
vollstaendigem App-Neustart; das Kit traegt dafuer `needsFullRestart` plus
einen Klartext-Hinweis im Banner.
