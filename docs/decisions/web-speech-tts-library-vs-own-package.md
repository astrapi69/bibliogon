# Web Speech TTS — `react-text-to-speech` statt eigenem Paket

**Status:** Vorschlag, wartet auf Asters Entscheidung.
**Anlass:** Extraktions-Audit von `adaptive-learner` (2026-07-22). TTS war der
staerkste Extraktions-Kandidat, weil beide Apps ihn handgeschrieben doppeln.
**Ergebnis des Spikes:** kein Paket bauen. Beide Apps auf eine bestehende
Library, ~25 Zeilen bewusst duplizieren.

Nichts davon ist umgesetzt. Der Vorschlag betrifft
`frontend/src/hooks/ui/useWebSpeechTts.ts` (171 Zeilen) plus
`components/editor/EditorTtsControls.tsx` (214 Zeilen).

---

## Ausgangslage

Beide Apps sprechen die Web Speech API direkt an, unabhaengig voneinander
entwickelt, mit denselben Fallen:

| | adaptive-learner | bibliogon |
|---|---|---|
| Synthese | `lib/voice/speech-synthesis.ts` (166) | `hooks/ui/useWebSpeechTts.ts` (171) |
| Erkennung | `lib/voice/speech-recognition.ts` (157) | — |
| Prefs | `lib/voice/voicePref.ts` (262) | im Hook (`voiceURI`, `rate`) |
| UI | Lesson-Vorlesen | `EditorTtsControls.tsx` (214) |

Zwei echte Konsumenten fuer **Synthese**, einer fuer **Erkennung**. Die beiden
Belange liegen in adaptive-learner nur deshalb im selben Ordner, weil sie
beide "Sprache" heissen — ein Paket haette bibliogon Erkennungs-Code
aufgezwungen, den es nie aufruft. Geteilt ist ausschliesslich TTS.

## Der Spike

`react-text-to-speech@5.1.10` (publiziert 2026-05-24) wurde entpackt und im
**Quellcode gelesen**, nicht anhand seiner Doku bewertet.

### Frage 1 — loest es die `getVoices()`-Falle?

**Ja.** `dist/index.mjs:707-714`: leere Voice-Liste wird erkannt,
`voiceschanged` abonniert, der Listener sauber abgeraeumt.

Zwei Unterschiede zu unseren Implementierungen:
- **Kein Timeout.** adaptive-learner deckelt bei 2s gegen kaputte Browser.
  Die Lib wartet unbegrenzt — sie haengt nicht, liefert aber auch kein Signal.
- **Hook statt Promise.** `useVoices()` gibt reaktiven State. Imperative
  Aufrufer brauchen einen Umbau oder einen Wrapper.

### Frage 2 — laesst sich die Voice-Auswahl injizieren?

**Teilweise.** Die Lib nimmt `voiceURI?: string | string[]`; das Array wirkt
als Fallback-Kette. Aber sie matcht (`dist/index.mjs:668`) auf die **exakte
`voiceURI`** — das geraetespezifische Voice-Kuerzel:

```js
const voice = voices.find((voice) => voice.voiceURI === uri);
```

adaptive-learners `pickVoice()` matcht dagegen auf **BCP-47 mit
Praefix-Abstieg**: `en-US` exakt → `en-*` Praefix → bares `en`. Das kann die
Lib nicht.

**Folge:** Die Auswahl-Logik bleibt bei uns. Die Lib bietet die Stelle, an der
man das Ergebnis reinreicht (die geordnete `voiceURI[]`-Liste), nicht die
Logik selbst.

### Frage 3 — was kostet sie?

- **7,2 KB gzipped**, **null** Runtime-Dependencies
- Icons als separater Export (`./icons`) — werden nicht mitgezogen
- Peer: React 17/18/19 — beide Apps passen
- iOS: **systematisch behandelt** — siehe den Abschnitt "iOS-Langtext" unten

## Gap-Analyse

| | Lib | eigener Code | Gap |
|---|---|---|---|
| `voiceschanged`-Falle | ja | ja | keiner (fehlender Timeout unkritisch) |
| BCP-47-Praefix-Kette | **nein** | ja | bleibt bei uns (~25 Zeilen) |
| awaitbares `loadVoices` | nein (Hook) | ja | Umbau imperativer Aufrufer |
| Prefs-Persistenz | nein | ja | app-spezifisch, bleibt ohnehin |
| Queue, Chunking, Highlighting | **ja** | nein | Zugewinn |
| iOS-Langtext (Stueckelung) | **ja** | nein | **behebt einen Bestandsfehler** |
| Pause / Resume / Stop | ja | ja | — |

### iOS-Langtext — die Lib kann mehr als unser Code

iOS Safari bricht eine ungestueckelte Utterance nach ~15 Sekunden ab. Die Lib
stueckelt jeden Text vor der Synthese, und die Stueckgroesse haengt an einer
expliziten iOS-Erkennung (`dist/index.mjs:143-144`):

```js
size = size ? Math.max(size, 50) : isMobile() ? 250 : desktopChunkSize;
```

`isMobile(iOS = true)` (`dist/index.mjs:95-99`) prueft
`navigator.userAgentData.mobile` mit UA-Regex-Fallback inklusive iOS. Auf iOS
also 250 Zeichen pro Chunk, per Default.

**adaptive-learner stueckelt nicht** — `collectTheoryRun()` uebergibt einen
ganzen Theorie-Block als eine Utterance. Das Theorie-Vorlesen bricht dort auf
iOS vermutlich mitten im Text ab; ein Bestandsfehler, den die Migration
behebt.

Fuer bibliogon ist das potenziell der groessere Gewinn als das Highlighting:
ein vorgelesenes **Kapitel** ist um Groessenordnungen laenger als ein
Lektions-Theorieblock. Ob `useWebSpeechTts.ts` heute selbst stueckelt, ist
ungeprueft (siehe Grenzen).

## Vorschlag

**Library nehmen, kein `@astrapi69/web-tts` bauen.**

Der Grund ist nicht "die Lib kann alles" — die BCP-47-Kette kann sie gerade
nicht. Der Grund ist die Rechnung danach: nach einer Adoption bleibt als
*geteilter* Rest genau `pickVoice()` — **~25 Zeilen reine Funktion, null
Dependencies, kein Browser-API-Zugriff**. Dafuer ein npm-Paket mit Repo, CI,
Release-Zyklus und Bump-Kaskade zu unterhalten kostet mehr, als es an zwei
Stellen zu duplizieren. Das ist die Grenze, an der Stufe 4 der
Implementierungs-Hierarchie (Sprache → Framework → Library → Selbst) nicht
mehr traegt.

Fuer bibliogon kommt ein Argument dazu, das adaptive-learner nicht hat:
**Highlighting**. Beim Vorlesen im Editor ist mitlaufende Hervorhebung nicht
Beiwerk, sondern der Kern des Features — und die Lib bringt sie mit, samt
Queue und Chunking fuer lange Texte.

## Was das fuer bibliogon konkret hiesse

1. `react-text-to-speech@5.1.10` als Dependency
2. `hooks/ui/useWebSpeechTts.ts` durch `useSpeech()` ersetzen
3. Wenn eine sprachbasierte Voice-Auswahl gebraucht wird: `pickVoice()`
   (~25 Zeilen) als eigene Utility, die die `voiceURI[]`-Liste erzeugt
4. Voice-Prefs bleiben app-eigen (Keys, Persistenz-Ort)
5. `EditorTtsControls.tsx` kann auf die Highlighting-API der Lib umstellen —
   das ist der eigentliche Gewinn, nicht die eingesparten 171 Zeilen

## Known Limitations (kein Migrationskriterium)

**Pause / Resume auf iOS Safari.** adaptive-learners eigener Code haelt es seit
jeher fest (`lib/voice/speech-synthesis.ts:143`):

```ts
/** Pause the currently-speaking utterance. No-op on iOS Safari. */
```

Ein Plattform-Limit, vorher wie nachher identisch. Es kann eine Migration
weder bestehen noch durchfallen lassen und gehoert deshalb nicht in
Akzeptanzkriterien — nur hierher. Fuer bibliogon ungeprueft, aber dieselbe
Plattform, also dieselbe Erwartung.

## Grenzen dieser Analyse

- Der Spike lief gegen **adaptive-learners** Anforderungen. Von bibliogons
  `useWebSpeechTts.ts` sind Umfang und die persistierten Felder
  (`voiceURI`, `rate`) gelesen, **nicht** die vollstaendige Logik. Ob
  bibliogon Faelle hat, die die Lib nicht deckt, ist offen — vor einer
  Migration zu pruefen.
- Ob bibliogon ueberhaupt eine sprachbasierte Voice-Auswahl braucht, ist
  ebenfalls offen. Beim Editor-Vorlesen in der Sprache des Nutzers reicht
  moeglicherweise die Browser-Default-Voice, dann entfaellt `pickVoice()`
  hier ganz.
- Die iOS-Stueckelung der Lib ist im Quellcode belegt, aber **nicht auf einem
  Geraet verifiziert**. Das verbleibende iOS-Risiko liegt bei Pause/Resume und
  Voice-Wechsel waehrend der Wiedergabe — beides unterstuetzt Safari
  unzuverlaessig, und beide Implementierungen behandeln es nicht besonders.
- Ob `useWebSpeechTts.ts` bereits selbst stueckelt, wurde nicht geprueft.
  Falls nicht, hat bibliogon denselben iOS-Langtext-Abbruch wie
  adaptive-learner — bei Kapiteltexten entsprechend frueher sichtbar.

## Belege

- Paket entpackt aus der npm-Registry, Version 5.1.10
- `dist/index.mjs:707-714` — `voiceschanged`-Behandlung
- `dist/index.mjs:668` — Voice-Match ueber exakte `voiceURI`
- `package.json` — `dependencies: {}`, Peer React 17/18/19
- `gzip -c dist/index.mjs | wc -c` — 7,2 KB
- `dist/index.mjs:143-144` — Stueckelung, mobile/iOS-Default 250 Zeichen
- `dist/index.mjs:95-99` — `isMobile(iOS = true)`

Korrektur 2026-07-22: eine fruehere Fassung dieses ADR bewertete die
iOS-Behandlung der Lib als "nichts Systematisches" und damit als Risiko der
Migration. Das war falsch herum — die Lib stueckelt, unser Code nicht. Der
Anstoss zur Nachpruefung kam aus einer Gegenlese durch Qwen.
