import {useEffect, useState} from "react";
import {Save} from "lucide-react";
import {api, AudiobookVoice, formatVoiceLabel} from "../../../api/client";
import {useI18n} from "../../../hooks/useI18n";
import styles from "../../../pages/Settings.module.css";
import {RadixSelect} from "../../shared/RadixSelect";
import {Toggle} from "../Toggle";
import {normalizeMergeMode} from "../utils";
import {ElevenLabsKeyPanel} from "./ElevenLabsKeyPanel";
import {GoogleCloudTTSPanel} from "./GoogleCloudTTSPanel";

export function AudiobookSettingsPanel({settings, onSave}: {
    settings: Record<string, unknown>;
    onSave: (s: Record<string, unknown>) => void;
}) {
    const {t} = useI18n();
    const [engine, setEngine] = useState(String(settings.engine || "edge-tts"));
    // Local-only language state. The plugin-global ``audiobook.language``
    // setting was removed because the export pipeline always uses the
    // book's own language; this picker stays here purely to filter the
    // voice list and is not persisted to the YAML.
    const [language, setLanguage] = useState("de");
    const [voice, setVoice] = useState(String(settings.default_voice || ""));
    const [merge, setMerge] = useState<string>(normalizeMergeMode(settings.merge));
    const [readChapterNumber, setReadChapterNumber] = useState<boolean>(
        Boolean(settings.read_chapter_number),
    );
    const [voices, setVoices] = useState<AudiobookVoice[]>([]);
    const [loadingVoices, setLoadingVoices] = useState(false);

    // Load voices when engine or language changes. Goes through the
    // shared api.audiobook.listVoices helper so the empty state is the
    // same as the one rendered by BookMetadataEditor and there is no
    // engine-agnostic Edge fallback that would silently leak Edge
    // voices into a Google/ElevenLabs dropdown.
    useEffect(() => {
        let cancelled = false;
        setLoadingVoices(true);
        api.audiobook
            .listVoices(engine, language)
            .then((data) => {
                if (cancelled) return;
                setVoices(data);
                if (data.length > 0 && !data.some((v) => v.id === voice)) {
                    setVoice(data[0].id);
                }
            })
            .catch(() => {
                if (!cancelled) setVoices([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingVoices(false);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engine, language]);

    const handleSave = () => {
        // Drop ``language`` from the persisted dict; it was Category C in
        // the plugin settings audit (UI-only voice filter, never read by
        // the export pipeline). ``skip_types`` is dropped for the same
        // reason: it became Book.audiobook_skip_chapter_types in the
        // chapter-skip-list migration and the YAML key is gone.
        const {language: _droplang, skip_types: _dropskip, ...rest} = settings as Record<string, unknown>;
        void _droplang;
        void _dropskip;
        onSave({
            ...rest,
            engine,
            default_voice: voice,
            merge,
            read_chapter_number: readChapterNumber,
        });
    };

    const engineOptions = [
        {value: "edge-tts", label: "Microsoft Edge TTS"},
        {value: "google-tts", label: "Google TTS (gTTS)"},
        {value: "google-cloud-tts", label: "Google Cloud TTS"},
        {value: "pyttsx3", label: "pyttsx3 (Offline)"},
        {value: "elevenlabs", label: "ElevenLabs"},
    ];

    const languageOptions = [
        {value: "de", label: `${t("ui.languages.de", "Deutsch")} (de-DE)`},
        {value: "en", label: `${t("ui.languages.en", "Englisch")} (en-US)`},
        {value: "es", label: `${t("ui.languages.es", "Spanisch")} (es-ES)`},
        {value: "fr", label: `${t("ui.languages.fr", "Französisch")} (fr-FR)`},
        {value: "el", label: `${t("ui.languages.el", "Griechisch")} (el-GR)`},
        {value: "it", label: "Italiano (it-IT)"},
        {value: "nl", label: "Nederlands (nl-NL)"},
        {value: "pt", label: `${t("ui.languages.pt", "Portugiesisch")} (pt-BR)`},
        {value: "ru", label: "Russisch (ru-RU)"},
        {value: "ja", label: `${t("ui.languages.ja", "Japanisch")} (ja-JP)`},
        {value: "zh", label: "Chinesisch (zh-CN)"},
        {value: "tr", label: `${t("ui.languages.tr", "Türkisch")} (tr-TR)`},
    ];

    const [highQualityOnly, setHighQualityOnly] = useState(true);
    const hasQualityTiers = engine === "google-cloud-tts";
    const HIGH_QUALITY_TIERS = new Set(["neural2", "journey", "studio"]);
    const filteredVoices = hasQualityTiers && highQualityOnly
        ? voices.filter((v) => HIGH_QUALITY_TIERS.has(v.quality || ""))
        : voices;
    const voiceOptions = filteredVoices.map((v) => ({
        value: v.id,
        label: formatVoiceLabel(v),
    }));

    const mergeOptions = [
        {value: "separate", label: t("ui.audiobook.merge_separate", "Alle Kapitel einzeln")},
        {value: "merged", label: t("ui.audiobook.merge_merged", "Alle Kapitel zusammenfügen")},
        {value: "both", label: t("ui.audiobook.merge_both", "Beides")},
    ];

    return (
        <>
            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                {t("ui.settings.expand_settings", "Einstellungen")}
            </h4>
            <div className={styles.settingsGrid}>
                <div className="field">
                    <label className="label">{t("ui.audiobook.engine", "Sprachsynthese-Engine")}</label>
                    <RadixSelect value={engine} onValueChange={(v) => { setEngine(v); setVoice(""); }} options={engineOptions} />
                </div>
                <div className="field">
                    <label className="label">{t("ui.audiobook.language", "Sprache")}</label>
                    <RadixSelect value={language} onValueChange={(v) => { setLanguage(v); setVoice(""); }} options={languageOptions} />
                </div>
                <div className="field">
                    <label className="label">{t("ui.audiobook.default_voice", "Stimme")}</label>
                    {hasQualityTiers && (
                        <label style={{display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4, cursor: "pointer"}}>
                            <input type="checkbox" checked={highQualityOnly} onChange={(e) => setHighQualityOnly(e.target.checked)}/>
                            {t("ui.audiobook.high_quality_only", "Nur hochwertige Stimmen (Neural2, Journey, Studio)")}
                        </label>
                    )}
                    {loadingVoices ? (
                        <div style={{padding: "6px 0", color: "var(--text-muted)", fontSize: "0.8125rem"}}>
                            {t("ui.audiobook.voices_loading", "Stimmen werden geladen...")}
                        </div>
                    ) : voiceOptions.length > 0 ? (
                        <RadixSelect value={voice} onValueChange={setVoice} options={voiceOptions} />
                    ) : (
                        <div style={{padding: "6px 0", color: "var(--text-muted)", fontSize: "0.8125rem"}}>
                            {t("ui.audiobook.no_voices_for_combo", "Keine Stimmen für {engine} in {language} verfügbar")
                                .replace("{engine}", engine)
                                .replace("{language}", language.toUpperCase())}
                        </div>
                    )}
                </div>
                <div className="field">
                    <label className="label">{t("ui.audiobook.merge", "Kapitel zusammenfügen")}</label>
                    <RadixSelect value={merge} onValueChange={setMerge} options={mergeOptions} />
                </div>
            </div>
            <div className="field" style={{marginTop: 16}}>
                <Toggle
                    label={t("ui.audiobook.read_chapter_number_label", "Kapitel-Nummer ansagen")}
                    description={t("ui.audiobook.read_chapter_number_description", "Wenn aktiviert, sagt die TTS vor jedem Kapitel ein 'Erstes Kapitel', 'Zweites Kapitel' usw. an. Standardmaessig deaktiviert, weil die meisten Bücher keine gesprochenen Kapitelmarken wollen.")}
                    checked={readChapterNumber}
                    onChange={setReadChapterNumber}
                    testId="audiobook-read-chapter-number"
                />
            </div>
            <button className="btn btn-primary btn-sm mt-1" onClick={handleSave}>
                <Save size={12}/> {t("ui.common.save", "Speichern")}
            </button>

            <ElevenLabsKeyPanel/>
            <GoogleCloudTTSPanel/>
        </>
    );
}
