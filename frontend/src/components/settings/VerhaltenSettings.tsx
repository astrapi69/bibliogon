import {useEffect, useState} from "react";
import {Save} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import styles from "../../pages/Settings.module.css";
import {RadixSelect} from "./RadixSelect";
import {SectionHeader} from "./SectionHeader";
import {Toggle} from "./Toggle";

export function VerhaltenSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const app = (config.app || {}) as Record<string, unknown>;

    const [lang, setLang] = useState((app.default_language as string) || "de");
    const [trashEnabled, setTrashEnabled] = useState(Boolean(app.trash_auto_delete_enabled));
    const [trashDays, setTrashDays] = useState(String(Number(app.trash_auto_delete_days ?? 30)));
    const [deletePermanently, setDeletePermanently] = useState(Boolean(app.delete_permanently));
    const [allowBooksWithoutAuthor, setAllowBooksWithoutAuthor] = useState(
        Boolean(app.allow_books_without_author),
    );

    useEffect(() => {
        setLang((app.default_language as string) || "de");
        setTrashEnabled(Boolean(app.trash_auto_delete_enabled));
        setTrashDays(String(Number(app.trash_auto_delete_days ?? 30)));
        setDeletePermanently(Boolean(app.delete_permanently));
        setAllowBooksWithoutAuthor(Boolean(app.allow_books_without_author));
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
                        onValueChange={setLang}
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
                        onChange={setTrashEnabled}
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
                                    onValueChange={setTrashDays}
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
                        onChange={setDeletePermanently}
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
                        onChange={setAllowBooksWithoutAuthor}
                        testId="settings-allow-books-without-author"
                        indentedDescription
                    />
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
