/**
 * Browser-native Web Speech (`speechSynthesis`) helpers.
 *
 * Stage-1 (language/platform) wrapper per the library-first rule: a thin,
 * app-import-free layer over the browser's `window.speechSynthesis` +
 * `SpeechSynthesisUtterance`. It carries capability detection, voice
 * loading, rate clamping, voice selection, and per-device preference
 * persistence so the read-aloud feature works fully offline with no
 * backend and no network.
 *
 * The React state machine (play/pause/stop) lives in the
 * `useWebSpeechTts` hook, which builds on these functions.
 *
 * @example
 * if (isWebSpeechAvailable()) {
 *   const utt = new SpeechSynthesisUtterance("Hallo Welt");
 *   utt.voice = pickVoice(getWebSpeechVoices(), { voiceURI: null, lang: "de" }) ?? null;
 *   utt.rate = clampRate(1.25);
 *   window.speechSynthesis.speak(utt);
 * }
 */

/** Slowest playback rate offered by the UI. */
export const WEB_SPEECH_MIN_RATE = 0.5;
/** Fastest playback rate offered by the UI. */
export const WEB_SPEECH_MAX_RATE = 2.0;
/** Neutral default playback rate. */
export const WEB_SPEECH_DEFAULT_RATE = 1.0;

/** Per-device read-aloud preferences. */
export interface WebSpeechPrefs {
    /** Persisted `SpeechSynthesisVoice.voiceURI`, or `null` for the
     *  browser default. Voices are device-specific, so this is a
     *  per-device (localStorage) preference, never synced. */
    voiceURI: string | null;
    /** Playback rate within [{@link WEB_SPEECH_MIN_RATE}, {@link WEB_SPEECH_MAX_RATE}]. */
    rate: number;
}

const PREFS_STORAGE_KEY = "bibliogon.webspeech.prefs";

/**
 * Whether the running browser supports Web Speech synthesis. False in
 * SSR / test environments without the API and in the rare browser that
 * ships neither `speechSynthesis` nor the utterance constructor.
 */
export function isWebSpeechAvailable(): boolean {
    return (
        typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        typeof window.SpeechSynthesisUtterance === "function"
    );
}

/**
 * The voices the browser currently exposes. May be empty on first call
 * in Chromium (voices load asynchronously); callers should also listen
 * to the `voiceschanged` event. Returns `[]` when Web Speech is
 * unavailable.
 */
export function getWebSpeechVoices(): SpeechSynthesisVoice[] {
    if (!isWebSpeechAvailable()) return [];
    try {
        return window.speechSynthesis.getVoices();
    } catch {
        return [];
    }
}

/**
 * Clamp a requested rate into the supported range, mapping `NaN` to the
 * default so a blank slider value never reaches the synthesizer.
 */
export function clampRate(rate: number): number {
    if (Number.isNaN(rate)) return WEB_SPEECH_DEFAULT_RATE;
    return Math.min(WEB_SPEECH_MAX_RATE, Math.max(WEB_SPEECH_MIN_RATE, rate));
}

/**
 * Choose a voice for an utterance. Prefers the persisted `voiceURI`
 * when it still matches an installed voice; otherwise the first voice
 * whose `lang` shares the requested two-letter prefix (e.g. `"de"`
 * matches `de-DE` / `de-AT`); otherwise `undefined` so the browser
 * picks its own default.
 */
export function pickVoice(
    voices: readonly SpeechSynthesisVoice[],
    options: { voiceURI?: string | null; lang?: string },
): SpeechSynthesisVoice | undefined {
    const { voiceURI, lang } = options;
    if (voiceURI) {
        const exact = voices.find((voice) => voice.voiceURI === voiceURI);
        if (exact) return exact;
    }
    if (lang) {
        const prefix = lang.slice(0, 2).toLowerCase();
        const byLang = voices.find((voice) => voice.lang.slice(0, 2).toLowerCase() === prefix);
        if (byLang) return byLang;
    }
    return undefined;
}

/** Read the per-device read-aloud preferences, falling back to defaults. */
export function readWebSpeechPrefs(): WebSpeechPrefs {
    const fallback: WebSpeechPrefs = { voiceURI: null, rate: WEB_SPEECH_DEFAULT_RATE };
    if (typeof window === "undefined" || !window.localStorage) return fallback;
    try {
        const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as Partial<WebSpeechPrefs>;
        return {
            voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : null,
            rate: clampRate(typeof parsed.rate === "number" ? parsed.rate : WEB_SPEECH_DEFAULT_RATE),
        };
    } catch {
        return fallback;
    }
}

/** Persist the per-device read-aloud preferences. */
export function writeWebSpeechPrefs(prefs: WebSpeechPrefs): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
        window.localStorage.setItem(
            PREFS_STORAGE_KEY,
            JSON.stringify({ voiceURI: prefs.voiceURI, rate: clampRate(prefs.rate) }),
        );
    } catch {
        // localStorage can throw in private-mode / quota-exceeded.
        // Preference persistence is a convenience; fail open.
    }
}
