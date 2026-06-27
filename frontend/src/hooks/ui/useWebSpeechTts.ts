/**
 * Read-aloud state machine on top of the browser-native Web Speech API.
 *
 * Wraps `lib/utils/webSpeech` into a React hook that owns the
 * play / pause / resume / stop lifecycle, keeps the available-voice
 * list in sync (Chromium loads voices asynchronously via the
 * `voiceschanged` event), tracks the currently-spoken word for an
 * optional highlight, and persists the chosen voice + speed per device.
 *
 * Works fully offline: `speechSynthesis` runs in the browser with no
 * backend and no network, so this is the offline fallback to the
 * desktop-only Cloud TTS (audiobook) path.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    clampRate,
    getWebSpeechVoices,
    isWebSpeechAvailable,
    pickVoice,
    readWebSpeechPrefs,
    WEB_SPEECH_DEFAULT_RATE,
    writeWebSpeechPrefs,
} from "../../lib/utils/webSpeech";

export type WebSpeechStatus = "idle" | "playing" | "paused";

export interface WebSpeechTts {
    /** Whether the browser supports Web Speech synthesis. */
    available: boolean;
    /** Voices the browser exposes (may fill in after mount). */
    voices: SpeechSynthesisVoice[];
    status: WebSpeechStatus;
    /** Persisted voiceURI (`null` = browser default). */
    voiceURI: string | null;
    setVoiceURI: (voiceURI: string | null) => void;
    rate: number;
    setRate: (rate: number) => void;
    /** Word currently being spoken (for an optional highlight), or "". */
    spokenWord: string;
    /** Start reading `text`; `lang` (e.g. "de") seeds default voice choice. */
    speak: (text: string, lang?: string) => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
}

/**
 * @example
 * const tts = useWebSpeechTts();
 * if (tts.available) tts.speak(editor.getText(), "de");
 */
export function useWebSpeechTts(): WebSpeechTts {
    const available = isWebSpeechAvailable();
    const initialPrefs = readWebSpeechPrefs();
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => getWebSpeechVoices());
    const [status, setStatus] = useState<WebSpeechStatus>("idle");
    const [voiceURI, setVoiceURIState] = useState<string | null>(initialPrefs.voiceURI);
    const [rate, setRateState] = useState<number>(initialPrefs.rate);
    const [spokenWord, setSpokenWord] = useState("");

    // Keep current voice/rate readable inside the speak() callback
    // without re-creating it on every change.
    const voiceURIRef = useRef(voiceURI);
    const rateRef = useRef(rate);
    voiceURIRef.current = voiceURI;
    rateRef.current = rate;

    useEffect(() => {
        if (!available) return;
        const sync = () => setVoices(getWebSpeechVoices());
        sync();
        window.speechSynthesis.addEventListener("voiceschanged", sync);
        return () => {
            // Fail open: the global can already be gone in teardown
            // (tests unstub it) - never let cleanup throw.
            const synth = window.speechSynthesis;
            if (!synth) return;
            synth.removeEventListener("voiceschanged", sync);
            // Stop any in-flight utterance when the consumer unmounts so
            // audio never outlives the editor.
            synth.cancel();
        };
    }, [available]);

    const setVoiceURI = useCallback((next: string | null) => {
        // Update the ref synchronously so a restart fired in the same
        // handler (voice/speed change) uses the new value, not the stale
        // pre-render one.
        voiceURIRef.current = next;
        setVoiceURIState(next);
        writeWebSpeechPrefs({ voiceURI: next, rate: rateRef.current });
    }, []);

    const setRate = useCallback((next: number) => {
        const clamped = clampRate(next);
        rateRef.current = clamped;
        setRateState(clamped);
        writeWebSpeechPrefs({ voiceURI: voiceURIRef.current, rate: clamped });
    }, []);

    const stop = useCallback(() => {
        if (!available) return;
        window.speechSynthesis.cancel();
        setStatus("idle");
        setSpokenWord("");
    }, [available]);

    const speak = useCallback(
        (text: string, lang?: string) => {
            if (!available) return;
            const trimmed = text.trim();
            if (!trimmed) return;
            // Always cancel first: Chromium queues utterances, so without
            // this a second play overlaps the first.
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(trimmed);
            utterance.rate = clampRate(rateRef.current ?? WEB_SPEECH_DEFAULT_RATE);
            if (lang) utterance.lang = lang;
            const voice = pickVoice(getWebSpeechVoices(), { voiceURI: voiceURIRef.current, lang });
            if (voice) utterance.voice = voice;

            utterance.onend = () => {
                setStatus("idle");
                setSpokenWord("");
            };
            utterance.onerror = () => {
                setStatus("idle");
                setSpokenWord("");
            };
            utterance.onboundary = (event) => {
                if (event.name && event.name !== "word") return;
                const slice = trimmed.slice(event.charIndex);
                const match = slice.match(/^\s*(\S+)/);
                setSpokenWord(match ? match[1] : "");
            };

            window.speechSynthesis.speak(utterance);
            setStatus("playing");
        },
        [available],
    );

    const pause = useCallback(() => {
        if (!available) return;
        window.speechSynthesis.pause();
        setStatus("paused");
    }, [available]);

    const resume = useCallback(() => {
        if (!available) return;
        window.speechSynthesis.resume();
        setStatus("playing");
    }, [available]);

    return {
        available,
        voices,
        status,
        voiceURI,
        setVoiceURI,
        rate,
        setRate,
        spokenWord,
        speak,
        pause,
        resume,
        stop,
    };
}
