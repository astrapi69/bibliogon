import {useEffect, useState} from "react";
import {Save, Wrench} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import {PALETTES} from "../../themes/palettes";
import SshKeySection from "../SshKeySection";
import styles from "../../pages/Settings.module.css";
import {RadixSelect} from "./RadixSelect";

export function AppSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const app = (config.app || {}) as Record<string, unknown>;
    const ui = (config.ui || {}) as Record<string, unknown>;
    const pluginsConfig = (config.plugins || {}) as Record<string, unknown>;
    const enabledPlugins = (pluginsConfig.enabled as string[]) || [];

    const editorConfig = (config.editor || {}) as Record<string, unknown>;

    const [lang, setLang] = useState((app.default_language as string) || "de");
    const [uiTitle, setUiTitle] = useState((ui.title as string) || "Bibliogon");
    const [uiSubtitle, setUiSubtitle] = useState((ui.subtitle as string) || "");
    const [theme, setTheme] = useState((ui.theme as string) || "warm-literary");
    const uiDashboard = (ui.dashboard || {}) as Record<string, unknown>;
    const [booksView, setBooksView] = useState(
        (uiDashboard.books_view as string) === "list" ? "list" : "grid",
    );
    const [articlesView, setArticlesView] = useState(
        (uiDashboard.articles_view as string) === "list" ? "list" : "grid",
    );
    const [trashEnabled, setTrashEnabled] = useState(Boolean(app.trash_auto_delete_enabled));
    const [trashDays, setTrashDays] = useState(String(Number(app.trash_auto_delete_days ?? 30)));
    const [deletePermanently, setDeletePermanently] = useState(Boolean(app.delete_permanently));
    const [allowBooksWithoutAuthor, setAllowBooksWithoutAuthor] = useState(
        Boolean(app.allow_books_without_author),
    );
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [corePlugins, setCorePlugins] = useState<Record<string, boolean>>({
        export: true, help: true, getstarted: true,
    });
    const [edAutosave, setEdAutosave] = useState(String(editorConfig.autosave_debounce_ms ?? 800));
    const [edDraftSave, setEdDraftSave] = useState(String(editorConfig.draft_save_debounce_ms ?? 2000));
    const [edDraftAge, setEdDraftAge] = useState(String(editorConfig.draft_max_age_days ?? 30));
    const [edAiChars, setEdAiChars] = useState(String(editorConfig.ai_context_chars ?? 2000));

    useEffect(() => {
        setLang((app.default_language as string) || "de");
        setUiTitle((ui.title as string) || "Bibliogon");
        setUiSubtitle((ui.subtitle as string) || "");
        setTheme((ui.theme as string) || "warm-literary");
        const dashboardCfg = (ui.dashboard || {}) as Record<string, unknown>;
        setBooksView((dashboardCfg.books_view as string) === "list" ? "list" : "grid");
        setArticlesView((dashboardCfg.articles_view as string) === "list" ? "list" : "grid");
        setTrashEnabled(Boolean(app.trash_auto_delete_enabled));
        setTrashDays(String(Number(app.trash_auto_delete_days ?? 30)));
        setDeletePermanently(Boolean(app.delete_permanently));
        setAllowBooksWithoutAuthor(Boolean(app.allow_books_without_author));
        setCorePlugins({
            export: enabledPlugins.includes("export"),
            help: enabledPlugins.includes("help"),
            getstarted: enabledPlugins.includes("getstarted"),
        });
        setEdAutosave(String(editorConfig.autosave_debounce_ms ?? 800));
        setEdDraftSave(String(editorConfig.draft_save_debounce_ms ?? 2000));
        setEdDraftAge(String(editorConfig.draft_max_age_days ?? 30));
        setEdAiChars(String(editorConfig.ai_context_chars ?? 2000));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    const buildSaveData = () => {
        const enabled = Object.entries(corePlugins)
            .filter(([, v]) => v).map(([k]) => k);
        for (const p of enabledPlugins) {
            if (!["export", "help", "getstarted"].includes(p) && !enabled.includes(p)) {
                enabled.push(p);
            }
        }
        return {
            app: {
                default_language: lang,
                trash_auto_delete_enabled: trashEnabled,
                trash_auto_delete_days: Number(trashDays),
                delete_permanently: deletePermanently,
                allow_books_without_author: allowBooksWithoutAuthor,
            },
            ui: {
                title: uiTitle,
                subtitle: uiSubtitle,
                theme,
                // Dashboard view defaults. Same keys the in-dashboard
                // ViewToggle writes through ``useViewMode``; both
                // entry points stay synchronized via the shared
                // ``ui.dashboard.*_view`` setting.
                dashboard: {
                    books_view: booksView,
                    articles_view: articlesView,
                },
            },
            plugins: {enabled},
            editor: {
                autosave_debounce_ms: parseInt(edAutosave) || 800,
                draft_save_debounce_ms: parseInt(edDraftSave) || 2000,
                draft_max_age_days: parseInt(edDraftAge) || 30,
                ai_context_chars: parseInt(edAiChars) || 2000,
            },
        };
    };

    return (
        <div className={styles.section} data-testid="app-settings">
            <h2 className={styles.sectionTitle}>{t("ui.settings.app_settings", "App-Einstellungen")}</h2>
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
                    <label className="label">{t("ui.settings.theme", "Theme")}</label>
                    <RadixSelect
                        value={theme}
                        onValueChange={(val) => {
                            setTheme(val);
                            document.documentElement.setAttribute("data-app-theme", val);
                            localStorage.setItem("bibliogon-app-theme", val);
                        }}
                        testId="palette-select"
                        options={PALETTES.map((p) => ({
                            value: p.id,
                            label: t(`ui.themes.${p.id.replace(/-/g, "_")}`, p.label),
                        }))}
                    />
                </div>
                <div className="field">
                    <label className="label" title={t("ui.settings.dashboard_books_view_tooltip", "Standard-Ansicht beim Öffnen des Bücher-Dashboards. Kann jederzeit über das Symbol oben rechts geändert werden.")}>
                        {t("ui.settings.dashboard_books_view_label", "Bücher-Dashboard: Standard-Ansicht")}
                    </label>
                    <RadixSelect
                        value={booksView}
                        onValueChange={setBooksView}
                        testId="settings-books-view"
                        options={[
                            {value: "grid", label: t("ui.dashboard.view_grid", "Kachel-Ansicht")},
                            {value: "list", label: t("ui.dashboard.view_list", "Listen-Ansicht")},
                        ]}
                    />
                </div>
                <div className="field">
                    <label className="label" title={t("ui.settings.dashboard_articles_view_tooltip", "Standard-Ansicht beim Öffnen des Artikel-Dashboards. Kann jederzeit über das Symbol oben rechts geändert werden.")}>
                        {t("ui.settings.dashboard_articles_view_label", "Artikel-Dashboard: Standard-Ansicht")}
                    </label>
                    <RadixSelect
                        value={articlesView}
                        onValueChange={setArticlesView}
                        testId="settings-articles-view"
                        options={[
                            {value: "grid", label: t("ui.dashboard.view_grid", "Kachel-Ansicht")},
                            {value: "list", label: t("ui.dashboard.view_list", "Listen-Ansicht")},
                        ]}
                    />
                </div>
                <div className="field">
                    <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
                        <input
                            type="checkbox"
                            checked={trashEnabled}
                            onChange={(e) => setTrashEnabled(e.target.checked)}
                            data-testid="settings-trash-enabled"
                            style={{width: 16, height: 16, accentColor: "var(--accent)"}}
                        />
                        <span className="label" style={{margin: 0}}>{t("ui.settings.trash_checkbox", "Gelöschte Bücher automatisch entfernen")}</span>
                    </label>
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
                    <small style={{color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, display: "block"}}>
                        {trashEnabled
                            ? t("ui.settings.trash_info", "Bücher im Papierkorb werden nach {days} Tagen automatisch gelöscht").replace("{days}", trashDays)
                            : t("ui.settings.trash_disabled", "Deaktiviert (manuell löschen)")}
                    </small>
                </div>
                <div className="field">
                    <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
                        <input
                            type="checkbox"
                            checked={deletePermanently}
                            onChange={(e) => setDeletePermanently(e.target.checked)}
                            data-testid="settings-delete-permanently"
                            style={{width: 16, height: 16, accentColor: "var(--accent)"}}
                        />
                        <span className="label" style={{margin: 0}}>{t("ui.settings.delete_permanently", "Gelöschte Bücher sofort permanent löschen")}</span>
                    </label>
                    <small style={{color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, display: "block", marginLeft: 24}}>
                        {t("ui.settings.delete_permanently_hint", "Bei Aktivierung werden Bücher nicht in den Papierkorb verschoben.")}
                    </small>
                </div>
                <div className="field">
                    <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
                        <input
                            type="checkbox"
                            checked={allowBooksWithoutAuthor}
                            onChange={(e) => setAllowBooksWithoutAuthor(e.target.checked)}
                            data-testid="settings-allow-books-without-author"
                            style={{width: 16, height: 16, accentColor: "var(--accent)"}}
                        />
                        <span className="label" style={{margin: 0}}>
                            {t(
                                "ui.settings.allow_books_without_author",
                                "Bücher ohne Autor zulassen (erweitert)",
                            )}
                        </span>
                    </label>
                    <small style={{color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, display: "block", marginLeft: 24}}>
                        {t(
                            "ui.settings.allow_books_without_author_hint",
                            "Aktiviere diese Option, um Bücher ohne Autor zu importieren oder zu speichern. Hilfreich beim Konvertieren von Dokumenten zu Hoerbüchern, bei denen keine Autorinformation nötig ist.",
                        )}
                    </small>
                </div>
                <button
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => onSave(buildSaveData())}
                    data-testid="app-settings-save"
                >
                    <Save size={14}/> {t("ui.common.save", "Speichern")}
                </button>
            </div>

            <SshKeySection/>

            {/* Editor Settings */}
            <div style={{marginTop: 16}}>
                <h2 className={styles.sectionTitle}>{t("ui.settings.editor_title", "Editor")}</h2>
                <div className={styles.card}>
                    <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                        <div className="field" style={{flex: 1, minWidth: 140}}>
                            <label className="label">{t("ui.settings.editor_autosave", "Autosave (ms)")}</label>
                            <input className="input" type="number" min="200" max="5000" step="100"
                                data-testid="editor-autosave"
                                value={edAutosave} onChange={(e) => setEdAutosave(e.target.value)}/>
                            <small style={{color: "var(--text-muted)", fontSize: "0.7rem"}}>{t("ui.settings.editor_autosave_hint", "Verzoegerung bis zum automatischen Speichern")}</small>
                        </div>
                        <div className="field" style={{flex: 1, minWidth: 140}}>
                            <label className="label">{t("ui.settings.editor_draft_save", "Entwurf (ms)")}</label>
                            <input className="input" type="number" min="500" max="10000" step="500"
                                data-testid="editor-draft-save"
                                value={edDraftSave} onChange={(e) => setEdDraftSave(e.target.value)}/>
                            <small style={{color: "var(--text-muted)", fontSize: "0.7rem"}}>{t("ui.settings.editor_draft_hint", "Verzoegerung bis zur lokalen Sicherung")}</small>
                        </div>
                    </div>
                    <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                        <div className="field" style={{flex: 1, minWidth: 140}}>
                            <label className="label">{t("ui.settings.editor_draft_age", "Entwurf-Alter (Tage)")}</label>
                            <input className="input" type="number" min="1" max="365" step="1"
                                data-testid="editor-draft-age"
                                value={edDraftAge} onChange={(e) => setEdDraftAge(e.target.value)}/>
                            <small style={{color: "var(--text-muted)", fontSize: "0.7rem"}}>{t("ui.settings.editor_draft_age_hint", "Lokale Entwuerfe älter als dieser Wert werden gelöscht")}</small>
                        </div>
                        <div className="field" style={{flex: 1, minWidth: 140}}>
                            <label className="label">{t("ui.settings.editor_ai_chars", "KI-Kontext (Zeichen)")}</label>
                            <input className="input" type="number" min="500" max="32000" step="500"
                                data-testid="editor-ai-chars"
                                value={edAiChars} onChange={(e) => setEdAiChars(e.target.value)}/>
                            <small style={{color: "var(--text-muted)", fontSize: "0.7rem"}}>{t("ui.settings.editor_ai_chars_hint", "Maximale Zeichenanzahl für KI-Vorschläge")}</small>
                        </div>
                    </div>
                </div>
            </div>

            {/* Advanced: White-Label */}
            <div style={{marginTop: 16}}>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    data-testid="white-label-toggle"
                    style={{gap: 6}}
                >
                    <Wrench size={14}/>
                    {showAdvanced ? t("ui.settings.white_label_hide", "Erweitert ausblenden") : t("ui.settings.white_label", "Erweitert: App anpassen")}
                </button>

                {showAdvanced && (
                    <div
                        className={styles.card}
                        data-testid="white-label-card"
                        style={{marginTop: 12, borderLeft: "3px solid var(--accent)"}}
                    >
                        <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 4}}>
                            {t("ui.settings.white_label_title", "White-Label Konfiguration")}
                        </h3>
                        <p style={{color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 16}}>
                            {t("ui.settings.white_label_desc", "Passe Bibliogon als eigene App an. Aendere den Namen, entferne Standard-Plugins und erstelle deine eigene Autoren-Plattform.")}
                        </p>

                        <div className="field" style={{marginBottom: 12}}>
                            <label className="label">{t("ui.settings.app_name", "App-Name")}</label>
                            <input
                                className="input"
                                value={uiTitle}
                                onChange={(e) => setUiTitle(e.target.value)}
                                data-testid="white-label-app-name"
                            />
                        </div>
                        <div className="field" style={{marginBottom: 16}}>
                            <label className="label">{t("ui.settings.description", "Beschreibung")}</label>
                            <input
                                className="input"
                                value={uiSubtitle}
                                onChange={(e) => setUiSubtitle(e.target.value)}
                                data-testid="white-label-description"
                            />
                        </div>

                        <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8}}>
                            {t("ui.settings.core_plugins", "Standard-Plugins")}
                        </h4>
                        {[
                            {id: "export", label: t("ui.settings.plugin_export", "Buch-Export"), desc: t("ui.settings.plugin_export_desc", "EPUB, PDF, Word, Projektstruktur")},
                            {id: "help", label: t("ui.settings.plugin_help", "Hilfe"), desc: t("ui.settings.plugin_help_desc", "FAQ, Tastenkuerzel, About")},
                            {id: "getstarted", label: t("ui.settings.plugin_getstarted", "Erste Schritte"), desc: t("ui.settings.plugin_getstarted_desc", "Onboarding-Wizard, Beispielbuch")},
                        ].map((plugin) => (
                            <label key={plugin.id} style={{
                                display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                                borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: "0.875rem",
                            }}>
                                <input
                                    type="checkbox"
                                    checked={corePlugins[plugin.id] ?? true}
                                    onChange={(e) => setCorePlugins((prev) => ({...prev, [plugin.id]: e.target.checked}))}
                                    data-testid={`white-label-core-${plugin.id}`}
                                    style={{accentColor: "var(--accent)"}}
                                />
                                <div>
                                    <strong>{plugin.label}</strong>
                                    <span style={{color: "var(--text-muted)", marginLeft: 8, fontSize: "0.75rem"}}>
                                        {plugin.desc}
                                    </span>
                                </div>
                            </label>
                        ))}
                        <p style={{color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 12}}>
                            {t("ui.settings.restart_hint", "Änderungen werden beim nächsten \"Speichern\" übernommen. Neustart erforderlich.")}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
