import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EditorTtsControls from "./EditorTtsControls";

class FakeUtterance {
    text: string;
    rate = 1;
    lang = "";
    voice: SpeechSynthesisVoice | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onboundary: (() => void) | null = null;
    constructor(text: string) {
        this.text = text;
    }
}

function installSpeech() {
    const spoken: FakeUtterance[] = [];
    const synth = {
        spoken,
        speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
        cancel: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        getVoices: () => [] as SpeechSynthesisVoice[],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("speechSynthesis", synth);
    return synth;
}

const t = (_k: string, fallback: string) => fallback;

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

describe("EditorTtsControls", () => {
    it("renders a disabled button with a reason when Web Speech is unavailable", () => {
        vi.stubGlobal("speechSynthesis", undefined);
        render(<EditorTtsControls t={t} getText={() => "text"} />);
        const btn = screen.getByTestId("web-speech-tts-button");
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute("title", "Ihr Browser unterstützt keine Sprachausgabe.");
    });

    it("renders an enabled button when Web Speech is available", () => {
        installSpeech();
        render(<EditorTtsControls t={t} getText={() => "text"} />);
        expect(screen.getByTestId("web-speech-tts-button")).toBeEnabled();
    });

    it("click play speaks the text and shows the mini-player", () => {
        const synth = installSpeech();
        render(<EditorTtsControls t={t} lang="de" getText={() => "Kapiteltext"} />);
        fireEvent.click(screen.getByTestId("web-speech-tts-button"));
        expect(synth.speak).toHaveBeenCalledTimes(1);
        expect(synth.spoken[0].text).toBe("Kapiteltext");
        expect(screen.getByTestId("web-speech-tts-player")).toBeInTheDocument();
        // The floating start button is replaced by the player.
        expect(screen.queryByTestId("web-speech-tts-button")).not.toBeInTheDocument();
    });

    it("stop hides the mini-player and cancels", () => {
        const synth = installSpeech();
        render(<EditorTtsControls t={t} getText={() => "text"} />);
        fireEvent.click(screen.getByTestId("web-speech-tts-button"));
        fireEvent.click(screen.getByTestId("web-speech-tts-stop"));
        expect(synth.cancel).toHaveBeenCalled();
        expect(screen.queryByTestId("web-speech-tts-player")).not.toBeInTheDocument();
        expect(screen.getByTestId("web-speech-tts-button")).toBeInTheDocument();
    });

    it("speed slider changes the rate and restarts at the new speed", () => {
        const synth = installSpeech();
        render(<EditorTtsControls t={t} getText={() => "text"} />);
        fireEvent.click(screen.getByTestId("web-speech-tts-button"));
        const slider = screen.getByTestId("web-speech-tts-speed");
        fireEvent.change(slider, { target: { value: "1.5" } });
        expect(screen.getByTestId("web-speech-tts-rate-value")).toHaveTextContent("1.5x");
        // A fresh utterance is spoken at the new rate (Web Speech cannot
        // retarget a live utterance).
        expect(synth.spoken[synth.spoken.length - 1].rate).toBe(1.5);
    });
});
