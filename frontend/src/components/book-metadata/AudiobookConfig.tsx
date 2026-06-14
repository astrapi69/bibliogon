import { useState, useEffect } from "react";
import { api, AudiobookVoice, formatVoiceLabel } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import { RadixSelect } from "../RadixSelect";

function slugifyForFilename(text: string): string {
    // Mirrors backend scaffolder._slugify so the displayed default
    // matches what the export pipeline would actually produce.
    let s = text.toLowerCase().trim();
    s = s
        .replace(/[äÄ]/g, "ae")
        .replace(/[öÖ]/g, "oe")
        .replace(/[üÜ]/g, "ue")
        .replace(/[ß]/g, "ss");
    s = s.replace(/[^\w\s-]/g, "");
    s = s.replace(/[\s_]+/g, "-").replace(/-+/g, "-");
    return s.replace(/^-+|-+$/g, "");
}

export default function AudiobookBookConfig({
    bookLanguage,
    bookTitle,
    bookChapters,
    engine,
    voice,
    speed,
    merge,
    customFilename,
    overwriteExisting,
    skipChapterTypes,
    onEngineChange,
    onVoiceChange,
    onSpeedChange,
    onMergeChange,
    onCustomFilenameChange,
    onOverwriteExistingChange,
    onSkipChapterTypesChange,
}: {
    bookLanguage: string;
    bookTitle: string;
    bookChapters: { chapter_type: string }[];
    engine: string;
    voice: string;
    speed: string;
    merge: string;
    customFilename: string;
    overwriteExisting: boolean;
    skipChapterTypes: string[];
    onEngineChange: (v: string) => void;
    onVoiceChange: (v: string) => void;
    onSpeedChange: (v: string) => void;
    onMergeChange: (v: string) => void;
    onCustomFilenameChange: (v: string) => void;
    onOverwriteExistingChange: (v: boolean) => void;
    onSkipChapterTypesChange: (v: string[]) => void;
}) {
    const { t } = useI18n();
    const [voices, setVoices] = useState<AudiobookVoice[]>([]);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const [highQualityOnly, setHighQualityOnly] = useState(true);
    const currentEngine = engine || "edge-tts";
    const hasQualityTiers = currentEngine === "google-cloud-tts";
    const HIGH_QUALITY_TIERS = new Set(["neural2", "journey", "studio"]);
    const filteredVoices =
        hasQualityTiers && highQualityOnly
            ? voices.filter((v) => HIGH_QUALITY_TIERS.has(v.quality || ""))
            : voices;

    useEffect(() => {
        let cancelled = false;
        setLoadingVoices(true);
        api.audiobook
            .listVoices(currentEngine, bookLanguage)
            .then((data) => {
                if (cancelled) return;
                setVoices(data);
                if (data.length > 0 && !data.some((v) => v.id === voice)) {
                    onVoiceChange(data[0].id);
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
    }, [currentEngine, bookLanguage]);

    return (
        <>
            <div className="field">
                <label className="label">{t("ui.audiobook.language", "Sprache")}</label>
                <input
                    className="input"
                    value={bookLanguage.toUpperCase()}
                    disabled
                    style={{ opacity: 0.6 }}
                />
                <small style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                    {t(
                        "ui.audiobook.language_from_book",
                        "Wird aus den Buch-Einstellungen übernommen.",
                    )}
                </small>
            </div>
            <div className="field">
                <label className="label">{t("ui.audiobook.engine", "Engine")}</label>
                <RadixSelect
                    testId="audiobook-engine"
                    className="is-block"
                    value={currentEngine}
                    onValueChange={onEngineChange}
                    ariaLabel={t("ui.audiobook.engine", "Engine")}
                    options={[
                        { value: "edge-tts", label: "Microsoft Edge TTS" },
                        { value: "google-tts", label: "Google TTS (gTTS)" },
                        { value: "google-cloud-tts", label: "Google Cloud TTS" },
                        { value: "pyttsx3", label: "pyttsx3 (Offline)" },
                        { value: "elevenlabs", label: "ElevenLabs" },
                    ]}
                />
            </div>
            <div className="field">
                <label className="label">{t("ui.audiobook.voice", "Stimme")}</label>
                {hasQualityTiers && (
                    <label
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            marginBottom: 4,
                            cursor: "pointer",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={highQualityOnly}
                            onChange={(e) => setHighQualityOnly(e.target.checked)}
                        />
                        {t(
                            "ui.audiobook.high_quality_only",
                            "Nur hochwertige Stimmen (Neural2, Journey, Studio)",
                        )}
                    </label>
                )}
                {loadingVoices ? (
                    <div
                        style={{
                            padding: "6px 0",
                            color: "var(--text-muted)",
                            fontSize: "0.8125rem",
                        }}
                    >
                        {t("ui.audiobook.voices_loading", "Stimmen werden geladen...")}
                    </div>
                ) : filteredVoices.length > 0 ? (
                    <RadixSelect
                        testId="audiobook-voice"
                        className="is-block"
                        value={voice}
                        onValueChange={onVoiceChange}
                        ariaLabel={t("ui.audiobook.voice", "Stimme")}
                        options={filteredVoices.map((v) => ({
                            value: v.id,
                            label: formatVoiceLabel(v),
                        }))}
                    />
                ) : (
                    <div
                        style={{
                            padding: "6px 0",
                            color: "var(--text-muted)",
                            fontSize: "0.8125rem",
                        }}
                    >
                        {t(
                            "ui.audiobook.no_voices_for_combo",
                            "Keine Stimmen für {engine} in {language} verfügbar",
                        )
                            .replace("{engine}", currentEngine)
                            .replace("{language}", bookLanguage.toUpperCase())}
                    </div>
                )}
            </div>
            <div className="field">
                <label className="label">{t("ui.audiobook.speed", "Geschwindigkeit")}</label>
                <RadixSelect
                    testId="audiobook-speed"
                    className="is-block"
                    value={speed}
                    onValueChange={onSpeedChange}
                    ariaLabel={t("ui.audiobook.speed", "Geschwindigkeit")}
                    options={[
                        { value: "0.5", label: "0.5x" },
                        { value: "0.75", label: "0.75x" },
                        { value: "1.0", label: "1.0x (Normal)" },
                        { value: "1.25", label: "1.25x" },
                        { value: "1.5", label: "1.5x" },
                    ]}
                />
            </div>
            <div className="field">
                <label className="label">{t("ui.audiobook.merge", "Kapitel zusammenfügen")}</label>
                <RadixSelect
                    testId="audiobook-merge"
                    className="is-block"
                    value={merge}
                    onValueChange={onMergeChange}
                    ariaLabel={t("ui.audiobook.merge", "Kapitel zusammenfügen")}
                    options={[
                        {
                            value: "separate",
                            label: t("ui.audiobook.merge_separate", "Alle Kapitel einzeln"),
                        },
                        {
                            value: "merged",
                            label: t("ui.audiobook.merge_merged", "Alle Kapitel zusammenfügen"),
                        },
                        { value: "both", label: t("ui.audiobook.merge_both", "Beides") },
                    ]}
                />
            </div>
            <CustomFilenameField
                bookTitle={bookTitle}
                value={customFilename}
                onChange={onCustomFilenameChange}
            />
            <div className="field">
                <label className="label icon-row">
                    <input
                        type="checkbox"
                        checked={overwriteExisting}
                        onChange={(e) => onOverwriteExistingChange(e.target.checked)}
                    />
                    {t("ui.audiobook.overwrite_label", "Bestehende Dateien überschreiben")}
                </label>
                <small
                    style={{
                        color: "var(--text-muted)",
                        fontSize: "0.75rem",
                        display: "block",
                        marginTop: 4,
                    }}
                >
                    {t(
                        "ui.audiobook.overwrite_description",
                        "Wenn aktiviert, werden bei einem erneuten Export alle bereits generierten MP3-Dateien dieses Buchs überschrieben. Wenn deaktiviert, werden nur fehlende oder geänderte Kapitel neu generiert (Standard).",
                    )}
                </small>
            </div>
            <AudiobookSkipChapterTypes
                bookChapters={bookChapters}
                value={skipChapterTypes}
                onChange={onSkipChapterTypesChange}
            />
        </>
    );
}

// Sorted by typical book layout (front matter -> body -> back matter).
// The order also drives the visual order in the skip-list checkboxes.
const AUDIOBOOK_CHAPTER_TYPES: readonly string[] = [
    "toc",
    "dedication",
    "epigraph",
    "preface",
    "foreword",
    "prologue",
    "introduction",
    "part",
    "part_intro",
    "chapter",
    "interlude",
    "epilogue",
    "afterword",
    "final_thoughts",
    "acknowledgments",
    "about_author",
    "appendix",
    "bibliography",
    "endnotes",
    "glossary",
    "index",
    "imprint",
    "also_by_author",
    "next_in_series",
    "excerpt",
    "call_to_action",
];

function AudiobookSkipChapterTypes({
    bookChapters,
    value,
    onChange,
}: {
    bookChapters: { chapter_type: string }[];
    value: string[];
    onChange: (v: string[]) => void;
}) {
    const { t } = useI18n();
    const presentTypes = new Set(
        (bookChapters || []).map((c) => (c.chapter_type || "").toLowerCase()).filter(Boolean),
    );
    const present = AUDIOBOOK_CHAPTER_TYPES.filter((k) => presentTypes.has(k));
    const other = AUDIOBOOK_CHAPTER_TYPES.filter((k) => !presentTypes.has(k));

    function toggle(key: string, checked: boolean) {
        if (checked) {
            if (value.includes(key)) return;
            onChange([...value, key]);
        } else {
            onChange(value.filter((k) => k !== key));
        }
    }

    const renderCheckbox = (key: string, muted: boolean) => {
        const label = t(`ui.chapter_types.${key}`, key);
        const checked = value.includes(key);
        return (
            <label
                key={key}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 0",
                    fontSize: "0.875rem",
                    color: muted ? "var(--text-muted)" : undefined,
                }}
            >
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(key, e.target.checked)}
                />
                <span style={{ fontWeight: muted ? 400 : 500 }}>{label}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>({key})</span>
            </label>
        );
    };

    return (
        <div className="field" style={{ marginTop: 16 }}>
            <label className="label">
                {t("ui.audiobook.skip_title", "Kapiteltypen überspringen")}
            </label>
            <small
                style={{
                    color: "var(--text-muted)",
                    fontSize: "0.75rem",
                    display: "block",
                    marginBottom: 8,
                }}
            >
                {t("ui.audiobook.skip_description", "Folgende Kapiteltypen werden NICHT vertont")}
            </small>

            {present.length > 0 && (
                <>
                    <div
                        style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            marginTop: 4,
                            marginBottom: 4,
                        }}
                    >
                        {t("ui.audiobook.skip_in_book", "Im Buch vorhanden")}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
                        {present.map((k) => renderCheckbox(k, false))}
                    </div>
                </>
            )}

            <div
                style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    marginTop: 4,
                    marginBottom: 4,
                }}
            >
                {t("ui.audiobook.skip_other", "Weitere Typen")}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
                {other.map((k) => renderCheckbox(k, true))}
            </div>

            <small
                style={{
                    color: "var(--text-muted)",
                    fontSize: "0.75rem",
                    display: "block",
                    marginTop: 8,
                }}
            >
                {t(
                    "ui.audiobook.skip_hint",
                    "Aktivierte Typen werden beim Audiobook-Export übersprungen und nicht vertont.",
                )}
            </small>
        </div>
    );
}

function CustomFilenameField({
    bookTitle,
    value,
    onChange,
}: {
    bookTitle: string;
    value: string;
    onChange: (v: string) => void;
}) {
    const { t } = useI18n();
    const defaultName = `${slugifyForFilename(bookTitle) || "audiobook"}-ebook`;
    const enabled = value.length > 0;

    const toggle = (checked: boolean) => {
        // Pre-populate with the default when enabling so the user has
        // something concrete to edit. Clear back to "" when disabling so
        // the backend stores null and falls back to its own default.
        onChange(checked ? defaultName : "");
    };

    return (
        <div className="field">
            <label className="label icon-row">
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => toggle(e.target.checked)}
                />
                {t("ui.audiobook.custom_filename", "Eigener Dateiname")}
            </label>
            <input
                className="input"
                value={enabled ? value : defaultName}
                disabled={!enabled}
                onChange={(e) => onChange(e.target.value)}
                placeholder={defaultName}
                style={enabled ? undefined : { opacity: 0.6 }}
            />
            <small style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                {t(
                    "ui.audiobook.custom_filename_hint",
                    "Ohne Dateiendung. Leer lassen, um den Standardnamen zu verwenden.",
                )}
            </small>
        </div>
    );
}
