import {useEffect, useState} from "react";
import {Save} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import styles from "../../pages/Settings.module.css";
import {HelpText} from "./HelpText";
import {SectionHeader} from "./SectionHeader";
import {
    PICTURE_BOOK_FORMATS,
    DEFAULT_PICTURE_BOOK_FORMAT,
    type PictureBookFormat,
} from "../PdfExportControls";
import {KDP_REGIONS, REGION_LABELS} from "../kdp-wizard/pricing";
import type {RegionCode} from "../kdp-wizard/machines/types";
import {RadixSelect} from "./RadixSelect";
import {Toggle} from "./Toggle";

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

export function EditorSettings({config, onSave, saving}: {
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
                            value={edAutosave} onChange={(e) => setEdAutosave(e.target.value)}/>
                        <HelpText>{t("ui.settings.editor_autosave_hint", "Verzoegerung bis zum automatischen Speichern")}</HelpText>
                    </div>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_draft_save", "Entwurf (ms)")}</label>
                        <input className="input" type="number" min="500" max="10000" step="500"
                            data-testid="editor-draft-save"
                            value={edDraftSave} onChange={(e) => setEdDraftSave(e.target.value)}/>
                        <HelpText>{t("ui.settings.editor_draft_hint", "Verzoegerung bis zur lokalen Sicherung")}</HelpText>
                    </div>
                </div>
                <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_draft_age", "Entwurf-Alter (Tage)")}</label>
                        <input className="input" type="number" min="1" max="365" step="1"
                            data-testid="editor-draft-age"
                            value={edDraftAge} onChange={(e) => setEdDraftAge(e.target.value)}/>
                        <HelpText>{t("ui.settings.editor_draft_age_hint", "Lokale Entwuerfe älter als dieser Wert werden gelöscht")}</HelpText>
                    </div>
                    <div className="field" style={{flex: 1, minWidth: 140}}>
                        <label className="label">{t("ui.settings.editor_ai_chars", "KI-Kontext (Zeichen)")}</label>
                        <input className="input" type="number" min="500" max="32000" step="500"
                            data-testid="editor-ai-chars"
                            value={edAiChars} onChange={(e) => setEdAiChars(e.target.value)}/>
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
                                onValueChange={(v) => setPdfFormat(v as PictureBookFormat)}
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
                                onChange={setPdfBleed}
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
                            onValueChange={(v) => setKdpMarketplace(v as RegionCode)}
                            testId="settings-kdp-default-marketplace-select"
                            options={KDP_REGIONS.map((region) => ({
                                value: region,
                                label: REGION_LABELS[region],
                            }))}
                        />
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => onSave(buildSaveData())}
                    data-testid="editor-settings-save"
                    style={{marginTop: 12}}
                >
                    <Save size={14}/> {t("ui.common.save", "Speichern")}
                </button>
            </div>
        </div>
    );
}
