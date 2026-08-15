# Korrektur zum Phase-1-Audit (@astrapi69-Paket-Integration)

**An den Phase-1-Auditor. Vor Phase 2 lesen.**

Der Bericht ist methodisch sauber und hat seine eigene Luecke korrekt
markiert: die Geschwister-Checkouts fehlten, die Paket-Interna kamen aus den
npm-READMEs, und wo die READMEs schwiegen, wurde konservativ "Faehigkeit
abwesend" angenommen.

Diese Annahme war an **zwei** Stellen falsch. Beide sind gegen den echten
Paketcode geprueft, und beide kehren ein Verdikt um. Sie duerfen nicht als
Praemisse in Phase 2 eingehen.

---

## Fehl-Verdikt 1: "Das Kit haelt die Autosave-Garantie nicht"

Das war der deklarierte K.-o.-Grund gegen jede Runtime-Adoption.

**Tatsaechlich** (`packages/core/src/sw-update.ts`):

```ts
const defaultReload = (): void => {
    if (typeof window !== "undefined") window.location.reload();
};
```

Das Kit reloadet mit `window.location.reload()` — **identisch** zu
`swUpdateManager.ts`. `beforeunload` / `pagehide` feuern genauso,
`useFlushOnUnload` laeuft genauso. Die Autosave-Garantie kommt gar nicht aus
dem Update-Code: sie kommt aus dem Consumer-Hook, und den beruehrt das Kit
nicht. Es gibt hier keinen Unterschied und damit keinen K.-o.-Grund.

**Der eigentliche Punkt liegt daneben — und ist wertvoller als das
Fehl-Verdikt:** ein `beforeunload`-Flush kann einen asynchronen
IndexedDB-Write grundsaetzlich **nicht abwarten**. Das gilt fuer bibliogons
heutige Implementierung genauso wie fuer jede Kit-Adoption. Beide Apps haben
an dieser Stelle nur eine Best-Effort-Garantie.

**Daraufhin umgesetzt** (`@astrapi69/pwa-update@0.2.0`):

```ts
createUpdateStore({
    build, manifestUrl,
    onBeforeApply: () => flushEditorToIndexedDb(),   // wird AWAITED
});
```

Der Hook laeuft **vor** dem Start der Aktivierung und wird abgewartet. Ein
Reject wird geschluckt — ein fehlgeschlagener Flush darf den Nutzer nicht mit
einem toten Update-Button auf einem alten Build stehen lassen.

Das ist strikt besser als das, was bibliogon heute hat. Die Frage fuer Phase 2
lautet damit nicht mehr "darf das Kit ueberhaupt", sondern "wollen wir die
staerkere Garantie".

---

## Fehl-Verdikt 2: "ai-key-vault modelliert 3 Provider, kann die
Base-URL-Kategorie nicht"

**Tatsaechlich** (`packages/core/src/providers/registry.ts`, Kopfkommentar):

> *"Provider registry — providers are DATA (descriptor objects), not a
> hardcoded union type. Extracted from adaptive-learner, generalized after
> validating the shape against bibliogon's six-provider needs (anthropic,
> openai, gemini/google, mistral, LM Studio, custom OpenAI-compatible with a
> user base URL): descriptors carry an optional `baseUrl`, an optional
> `requiresApiKey` (local providers have no key), and an optional custom
> `client` for protocols the built-in trio does not cover."*

Der Descriptor traegt `baseUrl`, `requiresApiKey`, `desktopOnly`,
`corsBlocked` und einen eigenen `client`-Hook. Das LM-Studio-Beispiel steht
woertlich als `@example` im Code. Die Registry wurde **explizit gegen
bibliogons Sechs-Provider-Bedarf validiert**, bevor sie veroeffentlicht wurde.

"3 Built-ins ausgeliefert" wurde als "nur 3 modellierbar" gelesen. Provider
sind Daten; ein Consumer registriert seine eigenen. Ausgeliefert werden 3,
akzeptiert werden N.

**Was das fuer Scope B bedeutet:** die Begruendung "Paket kann weniger, also
KEEP" traegt nicht mehr. Die KEEP-Empfehlung kann trotzdem richtig bleiben —
aber dann aus den **anderen**, im Bericht ebenfalls genannten Gruenden, die
weiterhin gelten und die eigentliche Substanz sind:

- der **dual-consumer Mirror** (`buildAiPatch` schreibt zusaetzlich die
  Top-Level-Felder fuer den Backend-AI-Service) — den kennt der
  Single-Consumer-Adapter des Pakets nicht;
- `base_url_overrides` als **per-Provider-User-Override-Map** gegen einen
  konstanten `baseUrl` pro Descriptor — das ist die reale Modellierungsluecke,
  und sie steht im Bericht korrekt drin;
- das 4-Status-Modell inkl. `desktop_only` / `external`.

Diese Punkte bitte in Phase 2 mit Quellcode neu bewerten, nicht die
Provider-Anzahl.

---

## Was korrekt war und umgesetzt wurde

Drei Befunde des Berichts waren richtig und sind bereits im Paket:

| Befund | Umgesetzt in 0.2.0 |
|---|---|
| `manifestUrl` ist Pflichtfeld, bibliogon hat kein version.json | `manifestUrl: string \| null` — SW-only-Modus; ein stiller Worker-Zyklus meldet dann `current` statt `error` |
| Kein proaktives Polling (bibliogon kann Focus + stuendlich seit v0.48.0) | `polling: {intervalMs, onFocus}` + `store.startPolling(isOnline)`, opt-in, ueber denselben Throttle; React verdrahtet Start/Stop am Lifecycle |
| Exakte Pins erzwingen Bump-Kaskaden | `pwa-update-react` haengt jetzt per Caret am Core |

Ebenfalls korrekt und uebernommen: **die drei Banner sind drei Faelle, keine
Dubletten** (ein Primitive + zwei Wirings fuer zwei verschiedene Signale). Der
Zusatzbefund, dass in der PWA beide Banner fuer dasselbe Deploy gleichzeitig
erscheinen koennen, ist ein eigenstaendiger, guter Fund.

**Nicht uebernommen — bewusst:** Caret-Ranges in `ai-key-vault`. Dort bleiben
exakte Pins, weil es eine Krypto-Flaeche ist; die Bump-Reibung wird ueber ein
Makefile-Ziel geloest, nicht ueber gelockerte Ranges. Und die
Provider-Registry wird nicht umgebaut — sie ist bereits richtig gebaut.

---

## Fuer Phase 2

1. **Checkouts zuerst.** `git clone` von `pwa-update-kit`, `ai-key-vault` und
   `adaptive-learner` als Geschwister. Ohne Quellcode entstehen genau diese
   zwei Klassen von Fehl-Verdikt wieder.
2. **Scope B komplett neu** gegen den Quellcode — die Provider-Frage ist offen,
   nicht beantwortet.
3. **A.2 neu bewerten:** die Frage ist jetzt "wollen wir die staerkere
   `onBeforeApply`-Garantie", nicht "darf das Kit ueberhaupt".
4. **Scope C** (feature-strategy / entity-kit gegen adaptive-learner) war ohne
   Checkout gar nicht durchfuehrbar und steht weiterhin aus.

Aktuelle Versionen: `@astrapi69/pwa-update` **0.2.0**,
`@astrapi69/pwa-update-react` **0.2.0**,
`@astrapi69/vite-plugin-build-version` 0.1.0,
`@astrapi69/ai-key-vault` 0.1.1, `-react` 0.1.2,
`@astrapi69/passphrase-vault` 0.1.1.
