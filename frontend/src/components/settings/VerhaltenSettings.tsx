import {useEffect, useRef, useState} from "react";
import {Save} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import {useBookTypes} from "../../hooks/useBookTypes";
import {useContentTypes} from "../../hooks/useContentTypes";
import {asExportEngine, type ExportEngine} from "../../export/engine";
import styles from "../../pages/Settings.module.css";
import {RadixSelect} from "../RadixSelect";
import {useFeature} from "@astrapi69/feature-strategy-react";
import {FEATURES} from "../../features/featureConfig";
import {HelpText} from "./HelpText";
import {SectionHeader} from "./SectionHeader";
import {Toggle} from "./Toggle";

export function VerhaltenSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const bookTypes = useBookTypes();
    const contentTypes = useContentTypes();
    const app = (config.app || {}) as Record<string, unknown>;
    const behavior = (config.behavior || {}) as Record<string, unknown>;
    const ui = (config.ui || {}) as Record<string, unknown>;
    const uiDefaults = (ui.defaults || {}) as Record<string, unknown>;

    const [lang, setLang] = useState((app.default_language as string) || "de");
    const [trashEnabled, setTrashEnabled] = useState(Boolean(app.trash_auto_delete_enabled));
    const [trashDays, setTrashDays] = useState(String(Number(app.trash_auto_delete_days ?? 30)));
    const [deletePermanently, setDeletePermanently] = useState(Boolean(app.delete_permanently));
    const [allowBooksWithoutAuthor, setAllowBooksWithoutAuthor] = useState(
        Boolean(app.allow_books_without_author),
    );
    const [skipNonDestructive, setSkipNonDestructive] = useState(
        Boolean(behavior.skip_non_destructive_confirmations),
    );
    const [defaultBookType, setDefaultBookType] = useState(
        (uiDefaults.book_type as string) || "prose",
    );
    const [defaultContentType, setDefaultContentType] = useState(
        (uiDefaults.content_type as string) || "blogpost",
    );
    const [exportEngine, setExportEngine] = useState<ExportEngine>(
        asExportEngine(behavior.export_engine),
    );
    // The backend (Pandoc/LaTeX) engine needs the desktop backend; hide that
    // option offline (Dexie mode resolves `pandoc-export` to `hidden`). The
    // export pipeline already forces the client engine offline regardless of
    // the stored preference.
    const pandocExport = useFeature(FEATURES.PANDOC_EXPORT);

    // The parent loads `config` asynchronously (getApp); this effect
    // re-hydrates the form once the real config arrives. A late arrival
    // must not CLOBBER a value the user already changed (that would save
    // the stale value), so ``userEdited`` gates the re-hydrate and the
    // ``onEdit`` wrapper marks the form dirty on the first interaction.
    const userEdited = useRef(false);
    function onEdit<T>(setter: (value: T) => void): (value: T) => void {
        return (value) => {
            userEdited.current = true;
            setter(value);
        };
    }

    useEffect(() => {
        if (userEdited.current) return; // never clobber an in-progress edit
        setLang((app.default_language as string) || "de");
        setTrashEnabled(Boolean(app.trash_auto_delete_enabled));
        setTrashDays(String(Number(app.trash_auto_delete_days ?? 30)));
        setDeletePermanently(Boolean(app.delete_permanently));
        setAllowBooksWithoutAuthor(Boolean(app.allow_books_without_author));
        const b = (config.behavior || {}) as Record<string, unknown>;
        setSkipNonDestructive(Boolean(b.skip_non_destructive_confirmations));
        setExportEngine(asExportEngine(b.export_engine));
        const d = (((config.ui || {}) as Record<string, unknown>).defaults ||
            {}) as Record<string, unknown>;
        setDefaultBookType((d.book_type as string) || "prose");
        setDefaultContentType((d.content_type as string) || "blogpost");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    const buildSaveData = () => ({
        app: {
            default_language: lang,
            trash_auto_delete_enabled: trashEnabled,
            trash_auto_delete_days: Number(trashDays),
            delete_permanently: deletePermanently,
            allow_books_without_author: allowBooksWithoutAuthor,
        },
        behavior: {
            ...behavior,
            skip_non_destructive_confirmations: skipNonDestructive,
            export_engine: exportEngine,
        },
        // Preserve other ui.* branches (picture_book, dashboard, ...)
        // via the spread; only the defaults branch is owned here. The
        // backend PATCH shallow-merges ui, so the full branch is sent.
        ui: {
            ...ui,
            defaults: {
                ...uiDefaults,
                book_type: defaultBookType,
                content_type: defaultContentType,
            },
        },
    });

    return (
        <div className={styles.section} data-testid="verhalten-settings">
            <SectionHeader
                title={t("ui.settings.verhalten_title", "Verhalten")}
                description={t("ui.settings.verhalten_description", "Sprache, Papierkorb und Daten-Voreinstellungen.")}
            />
            <div className={styles.card}>
                <div className="field">
                    <label className="label">{t("ui.settings.language", "Sprache")}</label>
                    <RadixSelect
                        value={lang}
                        onValueChange={onEdit(setLang)}
                        testId="settings-language"
                        options={[
                            {value: "de", label: t("ui.languages.de", "Deutsch")},
                            {value: "en", label: t("ui.languages.en", "Englisch")},
                            {value: "es", label: t("ui.languages.es", "Spanisch")},
                            {value: "fr", label: t("ui.languages.fr", "Französisch")},
                            {value: "el", label: t("ui.languages.el", "Griechisch")},
                            {value: "pt", label: t("ui.languages.pt", "Portugiesisch")},
                            {value: "tr", label: t("ui.languages.tr", "Türkisch")},
                            {value: "ja", label: t("ui.languages.ja", "Japanisch")},
                        ]}
                    />
                </div>
                <div className="field">
                    <Toggle
                        label={t("ui.settings.trash_checkbox", "Gelöschte Bücher automatisch entfernen")}
                        checked={trashEnabled}
                        onChange={onEdit(setTrashEnabled)}
                        testId="settings-trash-enabled"
                        description={trashEnabled
                            ? t("ui.settings.trash_info", "Bücher im Papierkorb werden nach {days} Tagen automatisch gelöscht").replace("{days}", trashDays)
                            : t("ui.settings.trash_disabled", "Deaktiviert (manuell löschen)")}
                    >
                        {trashEnabled && (
                            <div style={{marginTop: 8, marginLeft: 24}}>
                                <label className="label">{t("ui.settings.trash_delete_after", "Endgültig löschen nach")}</label>
                                <RadixSelect
                                    value={trashDays}
                                    onValueChange={onEdit(setTrashDays)}
                                    testId="settings-trash-days"
                                    options={[
                                        {value: "7", label: t("ui.settings.trash_days_7", "7 Tage")},
                                        {value: "14", label: t("ui.settings.trash_days_14", "14 Tage")},
                                        {value: "30", label: t("ui.settings.trash_days_30", "30 Tage")},
                                        {value: "60", label: t("ui.settings.trash_days_60", "60 Tage")},
                                        {value: "90", label: t("ui.settings.trash_days_90", "90 Tage")},
                                        {value: "180", label: t("ui.settings.trash_days_180", "180 Tage")},
                                        {value: "365", label: t("ui.settings.trash_days_365", "365 Tage")},
                                    ]}
                                />
                            </div>
                        )}
                    </Toggle>
                </div>
                <div className="field">
                    <Toggle
                        label={t("ui.settings.delete_permanently", "Gelöschte Bücher sofort permanent löschen")}
                        description={t("ui.settings.delete_permanently_hint", "Bei Aktivierung werden Bücher nicht in den Papierkorb verschoben.")}
                        checked={deletePermanently}
                        onChange={onEdit(setDeletePermanently)}
                        testId="settings-delete-permanently"
                        indentedDescription
                    />
                </div>
                <div className="field">
                    <Toggle
                        label={t(
                            "ui.settings.allow_books_without_author",
                            "Bücher ohne Autor zulassen (erweitert)",
                        )}
                        description={t(
                            "ui.settings.allow_books_without_author_hint",
                            "Aktiviere diese Option, um Bücher ohne Autor zu importieren oder zu speichern. Hilfreich beim Konvertieren von Dokumenten zu Hoerbüchern, bei denen keine Autorinformation nötig ist.",
                        )}
                        checked={allowBooksWithoutAuthor}
                        onChange={onEdit(setAllowBooksWithoutAuthor)}
                        testId="settings-allow-books-without-author"
                        indentedDescription
                    />
                </div>
                <div className="field">
                    <Toggle
                        label={t(
                            "ui.settings.skip_non_destructive_confirmations",
                            "Bestätigungen für ungefährliche Aktionen überspringen",
                        )}
                        description={t(
                            "ui.settings.skip_non_destructive_confirmations_hint",
                            "Aktiviert: Aktionen wie „Als Buch zusammenfassen?“, „Importieren?“ laufen ohne Rückfrage. Zerstörende Aktionen (Löschen, Papierkorb, Gefahrenzone) fragen IMMER nach.",
                        )}
                        checked={skipNonDestructive}
                        onChange={onEdit(setSkipNonDestructive)}
                        testId="settings-skip-non-destructive-confirmations"
                        indentedDescription
                    />
                </div>
                <div className="field">
                    <label className="label">
                        {t("ui.settings.export_engine", "Export-Engine")}
                    </label>
                    <HelpText>
                        {t(
                            "ui.settings.export_engine_hint",
                            "Welche Engine der Export nutzt. „Automatisch“ verwendet online Pandoc (LaTeX-PDF) und offline den Browser-Export. „Browser“ exportiert immer direkt im Browser; „Backend“ immer über Pandoc (nur online).",
                        )}
                    </HelpText>
                    <RadixSelect
                        value={exportEngine}
                        onValueChange={onEdit((v) => setExportEngine(asExportEngine(v)))}
                        testId="settings-export-engine"
                        options={[
                            {value: "auto", label: t("ui.settings.export_engine_auto", "Automatisch (empfohlen)")},
                            {value: "client", label: t("ui.settings.export_engine_client", "Browser (offline-fähig)")},
                            ...(pandocExport.isActive
                                ? [{value: "backend", label: t("ui.settings.export_engine_backend", "Backend (Pandoc/LaTeX, nur online)")}]
                                : []),
                        ]}
                    />
                </div>
                <div className={styles.subCard} data-testid="settings-defaults">
                    <h3 className={styles.subCardTitle}>
                        {t("ui.settings.defaults_title", "Standardwerte")}
                    </h3>
                    <HelpText>
                        {t("ui.settings.defaults_hint", "Der vorausgewählte Typ beim Erstellen neuer Bücher und Texte. Ein „?type=\"-Parameter in der URL hat Vorrang.")}
                    </HelpText>
                    <div className={styles.subCardGrid}>
                        <div className="field">
                            <label className="label">{t("ui.settings.default_book_type", "Standard-Buchtyp")}</label>
                            <RadixSelect
                                value={defaultBookType}
                                onValueChange={onEdit(setDefaultBookType)}
                                testId="settings-default-book-type"
                                options={bookTypes.ordered.map((bt) => ({
                                    value: bt.id,
                                    label: t(bt.label_key, bt.id),
                                }))}
                            />
                        </div>
                        <div className="field">
                            <label className="label">{t("ui.settings.default_content_type", "Standard-Textart")}</label>
                            <RadixSelect
                                value={defaultContentType}
                                onValueChange={onEdit(setDefaultContentType)}
                                testId="settings-default-content-type"
                                options={contentTypes.ordered.map((ct) => ({
                                    value: ct.id,
                                    label: t(ct.label_key, ct.id),
                                }))}
                            />
                        </div>
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => onSave(buildSaveData())}
                    data-testid="verhalten-settings-save"
                    style={{marginTop: 12}}
                >
                    <Save size={14}/> {t("ui.common.save", "Speichern")}
                </button>
            </div>
        </div>
    );
}
