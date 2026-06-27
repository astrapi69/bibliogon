import { Volume2, Play, Pause, Square } from "lucide-react";
import { useWebSpeechTts } from "../../hooks/ui/useWebSpeechTts";
import { WEB_SPEECH_MIN_RATE, WEB_SPEECH_MAX_RATE } from "../../lib/utils/webSpeech";

type Translator = (key: string, fallback: string) => string;

interface Props {
    /** Returns the plain text to read aloud (the active chapter / a
     *  selection). Read lazily on play so the latest content is used. */
    getText: () => string;
    /** BCP-47-ish language hint (e.g. "de") seeding default-voice choice. */
    lang?: string;
    t: Translator;
}

/**
 * Browser-native read-aloud controls for the editor: a floating speaker
 * button that starts reading the chapter, and a bottom mini-player
 * (play/pause, stop, speed, voice, currently-spoken word) shown while
 * speaking.
 *
 * Capability-gated at the component level (Web Speech is a browser
 * capability, not a storage-mode dimension): when `speechSynthesis` is
 * unavailable the button is disabled and explains why (policy #78 -
 * visible + explained, never silently hidden). The desktop-only Cloud
 * TTS (audiobook) path stays as the premium alternative.
 *
 * Works fully offline - no backend, no network, no `/api`.
 */
export default function EditorTtsControls({ getText, lang, t }: Props) {
    const tts = useWebSpeechTts();

    if (!tts.available) {
        return (
            <button
                type="button"
                className="btn-icon"
                data-testid="web-speech-tts-button"
                disabled
                title={t(
                    "ui.tts.unavailable",
                    "Ihr Browser unterstützt keine Sprachausgabe.",
                )}
                aria-label={t("ui.tts.read_aloud", "Vorlesen")}
                style={floatingButtonStyle}
            >
                <Volume2 size={20} aria-hidden="true" />
            </button>
        );
    }

    const isActive = tts.status !== "idle";

    return (
        <>
            {!isActive && (
                <button
                    type="button"
                    className="btn-icon"
                    data-testid="web-speech-tts-button"
                    onClick={() => tts.speak(getText(), lang)}
                    title={t("ui.tts.read_aloud", "Vorlesen")}
                    aria-label={t("ui.tts.read_aloud", "Vorlesen")}
                    style={floatingButtonStyle}
                >
                    <Volume2 size={20} aria-hidden="true" />
                </button>
            )}

            {isActive && (
                <div
                    data-testid="web-speech-tts-player"
                    role="group"
                    aria-label={t("ui.tts.read_aloud", "Vorlesen")}
                    style={playerStyle}
                >
                    {tts.status === "playing" ? (
                        <button
                            type="button"
                            className="btn-icon"
                            data-testid="web-speech-tts-play-pause"
                            onClick={tts.pause}
                            title={t("ui.tts.pause", "Pause")}
                            aria-label={t("ui.tts.pause", "Pause")}
                        >
                            <Pause size={18} aria-hidden="true" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn-icon"
                            data-testid="web-speech-tts-play-pause"
                            onClick={tts.resume}
                            title={t("ui.tts.resume", "Fortsetzen")}
                            aria-label={t("ui.tts.resume", "Fortsetzen")}
                        >
                            <Play size={18} aria-hidden="true" />
                        </button>
                    )}

                    <button
                        type="button"
                        className="btn-icon"
                        data-testid="web-speech-tts-stop"
                        onClick={tts.stop}
                        title={t("ui.tts.stop", "Stopp")}
                        aria-label={t("ui.tts.stop", "Stopp")}
                    >
                        <Square size={18} aria-hidden="true" />
                    </button>

                    <label
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                        }}
                    >
                        {t("ui.tts.speed", "Geschwindigkeit")}
                        <input
                            type="range"
                            className="slider"
                            data-testid="web-speech-tts-speed"
                            min={WEB_SPEECH_MIN_RATE}
                            max={WEB_SPEECH_MAX_RATE}
                            step={0.1}
                            value={tts.rate}
                            aria-label={t("ui.tts.speed", "Geschwindigkeit")}
                            onChange={(e) => {
                                const next = parseFloat(e.target.value);
                                tts.setRate(next);
                                // Web Speech cannot retarget a live utterance's
                                // rate; restart from the top at the new speed.
                                tts.speak(getText(), lang);
                            }}
                        />
                        <span data-testid="web-speech-tts-rate-value">{tts.rate.toFixed(1)}x</span>
                    </label>

                    {tts.voices.length > 0 && (
                        <select
                            className="input"
                            data-testid="web-speech-tts-voice"
                            value={tts.voiceURI ?? ""}
                            aria-label={t("ui.tts.voice", "Stimme")}
                            style={{ maxWidth: 180, height: 30, padding: "0 6px" }}
                            onChange={(e) => {
                                tts.setVoiceURI(e.target.value || null);
                                tts.speak(getText(), lang);
                            }}
                        >
                            <option value="">{t("ui.tts.default_voice", "Standardstimme")}</option>
                            {tts.voices.map((voice) => (
                                <option key={voice.voiceURI} value={voice.voiceURI}>
                                    {voice.name} ({voice.lang})
                                </option>
                            ))}
                        </select>
                    )}

                    {tts.spokenWord && (
                        <span
                            data-testid="web-speech-tts-word"
                            style={{
                                fontSize: "0.8125rem",
                                color: "var(--accent)",
                                fontWeight: 600,
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {t("ui.tts.now_reading", "Liest vor")}: {tts.spokenWord}
                        </span>
                    )}
                </div>
            )}
        </>
    );
}

const floatingButtonStyle: React.CSSProperties = {
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 40,
    width: 48,
    height: 48,
    borderRadius: "50%",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow-md)",
};

const playerStyle: React.CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: 20,
    transform: "translateX(-50%)",
    zIndex: 40,
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    maxWidth: "calc(100vw - 32px)",
    padding: "8px 14px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    boxShadow: "var(--shadow-md)",
};
