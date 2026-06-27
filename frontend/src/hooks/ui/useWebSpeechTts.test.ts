import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSpeechTts } from "./useWebSpeechTts";

class FakeUtterance {
    text: string;
    rate = 1;
    lang = "";
    voice: SpeechSynthesisVoice | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onboundary: ((e: { name: string; charIndex: number }) => void) | null = null;
    constructor(text: string) {
        this.text = text;
    }
}

interface FakeSynth {
    speak: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    getVoices: () => SpeechSynthesisVoice[];
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    spoken: FakeUtterance[];
}

function installSpeech(voices: SpeechSynthesisVoice[] = []): FakeSynth {
    const synth: FakeSynth = {
        spoken: [],
        speak: vi.fn((u: FakeUtterance) => synth.spoken.push(u)),
        cancel: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        getVoices: () => voices,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("speechSynthesis", synth);
    return synth;
}

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

describe("useWebSpeechTts", () => {
    beforeEach(() => window.localStorage.clear());

    it("reports unavailable when speechSynthesis is missing", () => {
        vi.stubGlobal("speechSynthesis", undefined);
        const { result } = renderHook(() => useWebSpeechTts());
        expect(result.current.available).toBe(false);
    });

    it("reports available with a mocked speechSynthesis", () => {
        installSpeech();
        const { result } = renderHook(() => useWebSpeechTts());
        expect(result.current.available).toBe(true);
    });

    it("speak() calls speechSynthesis.speak and moves to playing", () => {
        const synth = installSpeech();
        const { result } = renderHook(() => useWebSpeechTts());
        act(() => result.current.speak("Hallo Welt", "de"));
        expect(synth.cancel).toHaveBeenCalled();
        expect(synth.speak).toHaveBeenCalledTimes(1);
        expect(synth.spoken[0].text).toBe("Hallo Welt");
        expect(synth.spoken[0].lang).toBe("de");
        expect(result.current.status).toBe("playing");
    });

    it("speak() ignores empty text", () => {
        const synth = installSpeech();
        const { result } = renderHook(() => useWebSpeechTts());
        act(() => result.current.speak("   "));
        expect(synth.speak).not.toHaveBeenCalled();
        expect(result.current.status).toBe("idle");
    });

    it("stop() cancels and returns to idle", () => {
        const synth = installSpeech();
        const { result } = renderHook(() => useWebSpeechTts());
        act(() => result.current.speak("text"));
        act(() => result.current.stop());
        expect(synth.cancel).toHaveBeenCalled();
        expect(result.current.status).toBe("idle");
    });

    it("pause()/resume() toggle status", () => {
        const synth = installSpeech();
        const { result } = renderHook(() => useWebSpeechTts());
        act(() => result.current.speak("text"));
        act(() => result.current.pause());
        expect(synth.pause).toHaveBeenCalled();
        expect(result.current.status).toBe("paused");
        act(() => result.current.resume());
        expect(synth.resume).toHaveBeenCalled();
        expect(result.current.status).toBe("playing");
    });

    it("setRate clamps and persists, and the next utterance uses it", () => {
        const synth = installSpeech();
        const { result } = renderHook(() => useWebSpeechTts());
        act(() => result.current.setRate(9));
        expect(result.current.rate).toBe(2.0);
        expect(window.localStorage.getItem("bibliogon.webspeech.prefs")).toContain("2");
        act(() => result.current.speak("text"));
        expect(synth.spoken[0].rate).toBe(2.0);
    });

    it("onboundary surfaces the currently-spoken word", () => {
        const synth = installSpeech();
        const { result } = renderHook(() => useWebSpeechTts());
        act(() => result.current.speak("alpha beta gamma"));
        const utt = synth.spoken[0];
        act(() => utt.onboundary?.({ name: "word", charIndex: 6 }));
        expect(result.current.spokenWord).toBe("beta");
    });
});
