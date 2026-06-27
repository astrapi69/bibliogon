import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    isWebSpeechAvailable,
    getWebSpeechVoices,
    clampRate,
    pickVoice,
    readWebSpeechPrefs,
    writeWebSpeechPrefs,
    WEB_SPEECH_MIN_RATE,
    WEB_SPEECH_MAX_RATE,
    WEB_SPEECH_DEFAULT_RATE,
} from "./webSpeech";

function makeVoice(partial: Partial<SpeechSynthesisVoice>): SpeechSynthesisVoice {
    return {
        name: "Voice",
        lang: "de-DE",
        voiceURI: "uri",
        default: false,
        localService: true,
        ...partial,
    } as SpeechSynthesisVoice;
}

function installSpeech(voices: SpeechSynthesisVoice[]) {
    vi.stubGlobal("SpeechSynthesisUtterance", class {});
    vi.stubGlobal("speechSynthesis", {
        getVoices: () => voices,
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

describe("isWebSpeechAvailable", () => {
    it("is false when speechSynthesis is missing", () => {
        vi.stubGlobal("speechSynthesis", undefined);
        expect(isWebSpeechAvailable()).toBe(false);
    });

    it("is true when speechSynthesis + utterance constructor exist", () => {
        installSpeech([]);
        expect(isWebSpeechAvailable()).toBe(true);
    });
});

describe("getWebSpeechVoices", () => {
    it("returns [] when unavailable", () => {
        vi.stubGlobal("speechSynthesis", undefined);
        expect(getWebSpeechVoices()).toEqual([]);
    });

    it("returns the browser voices when available", () => {
        const voices = [makeVoice({ voiceURI: "a" }), makeVoice({ voiceURI: "b" })];
        installSpeech(voices);
        expect(getWebSpeechVoices()).toHaveLength(2);
    });
});

describe("clampRate", () => {
    it("clamps below min and above max", () => {
        expect(clampRate(0.1)).toBe(WEB_SPEECH_MIN_RATE);
        expect(clampRate(5)).toBe(WEB_SPEECH_MAX_RATE);
    });

    it("passes through an in-range value and maps NaN to default", () => {
        expect(clampRate(1.3)).toBe(1.3);
        expect(clampRate(NaN)).toBe(WEB_SPEECH_DEFAULT_RATE);
    });
});

describe("pickVoice", () => {
    const voices = [
        makeVoice({ voiceURI: "de1", lang: "de-DE" }),
        makeVoice({ voiceURI: "en1", lang: "en-US" }),
    ];

    it("prefers the exact voiceURI match", () => {
        expect(pickVoice(voices, { voiceURI: "en1" })?.voiceURI).toBe("en1");
    });

    it("falls back to the language prefix when voiceURI is unknown", () => {
        expect(pickVoice(voices, { voiceURI: "missing", lang: "en" })?.voiceURI).toBe("en1");
    });

    it("returns undefined when nothing matches", () => {
        expect(pickVoice(voices, { lang: "ja" })).toBeUndefined();
    });
});

describe("read/writeWebSpeechPrefs", () => {
    beforeEach(() => window.localStorage.clear());

    it("returns defaults when nothing is stored", () => {
        expect(readWebSpeechPrefs()).toEqual({
            voiceURI: null,
            rate: WEB_SPEECH_DEFAULT_RATE,
        });
    });

    it("round-trips and clamps the persisted rate", () => {
        writeWebSpeechPrefs({ voiceURI: "de1", rate: 9 });
        const prefs = readWebSpeechPrefs();
        expect(prefs.voiceURI).toBe("de1");
        expect(prefs.rate).toBe(WEB_SPEECH_MAX_RATE);
    });
});
