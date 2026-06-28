import {useEffect, useState} from "react";
import {useI18n} from "../../hooks/useI18n";
import styles from "../../pages/Settings.module.css";
import {HelpText} from "./HelpText";
import {SectionHeader} from "./SectionHeader";
import {
    PICTURE_BOOK_FORMATS,
    DEFAULT_PICTURE_BOOK_FORMAT,
    type PictureBookFormat,
} from "../export/PdfExportControls";
import {KDP_REGIONS, REGION_LABELS} from "../kdp-wizard/pricing";
import type {RegionCode} from "../kdp-wizard/machines/types";
import {RadixSelect} from "../shared/RadixSelect";
import {Toggle} from "./Toggle";
import {useSettingsAutoSave} from "./useSettingsAutoSave";
import {
    getWebSpeechVoices,
    isWebSpeechAvailable,
    readWebSpeechPrefs,
    writeWebSpeechPrefs,
    WEB_SPEECH_MIN_RATE,
    WEB_SPEECH_MAX_RATE,
} from "../../lib/utils/webSpeech";

function isPictureBookFormat(value: unknown): value is PictureBookFormat {
    return (
        typeof value === "string" &&
        (PICTURE_BOOK_FORMATS as readonly string[]).includes(value)
    );
}

function isRegionCode(value: unknown): value is RegionCode {
    return (
        typeof value === "string" &&
        (KDP_REGIONS as readonly string[]).includes(value)
    );
}

export function EditorSettings({config, onSave}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const editorConfig = (config.editor || {}) as Record<string, unknown>;
    const ui = (config.ui || {}) as Record<string, unknown>;
    const pictureBook =
        (ui.picture_book as Record<string, unknown> | undefined) ?? {};
    const kdpConfig = (config.kdp || {}) as Record<string, unknown>;

    const [edAutosave, setEdAutosave] = useState(String(editorConfig.autosave_debounce_ms ?? 800));
    const [edDraftSave, setEdDraftSave] = useState(String(editorConfig.draft_save_debounce_ms ?? 2000));
    const [edDraftAge, setEdDraftAge] = useState(String(editorConfig.draft_max_age_days ?? 30));
    const [edAiChars, setEdAiChars] = useState(String(editorConfig.ai_context_chars ?? 2000));
    const [pdfFormat, setPdfFormat] = useState<PictureBookFormat>(
        isPictureBookFormat(pictureBook.pdf_default_format)
            ? (pictureBook.pdf_default_format as PictureBookFormat)
            : DEFAULT_PICTURE_BOOK_FORMAT,
    );
    const [pdfBleed, setPdfBleed] = useState<boolean>(
        Boolean(pictureBook.pdf_default_bleed_marks),
    );
    const [kdpMarketplace, setKdpMarketplace] = useState<RegionCode>(
        isRegionCode(kdpConfig.default_marketplace)
            ? (kdpConfig.default_marketplace as RegionCode)
            : "US",
    );

    useEffect(() => {
        setEdAutosave(String(editorConfig.autosave_debounce_ms ?? 800));
        setEdDraftSave(String(editorConfig.draft_save_debounce_ms ?? 2000));
        setEdDraftAge(String(editorConfig.draft_max_age_days ?? 30));
        setEdAiChars(String(editorConfig.ai_context_chars ?? 2000));
        const pb =
            (((config.ui || {}) as Record<string, unknown>).picture_book as
                | Record<string, unknown>
                | undefined) ?? {};
        setPdfFormat(
            isPictureBookFormat(pb.pdf_default_format)
                ? (pb.pdf_default_format as PictureBookFormat)
                : DEFAULT_PICTURE_BOOK_FORMAT,
        );
        setPdfBleed(Boolean(pb.pdf_default_bleed_marks));
        const kdp = (config.kdp || {}) as Record<string, unknown>;
        setKdpMarketplace(
            isRegionCode(kdp.default_marketplace)
                ? (kdp.default_marketplace as RegionCode)
                : "US",
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    const buildSaveData = () => ({
        editor: {
            autosave_debounce_ms: parseInt(edAutosave) || 800,
            draft_save_debounce_ms: parseInt(edDraftSave) || 2000,
            draft_max_age_days: parseInt(edDraftAge) || 30,
            ai_context_chars: parseInt(edAiChars) || 2000,
        },
        ui: {
            ...ui,
            picture_book: {
                ...pictureBook,
                pdf_default_format: pdfFormat,
                pdf_default_bleed_marks: pdfBleed,
            },
        },
        kdp: {
            ...kdpConfig,
            default_marketplace: kdpMarketplace,
        },
    });

    const triggerSave = useSettingsAutoSave(buildSaveData, onSave);

    // Web Speech read-aloud preferences are per-device (voices differ by
    // device/browser) and work offline, so they live in localStorage via
    // the lib helpers - not in the backend config above.
    const ttsAvailable = isWebSpeechAvailable();
    const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>(() => getWebSpeechVoices());
    const [ttsVoiceURI, setTtsVoiceURI] = useState<string>(() => readWebSpeechPrefs().voiceURI ?? "");
    const [ttsRate, setTtsRate] = useState<number>(() => readWebSpeechPrefs().rate);

    useEffect(() => {
        if (!ttsAvailable) return;
        const sync = () => setTtsVoices(getWebSpeechVoices());
        sync();
        window.speechSynthesis.addEventListener("voiceschanged", sync);
        return () => window.speechSynthesis?.removeEventListener("voiceschanged", sync);
    }, [ttsAvailable]);

    return (
        <div className={styles.section} data-testid="editor-settings">
            <SectionHeader
                title={t("ui.settings.editor_title", "Editor")}
                description={t("ui.settings.editor_description", "Autosave-Intervalle, Entwurfs-Aufbewahrung und KI-Kontextlimit.")}
            />
            <div className={styles.card}>
                <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_autosave", "Autosave (ms)")}</label>
                        <input className="input" type="number" min="200" max="5000" step="100"
                            data-testid="editor-autosave"
                            value={edAutosave} onChange={(e) => { setEdAutosave(e.target.value); triggerSave(); }}/>
                        <HelpText>{t("ui.settings.editor_autosave_hint", "Verzoegerung bis zum automatischen Speichern")}</HelpText>
                    </div>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_draft_save", "Entwurf (ms)")}</label>
                        <input className="input" type="number" min="500" max="10000" step="500"
                            data-testid="editor-draft-save"
                            value={edDraftSave} onChange={(e) => { setEdDraftSave(e.target.value); triggerSave(); }}/>
                        <HelpText>{t("ui.settings.editor_draft_hint", "Verzoegerung bis zur lokalen Sicherung")}</HelpText>
                    </div>
                </div>
                <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_draft_age", "Entwurf-Alter (Tage)")}</label>
                        <input className="input" type="number" min="1" max="365" step="1"
                            data-testid="editor-draft-age"
                            value={edDraftAge} onChange={(e) => { setEdDraftAge(e.target.value); triggerSave(); }}/>
                        <HelpText>{t("ui.settings.editor_draft_age_hint", "Lokale Entwuerfe älter als dieser Wert werden gelöscht")}</HelpText>
                    </div>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_ai_chars", "KI-Kontext (Zeichen)")}</label>
                        <input className="input" type="number" min="500" max="32000" step="500"
                            data-testid="editor-ai-chars"
                            value={edAiChars} onChange={(e) => { setEdAiChars(e.target.value); triggerSave(); }}/>
                        <HelpText>{t("ui.settings.editor_ai_chars_hint", "Maximale Zeichenanzahl für KI-Vorschläge")}</HelpText>
                    </div>
                </div>

                <div className={styles.subCard} data-testid="settings-picture-book-pdf">
                    <h3 className={styles.subCardTitle}>
                        {t("ui.settings.pdf_defaults_title", "PDF-Export-Standards (Bilderbuch + Comic)")}
                    </h3>
                    <HelpText>
                        {t("ui.settings.pdf_defaults_hint", "Standard-Werte für die Export-Steuerung; können beim Export pro Vorgang überschrieben werden.")}
                    </HelpText>
                    <div className={styles.subCardGrid}>
                        <div className="field">
                            <label className="label">{t("ui.settings.pdf_default_format", "Standard-Format")}</label>
                            <RadixSelect
                                value={pdfFormat}
                                onValueChange={(v) => { setPdfFormat(v as PictureBookFormat); triggerSave(); }}
                                testId="settings-pdf-default-format"
                                options={PICTURE_BOOK_FORMATS.map((fmt) => ({
                                    value: fmt,
                                    label: t(`ui.page_editor.pdf_format.${fmt.replace(/\./g, "_")}`, fmt),
                                }))}
                            />
                        </div>
                        <div className="field">
                            <Toggle
                                label={t("ui.settings.pdf_default_bleed", "Beschnittmarken standardmäßig aktiv")}
                                description={t("ui.page_editor.pdf_bleed_hint", "Fügt 3 mm Beschnitt + Schnittmarken für den Druckereinsatz hinzu")}
                                checked={pdfBleed}
                                onChange={(v) => { setPdfBleed(v); triggerSave(); }}
                                testId="settings-pdf-default-bleed"
                                indentedDescription
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.subCard} data-testid="settings-kdp-default-marketplace">
                    <h3 className={styles.subCardTitle}>
                        {t("ui.settings.kdp_default_marketplace_title", "KDP-Standard-Marktplatz")}
                    </h3>
                    <HelpText>
                        {t("ui.settings.kdp_default_marketplace_hint", "Standard-Marktplatz für den KDP-Publishing-Wizard. Pro Buch im Wizard änderbar.")}
                    </HelpText>
                    <div className="field">
                        <RadixSelect
                            value={kdpMarketplace}
                            onValueChange={(v) => { setKdpMarketplace(v as RegionCode); triggerSave(); }}
                            testId="settings-kdp-default-marketplace-select"
                            options={KDP_REGIONS.map((region) => ({
                                value: region,
                                label: REGION_LABELS[region],
                            }))}
                        />
                    </div>
                </div>

                <div className={styles.subCard} data-testid="settings-web-speech-tts">
                    <h3 className={styles.subCardTitle}>
                        {t("ui.tts.settings_title", "Vorlesen (Sprachausgabe)")}
                    </h3>
                    <HelpText>
                        {t("ui.tts.settings_hint", "Wähle eine Standardstimme und Geschwindigkeit für die browser-native Sprachausgabe. Geräteabhängig; funktioniert offline.")}
                    </HelpText>
                    {!ttsAvailable ? (
                        <p style={{color: "var(--text-muted)", fontSize: "0.8125rem"}} data-testid="web-speech-tts-unavailable">
                            {t("ui.tts.unavailable", "Ihr Browser unterstützt keine Sprachausgabe.")}
                        </p>
                    ) : (
                        <div className={styles.subCardGrid}>
                            <div className="field">
                                <label className="label">{t("ui.tts.voice", "Stimme")}</label>
                                <RadixSelect
                                    value={ttsVoiceURI}
                                    onValueChange={(v) => {
                                        setTtsVoiceURI(v);
                                        writeWebSpeechPrefs({voiceURI: v || null, rate: ttsRate});
                                    }}
                                    testId="settings-web-speech-voice"
                                    options={[
                                        {value: "", label: t("ui.tts.default_voice", "Standardstimme")},
                                        ...ttsVoices.map((voice) => ({
                                            value: voice.voiceURI,
                                            label: `${voice.name} (${voice.lang})`,
                                        })),
                                    ]}
                                />
                            </div>
                            <div className="field">
                                <label className="label">
                                    {t("ui.tts.speed", "Geschwindigkeit")}: {ttsRate.toFixed(1)}x
                                </label>
                                <input
                                    type="range"
                                    className="slider"
                                    data-testid="settings-web-speech-speed"
                                    min={WEB_SPEECH_MIN_RATE}
                                    max={WEB_SPEECH_MAX_RATE}
                                    step={0.1}
                                    value={ttsRate}
                                    aria-label={t("ui.tts.speed", "Geschwindigkeit")}
                                    onChange={(e) => {
                                        const next = parseFloat(e.target.value);
                                        setTtsRate(next);
                                        writeWebSpeechPrefs({voiceURI: ttsVoiceURI || null, rate: next});
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
