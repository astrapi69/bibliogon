import {useEffect, useState} from "react";
import {useNavigate, useSearchParams} from "react-router-dom";
import {api} from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import {ChevronLeft, Save, Check, X, Plus, Trash2, Home, Wrench, Eye, EyeOff, Menu} from "lucide-react";
import {notify} from "../utils/notify";
import * as Tabs from "@radix-ui/react-tabs";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {PALETTES} from "../themes/palettes";
import {useI18n} from "../hooks/useI18n";
import {AI_PROVIDER_PRESETS, AI_PROVIDER_IDS, getProviderPreset} from "../utils/aiProviders";
import SupportSection, {getDonationsConfig} from "../components/SupportSection";
import SshKeySection from "../components/SshKeySection";
import CommentsAdminSection from "../components/CommentsAdminSection";
import {RadixSelect} from "../components/settings/RadixSelect";
import {AuthorSettings} from "../components/settings/AuthorSettings";
import {PluginSettings} from "../components/settings/PluginSettings";
import styles from "./Settings.module.css";

const VALID_SETTINGS_TABS = ["app", "ai", "author", "topics", "plugins", "comments", "support"] as const;
type SettingsTab = (typeof VALID_SETTINGS_TABS)[number];

function isSettingsTab(value: string | null): value is SettingsTab {
    return value !== null && (VALID_SETTINGS_TABS as readonly string[]).includes(value);
}

export default function Settings() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {setLang: setGlobalLang} = useI18n();
    const {t} = useI18n();
    const [appConfig, setAppConfig] = useState<Record<string, unknown>>({});
    const [pluginConfigs, setPluginConfigs] = useState<Record<string, Record<string, unknown>>>({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    // Deep-link tab via ?tab=author. Falls back to "app" for unknown
    // values so a stale URL never lands on an invalid Radix tab.
    const initialTab: SettingsTab = isSettingsTab(searchParams.get("tab")) ? (searchParams.get("tab") as SettingsTab) : "app";
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

    const handleTabChange = (next: string) => {
        if (!isSettingsTab(next)) return;
        setActiveTab(next);
        // Mirror the active tab back into the URL so reload + back-
        // button keep state. ``replace`` avoids polluting history
        // with one entry per tab click.
        const params = new URLSearchParams(searchParams);
        params.set("tab", next);
        setSearchParams(params, {replace: true});
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        // Load each independently so one failure doesn't block the rest
        try {
            const app = await api.settings.getApp();
            setAppConfig(app);
        } catch (err) {
            console.error("Failed to load app settings:", err);
        }
        try {
            const plugins = await api.settings.listPlugins();
            setPluginConfigs(plugins as Record<string, Record<string, unknown>>);
        } catch (err) {
            console.error("Failed to load plugin configs:", err);
        }
    };

    const showMessage = (msg: string, isError = false) => {
        if (isError) {
            notify.error(msg);
        } else {
            notify.success(msg);
        }
    };

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <div className={styles.headerLeft}>
                        <button className={styles.backBtn} onClick={() => navigate("/")}>
                            <ChevronLeft size={18}/>
                        </button>
                        <h1 className={styles.title}>{t("ui.settings.title", "Einstellungen")}</h1>
                    </div>
                    <div className="icon-row">
                        <button className="btn-icon" onClick={() => navigate("/")} title={t("ui.dashboard.title", "Dashboard")}>
                            <Home size={18}/>
                        </button>
                        <ThemeToggle/>
                    </div>
                </div>
            </header>

            <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
                {(() => {
                    // Single source of truth so the desktop Tabs.List and the
                    // mobile DropdownMenu render the same set of options. The
                    // dropdown items call ``handleTabChange`` directly because
                    // they are not Tabs.Trigger nodes.
                    const tabDefs: {value: SettingsTab; label: string; testId?: string}[] = [
                        {value: "app", label: t("ui.settings.tab_general", "Allgemein")},
                        {value: "ai", label: t("ui.settings.tab_ai", "KI-Assistent"), testId: "settings-tab-ai"},
                        {value: "author", label: t("ui.settings.tab_author", "Autor")},
                        {value: "topics", label: t("ui.settings.tab_topics", "Themen"), testId: "settings-tab-topics"},
                        {value: "plugins", label: t("ui.settings.tab_plugins", "Plugins")},
                        {value: "comments", label: t("ui.settings.tab_comments", "Kommentare"), testId: "settings-tab-comments"},
                        ...(getDonationsConfig(appConfig)
                            ? [{value: "support" as SettingsTab, label: t("ui.donations.tab", "Unterstützen"), testId: "settings-tab-support"}]
                            : []),
                    ];
                    const activeLabel = tabDefs.find((d) => d.value === activeTab)?.label ?? "";
                    return (
                        <>
                            <Tabs.List className="radix-tabs-list settings-tabs-desktop">
                                {tabDefs.map((d) => (
                                    <Tabs.Trigger
                                        key={d.value}
                                        value={d.value}
                                        className="radix-tab-trigger"
                                        data-testid={d.testId}
                                    >
                                        {d.label}
                                    </Tabs.Trigger>
                                ))}
                            </Tabs.List>
                            <div className="settings-tabs-mobile">
                                <DropdownMenu.Root>
                                    <DropdownMenu.Trigger asChild>
                                        <button
                                            className="btn btn-secondary settings-tabs-mobile-trigger"
                                            data-testid="settings-tabs-mobile-trigger"
                                            aria-label={t("ui.settings.open_tab_menu", "Tab-Menü öffnen")}
                                        >
                                            <Menu size={16}/>
                                            <span>{activeLabel}</span>
                                        </button>
                                    </DropdownMenu.Trigger>
                                    <DropdownMenu.Portal>
                                        <DropdownMenu.Content className="hamburger-menu-content" align="start" sideOffset={4}>
                                            {tabDefs.map((d) => (
                                                <DropdownMenu.Item
                                                    key={d.value}
                                                    className="hamburger-menu-item"
                                                    data-testid={d.testId ? `${d.testId}-mobile` : `settings-tab-${d.value}-mobile`}
                                                    onSelect={() => handleTabChange(d.value)}
                                                >
                                                    {d.label}
                                                    {d.value === activeTab ? <Check size={14}/> : null}
                                                </DropdownMenu.Item>
                                            ))}
                                        </DropdownMenu.Content>
                                    </DropdownMenu.Portal>
                                </DropdownMenu.Root>
                            </div>
                        </>
                    );
                })()}

            <main className={styles.main}>
                <Tabs.Content value="app">
                    <AppSettings
                        config={appConfig}
                        onSave={async (data) => {
                            setSaving(true);
                            try {
                                const updated = await api.settings.updateApp(data);
                                setAppConfig(updated);
                                // Live language switch without reload
                                const newLang = (data.app as Record<string, unknown>)?.default_language as string;
                                if (newLang) setGlobalLang(newLang);
                                showMessage(t("ui.settings.saved", "Gespeichert"));
                            } catch (err) {
                                showMessage(t("ui.settings.save_error", "Fehler beim Speichern"), true);
                            }
                            setSaving(false);
                        }}
                        saving={saving}
                    />
                </Tabs.Content>
                <Tabs.Content value="ai">
                    <AiAssistantSettings
                        config={appConfig}
                        onSave={async (data) => {
                            setSaving(true);
                            try {
                                const updated = await api.settings.updateApp(data);
                                setAppConfig(updated);
                                showMessage(t("ui.settings.saved", "Gespeichert"));
                            } catch (err) {
                                showMessage(t("ui.settings.save_error", "Fehler beim Speichern"), true);
                            }
                            setSaving(false);
                        }}
                        saving={saving}
                    />
                </Tabs.Content>
                <Tabs.Content value="author">
                    <AuthorSettings
                        config={appConfig}
                        onSave={async (data) => {
                            setSaving(true);
                            try {
                                const updated = await api.settings.updateApp(data);
                                setAppConfig(updated);
                                showMessage(t("ui.settings.author_saved", "Autorenprofil gespeichert"));
                            } catch {
                                showMessage(t("ui.settings.save_error", "Fehler beim Speichern"), true);
                            }
                            setSaving(false);
                        }}
                        saving={saving}
                    />
                </Tabs.Content>
                <Tabs.Content value="topics">
                    <TopicsSettings
                        config={appConfig}
                        onSave={async (data) => {
                            setSaving(true);
                            try {
                                const updated = await api.settings.updateApp(data);
                                setAppConfig(updated);
                                showMessage(t("ui.settings.topics_saved", "Themen gespeichert"));
                            } catch {
                                showMessage(t("ui.settings.save_error", "Fehler beim Speichern"), true);
                            }
                            setSaving(false);
                        }}
                        saving={saving}
                    />
                </Tabs.Content>
                <Tabs.Content value="plugins">
                    <PluginSettings
                        configs={pluginConfigs}
                        appConfig={appConfig}
                        onReload={loadData}
                        onSavePlugin={async (name, settings) => {
                            try {
                                const updated = await api.settings.updatePlugin(name, settings);
                                setPluginConfigs((prev) => ({...prev, [name]: updated as Record<string, unknown>}));
                                showMessage(`${name} ${t("ui.settings.saved", "gespeichert")}`);
                            } catch (err) {
                                showMessage(t("ui.settings.save_error", "Fehler beim Speichern"), true);
                            }
                        }}
                        onTogglePlugin={async (name, enable) => {
                            try {
                                if (enable) {
                                    await api.settings.enablePlugin(name);
                                } else {
                                    await api.settings.disablePlugin(name);
                                }
                                const app = await api.settings.getApp();
                                setAppConfig(app);
                                showMessage(`${name} ${enable ? t("ui.settings.active", "aktiviert") : t("ui.settings.inactive", "deaktiviert")}`);
                            } catch (err) {
                                showMessage(t("ui.common.error", "Fehler"), true);
                            }
                        }}
                        onAddPlugin={async (data) => {
                            try {
                                await api.settings.createPlugin(data);
                                const plugins = await api.settings.listPlugins();
                                setPluginConfigs(plugins as Record<string, Record<string, unknown>>);
                                showMessage(`${data.name} hinzugefügt`);
                            } catch (err) {
                                showMessage(`${t("ui.common.error", "Fehler")}: ${err}`, true);
                            }
                        }}
                        onRemovePlugin={async (name) => {
                            try {
                                await api.settings.deletePlugin(name);
                                const [plugins, app] = await Promise.all([
                                    api.settings.listPlugins(),
                                    api.settings.getApp(),
                                ]);
                                setPluginConfigs(plugins as Record<string, Record<string, unknown>>);
                                setAppConfig(app);
                                showMessage(`${name} ${t("ui.common.remove", "entfernt")}`);
                            } catch (err) {
                                showMessage(`${t("ui.common.error", "Fehler")}: ${err}`, true);
                            }
                        }}
                    />
                </Tabs.Content>
                <Tabs.Content value="comments">
                    <CommentsAdminSection />
                </Tabs.Content>
                {getDonationsConfig(appConfig) ? (
                    <Tabs.Content value="support">
                        <SupportSection config={getDonationsConfig(appConfig)!} />
                    </Tabs.Content>
                ) : null}
            </main>
            </Tabs.Root>
        </div>
    );
}

// --- App Settings Tab ---

function AppSettings({config, onSave, saving}: {
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
        <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("ui.settings.app_settings", "App-Einstellungen")}</h2>
            <div className={styles.card}>
                <div className="field">
                    <label className="label">{t("ui.settings.language", "Sprache")}</label>
                    <RadixSelect
                        value={lang}
                        onValueChange={setLang}
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
                                value={edAutosave} onChange={(e) => setEdAutosave(e.target.value)}/>
                            <small style={{color: "var(--text-muted)", fontSize: "0.7rem"}}>{t("ui.settings.editor_autosave_hint", "Verzoegerung bis zum automatischen Speichern")}</small>
                        </div>
                        <div className="field" style={{flex: 1, minWidth: 140}}>
                            <label className="label">{t("ui.settings.editor_draft_save", "Entwurf (ms)")}</label>
                            <input className="input" type="number" min="500" max="10000" step="500"
                                value={edDraftSave} onChange={(e) => setEdDraftSave(e.target.value)}/>
                            <small style={{color: "var(--text-muted)", fontSize: "0.7rem"}}>{t("ui.settings.editor_draft_hint", "Verzoegerung bis zur lokalen Sicherung")}</small>
                        </div>
                    </div>
                    <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                        <div className="field" style={{flex: 1, minWidth: 140}}>
                            <label className="label">{t("ui.settings.editor_draft_age", "Entwurf-Alter (Tage)")}</label>
                            <input className="input" type="number" min="1" max="365" step="1"
                                value={edDraftAge} onChange={(e) => setEdDraftAge(e.target.value)}/>
                            <small style={{color: "var(--text-muted)", fontSize: "0.7rem"}}>{t("ui.settings.editor_draft_age_hint", "Lokale Entwuerfe älter als dieser Wert werden gelöscht")}</small>
                        </div>
                        <div className="field" style={{flex: 1, minWidth: 140}}>
                            <label className="label">{t("ui.settings.editor_ai_chars", "KI-Kontext (Zeichen)")}</label>
                            <input className="input" type="number" min="500" max="32000" step="500"
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
                    style={{gap: 6}}
                >
                    <Wrench size={14}/>
                    {showAdvanced ? t("ui.settings.white_label_hide", "Erweitert ausblenden") : t("ui.settings.white_label", "Erweitert: App anpassen")}
                </button>

                {showAdvanced && (
                    <div className={styles.card} style={{marginTop: 12, borderLeft: "3px solid var(--accent)"}}>
                        <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 4}}>
                            {t("ui.settings.white_label_title", "White-Label Konfiguration")}
                        </h3>
                        <p style={{color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 16}}>
                            {t("ui.settings.white_label_desc", "Passe Bibliogon als eigene App an. Aendere den Namen, entferne Standard-Plugins und erstelle deine eigene Autoren-Plattform.")}
                        </p>

                        <div className="field" style={{marginBottom: 12}}>
                            <label className="label">{t("ui.settings.app_name", "App-Name")}</label>
                            <input className="input" value={uiTitle} onChange={(e) => setUiTitle(e.target.value)}/>
                        </div>
                        <div className="field" style={{marginBottom: 16}}>
                            <label className="label">{t("ui.settings.description", "Beschreibung")}</label>
                            <input className="input" value={uiSubtitle} onChange={(e) => setUiSubtitle(e.target.value)}/>
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

// --- AI Assistant Tab ---

function AiAssistantSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => Promise<void> | void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const ai = (config.ai || {}) as Record<string, unknown>;

    const [aiEnabled, setAiEnabled] = useState(Boolean(ai.enabled));
    const [aiProvider, setAiProvider] = useState((ai.provider as string) || "lmstudio");
    const [aiBaseUrl, setAiBaseUrl] = useState((ai.base_url as string) || "");
    const [aiModel, setAiModel] = useState((ai.model as string) || "");
    const [aiTemp, setAiTemp] = useState(String(ai.temperature ?? "0.7"));
    const [aiMaxTokens, setAiMaxTokens] = useState(String(ai.max_tokens ?? "4096"));
    const [aiApiKey, setAiApiKey] = useState((ai.api_key as string) || "");
    const [showAiKey, setShowAiKey] = useState(false);
    const [aiTestStatus, setAiTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

    useEffect(() => {
        setAiEnabled(Boolean(ai.enabled));
        setAiProvider((ai.provider as string) || "lmstudio");
        setAiBaseUrl((ai.base_url as string) || "");
        setAiModel((ai.model as string) || "");
        setAiTemp(String(ai.temperature ?? "0.7"));
        setAiMaxTokens(String(ai.max_tokens ?? "4096"));
        setAiApiKey((ai.api_key as string) || "");
    }, [config]);

    // True when secrets are managed via ~/.config/bibliogon/secrets.yaml
    // or BIBLIOGON_AI_API_KEY env-var. Backend strips api_key from
    // PATCH bodies in this case as defense-in-depth; we drop it here
    // so the frontend never sends it in the first place.
    const secretsExternal = Boolean(
        (config as Record<string, unknown>)._secrets_managed_externally,
    );

    const buildSaveData = () => {
        const ai: Record<string, unknown> = {
            enabled: aiEnabled,
            provider: aiProvider,
            base_url: aiBaseUrl,
            model: aiModel,
            temperature: parseFloat(aiTemp) || 0.7,
            max_tokens: parseInt(aiMaxTokens) || 4096,
        };
        if (!secretsExternal) {
            ai.api_key = aiApiKey;
        }
        return {ai};
    };

    return (
        <div className={styles.main}>
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t("ui.settings.ai_title", "KI-Assistent")}</h2>
                <div className={styles.card}>
                    <div className="field">
                        <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
                            <input
                                type="checkbox"
                                checked={aiEnabled}
                                onChange={(e) => setAiEnabled(e.target.checked)}
                                style={{width: 16, height: 16, accentColor: "var(--accent)"}}
                            />
                            <span className="label" style={{margin: 0}}>{t("ui.settings.ai_enable", "KI-Funktionen aktivieren")}</span>
                        </label>
                        <small style={{color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, display: "block", marginLeft: 24}}>
                            {t("ui.settings.ai_enable_hint", "Wenn deaktiviert, sind alle KI-Funktionen ausgeblendet.")}
                        </small>
                    </div>

                    <div style={{opacity: aiEnabled ? 1 : 0.4, pointerEvents: aiEnabled ? "auto" : "none"}} aria-disabled={!aiEnabled}>
                        <div className="field">
                            <label className="label">{t("ui.settings.ai_provider", "KI-Anbieter")}</label>
                            <RadixSelect
                                value={aiProvider}
                                onValueChange={(val) => {
                                    setAiProvider(val);
                                    const preset = getProviderPreset(val);
                                    // The "custom" preset has empty
                                    // base_url + default_model on purpose -
                                    // do not wipe the user's input. For all
                                    // other presets, auto-fill from the
                                    // preset so users land in a working
                                    // state with one click.
                                    if (preset && val !== "custom") {
                                        setAiBaseUrl(preset.base_url);
                                        setAiModel(preset.default_model);
                                        setAiApiKey("");
                                    }
                                }}
                                options={AI_PROVIDER_IDS.map((pid) => ({
                                    value: pid,
                                    label: t(
                                        `ui.settings.ai_provider_${pid}`,
                                        AI_PROVIDER_PRESETS[pid].label,
                                    ),
                                }))}
                            />
                        </div>
                        <div className="field">
                            <label className="label">{t("ui.settings.ai_base_url", "Base URL")}</label>
                            <input className="input" value={aiBaseUrl} onChange={(e) => setAiBaseUrl(e.target.value)}
                                placeholder="https://api.openai.com/v1" style={{fontFamily: "var(--font-mono)", fontSize: "0.8125rem"}}/>
                        </div>
                        <div className="field">
                            <label className="label">{t("ui.settings.ai_model", "Modell")}</label>
                            <input className="input" value={aiModel} onChange={(e) => setAiModel(e.target.value)}
                                list="ai-model-suggestions"
                                placeholder={aiProvider === "lmstudio" ? t("ui.settings.ai_model_lmstudio", "Vom Server bereitgestellt") : ""}
                                style={{fontFamily: "var(--font-mono)", fontSize: "0.8125rem"}}/>
                            <datalist id="ai-model-suggestions">
                                {(getProviderPreset(aiProvider)?.model_suggestions || []).map((m) => (
                                    <option key={m} value={m}/>
                                ))}
                            </datalist>
                        </div>
                        <div style={{display: "flex", gap: 12}}>
                            <div className="field" style={{flex: 1}}>
                                <label className="label">{t("ui.settings.ai_temperature", "Temperature")}</label>
                                <input className="input" type="number" min="0" max="2" step="0.1"
                                    value={aiTemp} onChange={(e) => setAiTemp(e.target.value)}/>
                            </div>
                            <div className="field" style={{flex: 1}}>
                                <label className="label">{t("ui.settings.ai_max_tokens", "Max Tokens")}</label>
                                <input className="input" type="number" min="256" max="32768" step="256"
                                    value={aiMaxTokens} onChange={(e) => setAiMaxTokens(e.target.value)}/>
                            </div>
                        </div>
                        {secretsExternal ? (
                            <div className="field" data-testid="ai-api-key-external-note">
                                <label className="label">{t("ui.settings.ai_api_key", "API Key")}</label>
                                <div style={{
                                    padding: 12,
                                    border: "1px solid var(--border)",
                                    borderRadius: "var(--radius-sm)",
                                    background: "var(--bg-secondary)",
                                    color: "var(--text-muted)",
                                    fontSize: "0.8125rem",
                                }}>
                                    {t(
                                        "ui.settings.ai_api_key_external_note",
                                        "API-Schlüssel wird aus externer Konfiguration gelesen (~/.config/bibliogon/secrets.yaml oder Umgebungsvariable BIBLIOGON_AI_API_KEY). Editiere die Datei direkt oder setze die Umgebungsvariable, um den Schlüssel zu ändern.",
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="field">
                                <label className="label">{t("ui.settings.ai_api_key", "API Key")}</label>
                                <div style={{display: "flex", gap: 8}}>
                                    <input className="input" type={showAiKey ? "text" : "password"}
                                        data-testid="ai-api-key-input"
                                        value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)}
                                        placeholder={aiProvider === "lmstudio" ? t("ui.settings.ai_key_not_required", "Nicht erforderlich") : "sk-..."}
                                        style={{flex: 1, fontFamily: "var(--font-mono)", fontSize: "0.8125rem"}}/>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAiKey(!showAiKey)}
                                        title={showAiKey ? t("ui.common.hide", "Ausblenden") : t("ui.common.show", "Anzeigen")}>
                                        {showAiKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                                    </button>
                                </div>
                                <small style={{color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, display: "block"}}>
                                    {t("ui.settings.ai_key_hint", "Der API-Schlüssel wird nur lokal gespeichert und nur an den in 'Base URL' angegebenen Dienst übertragen.")}
                                </small>
                            </div>
                        )}
                        {aiProvider === "lmstudio" && (
                            <small style={{color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginBottom: 8}}>
                                {t("ui.settings.ai_lmstudio_hint", "Lokal laufend, kein API-Schlüssel nötig. Modelle werden vom LM Studio Server bereitgestellt.")}
                            </small>
                        )}
                        <div style={{display: "flex", gap: 8, alignItems: "center", marginTop: 8}}>
                            <button
                                className="btn btn-primary"
                                disabled={saving}
                                onClick={() => onSave(buildSaveData())}
                            >
                                <Save size={14}/> {t("ui.common.save", "Speichern")}
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={!aiBaseUrl || aiTestStatus === "testing"}
                                onClick={async () => {
                                    setAiTestStatus("testing");
                                    try {
                                        // Save current settings first so the backend sees the latest config
                                        await onSave(buildSaveData());

                                        const data = await api.ai.testConnection();
                                        if (data.success) {
                                            setAiTestStatus("ok");
                                            notify.success(t("ui.settings.ai_test_ok", "Verbindung erfolgreich"));
                                        } else {
                                            const errorKey = data.error_key || "error";
                                            const detail = data.error_detail || "";
                                            setAiTestStatus("fail");
                                            const errorMessages: Record<string, string> = {
                                                auth_error: t("ui.settings.ai_err_auth", "API-Schlüssel ungültig"),
                                                rate_limited: t("ui.settings.ai_err_rate", "Rate Limit erreicht. Bitte später erneut versuchen."),
                                                offline: t("ui.settings.ai_err_offline", "Server nicht erreichbar"),
                                                timeout: t("ui.settings.ai_err_timeout", "Zeitüberschreitung"),
                                                model_not_found: t("ui.settings.ai_err_model", "Modell nicht verfügbar"),
                                                invalid_request: t("ui.settings.ai_err_invalid", "Ungültige Anfrage"),
                                                server_error: t("ui.settings.ai_err_server", "Server-Fehler beim Anbieter"),
                                                disabled: t("ui.settings.ai_err_disabled", "KI-Funktionen sind deaktiviert. Aktiviere sie unter Einstellungen > KI-Assistent."),
                                            };
                                            const baseMessage = errorMessages[errorKey] || t("ui.settings.ai_test_fail", "Verbindung fehlgeschlagen");
                                            const fullMessage = detail ? `${baseMessage}: ${detail}` : baseMessage;
                                            notify.warning(fullMessage);
                                        }
                                    } catch {
                                        setAiTestStatus("fail");
                                        notify.error(t("ui.settings.ai_test_fail", "Verbindung fehlgeschlagen"));
                                    }
                                    setTimeout(() => setAiTestStatus("idle"), 3000);
                                }}
                            >
                                {aiTestStatus === "testing" ? t("ui.common.loading", "Laden...") : t("ui.settings.ai_test", "Verbindung testen")}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


function TopicsSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const initialTopics = Array.isArray(config.topics)
        ? (config.topics as unknown[]).filter((v): v is string => typeof v === "string")
        : [];
    const [topics, setTopics] = useState<string[]>(initialTopics);
    const [newTopic, setNewTopic] = useState("");

    useEffect(() => {
        setTopics(
            Array.isArray(config.topics)
                ? (config.topics as unknown[]).filter((v): v is string => typeof v === "string")
                : [],
        );
    }, [config]);

    const addTopic = () => {
        const trimmed = newTopic.trim();
        if (!trimmed || topics.includes(trimmed)) return;
        setTopics([...topics, trimmed]);
        setNewTopic("");
    };

    const removeTopic = (index: number) => {
        setTopics(topics.filter((_, i) => i !== index));
    };

    return (
        <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("ui.settings.topics_title", "Artikel-Themen")}</h2>
            <div className={styles.card}>
                <div className="field">
                    <p style={{fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 8}}>
                        {t("ui.settings.topics_hint", "Themen erscheinen als Auswahl im Artikel-Editor. Ein Thema ist die primaere Kategorie eines Artikels.")}
                    </p>
                    {topics.length > 0 && (
                        <div style={{display: "flex", flexDirection: "column", gap: 6, marginBottom: 8}}>
                            {topics.map((topic, i) => (
                                <div
                                    key={i}
                                    data-testid={`topic-row-${i}`}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        padding: "6px 10px", background: "var(--bg-secondary)",
                                        borderRadius: "var(--radius-sm)",
                                    }}
                                >
                                    <span style={{flex: 1, fontSize: "0.875rem"}}>{topic}</span>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => removeTopic(i)}
                                        style={{padding: "2px 6px", color: "var(--danger)"}}
                                        data-testid={`topic-remove-${i}`}
                                        aria-label={t("ui.settings.topics_remove", "Thema entfernen")}
                                    >
                                        <X size={12}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div style={{display: "flex", gap: 8}}>
                        <input
                            className="input"
                            value={newTopic}
                            onChange={(e) => setNewTopic(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addTopic()}
                            placeholder={t("ui.settings.topics_add_placeholder", "Neues Thema hinzufügen")}
                            data-testid="topic-add-input"
                            style={{flex: 1}}
                        />
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={addTopic}
                            disabled={!newTopic.trim()}
                            data-testid="topic-add-btn"
                        >
                            <Plus size={14}/> {t("ui.settings.topics_add", "Hinzufügen")}
                        </button>
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    style={{marginTop: 16}}
                    disabled={saving}
                    onClick={() => onSave({topics})}
                    data-testid="topics-save-btn"
                >
                    <Save size={14}/> {t("ui.common.save", "Speichern")}
                </button>
            </div>
        </div>
    );
}
