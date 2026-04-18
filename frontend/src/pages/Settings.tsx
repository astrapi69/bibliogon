import {useCallback, useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api, AudiobookVoice, formatVoiceLabel} from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import {ChevronLeft, Save, Check, X, Plus, Trash2, Home, Upload, Wrench, Eye, EyeOff} from "lucide-react";
import OrderedListEditor from "../components/OrderedListEditor";
import {useDialog} from "../components/AppDialog";
import {notify} from "../utils/notify";
import * as Tabs from "@radix-ui/react-tabs";
import * as Select from "@radix-ui/react-select";
import {ChevronDown as ChevronDownIcon} from "lucide-react";
import {useI18n} from "../hooks/useI18n";
import {AI_PROVIDER_PRESETS, AI_PROVIDER_IDS, getProviderPreset} from "../utils/aiProviders";
import SupportSection, {getDonationsConfig} from "../components/SupportSection";

export default function Settings() {
    const navigate = useNavigate();
    const {setLang: setGlobalLang} = useI18n();
    const {t} = useI18n();
    const [appConfig, setAppConfig] = useState<Record<string, unknown>>({});
    const [pluginConfigs, setPluginConfigs] = useState<Record<string, Record<string, unknown>>>({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [activeTab, setActiveTab] = useState("app");

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
        <div style={styles.container}>
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerInner}>
                    <div style={styles.headerLeft}>
                        <button style={styles.backBtn} onClick={() => navigate("/")}>
                            <ChevronLeft size={18}/>
                        </button>
                        <h1 style={styles.title}>{t("ui.settings.title", "Einstellungen")}</h1>
                    </div>
                    <div style={{display: "flex", alignItems: "center", gap: 8}}>
                        <button className="btn-icon" onClick={() => navigate("/")} title={t("ui.dashboard.title", "Dashboard")}>
                            <Home size={18}/>
                        </button>
                        <ThemeToggle/>
                    </div>
                </div>
            </header>

            <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
                <Tabs.List className="radix-tabs-list">
                    <Tabs.Trigger value="app" className="radix-tab-trigger">{t("ui.settings.tab_general", "Allgemein")}</Tabs.Trigger>
                    <Tabs.Trigger value="author" className="radix-tab-trigger">{t("ui.settings.tab_author", "Autor")}</Tabs.Trigger>
                    <Tabs.Trigger value="plugins" className="radix-tab-trigger">{t("ui.settings.tab_plugins", "Plugins")}</Tabs.Trigger>
                    {getDonationsConfig(appConfig) ? (
                        <Tabs.Trigger value="support" className="radix-tab-trigger" data-testid="settings-tab-support">{t("ui.donations.tab", "Unterstützen")}</Tabs.Trigger>
                    ) : null}
                </Tabs.List>

            <main style={styles.main}>
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
                                showMessage(`${data.name} hinzugefuegt`);
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

    const ai = (config.ai || {}) as Record<string, unknown>;
    const editorConfig = (config.editor || {}) as Record<string, unknown>;

    const [lang, setLang] = useState((app.default_language as string) || "de");
    const [uiTitle, setUiTitle] = useState((ui.title as string) || "Bibliogon");
    const [uiSubtitle, setUiSubtitle] = useState((ui.subtitle as string) || "");
    const [theme, setTheme] = useState((ui.theme as string) || "warm-literary");
    const [trashEnabled, setTrashEnabled] = useState(Boolean(app.trash_auto_delete_enabled));
    const [trashDays, setTrashDays] = useState(String(Number(app.trash_auto_delete_days ?? 30)));
    const [deletePermanently, setDeletePermanently] = useState(Boolean(app.delete_permanently));
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [corePlugins, setCorePlugins] = useState<Record<string, boolean>>({
        export: true, help: true, getstarted: true,
    });
    const [aiEnabled, setAiEnabled] = useState(Boolean(ai.enabled));
    const [aiProvider, setAiProvider] = useState((ai.provider as string) || "lmstudio");
    const [aiBaseUrl, setAiBaseUrl] = useState((ai.base_url as string) || "");
    const [aiModel, setAiModel] = useState((ai.model as string) || "");
    const [aiTemp, setAiTemp] = useState(String(ai.temperature ?? "0.7"));
    const [aiMaxTokens, setAiMaxTokens] = useState(String(ai.max_tokens ?? "4096"));
    const [aiApiKey, setAiApiKey] = useState((ai.api_key as string) || "");
    const [showAiKey, setShowAiKey] = useState(false);
    const [aiTestStatus, setAiTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
    const [edAutosave, setEdAutosave] = useState(String(editorConfig.autosave_debounce_ms ?? 800));
    const [edDraftSave, setEdDraftSave] = useState(String(editorConfig.draft_save_debounce_ms ?? 2000));
    const [edDraftAge, setEdDraftAge] = useState(String(editorConfig.draft_max_age_days ?? 30));
    const [edAiChars, setEdAiChars] = useState(String(editorConfig.ai_context_chars ?? 2000));

    useEffect(() => {
        setLang((app.default_language as string) || "de");
        setUiTitle((ui.title as string) || "Bibliogon");
        setUiSubtitle((ui.subtitle as string) || "");
        setTheme((ui.theme as string) || "warm-literary");
        setTrashEnabled(Boolean(app.trash_auto_delete_enabled));
        setTrashDays(String(Number(app.trash_auto_delete_days ?? 30)));
        setDeletePermanently(Boolean(app.delete_permanently));
        setCorePlugins({
            export: enabledPlugins.includes("export"),
            help: enabledPlugins.includes("help"),
            getstarted: enabledPlugins.includes("getstarted"),
        });
        setAiEnabled(Boolean(ai.enabled));
        setAiProvider((ai.provider as string) || "lmstudio");
        setAiBaseUrl((ai.base_url as string) || "");
        setAiModel((ai.model as string) || "");
        setAiTemp(String(ai.temperature ?? "0.7"));
        setAiMaxTokens(String(ai.max_tokens ?? "4096"));
        setAiApiKey((ai.api_key as string) || "");
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
            },
            ui: {title: uiTitle, subtitle: uiSubtitle, theme},
            plugins: {enabled},
            ai: {
                enabled: aiEnabled,
                provider: aiProvider,
                base_url: aiBaseUrl,
                model: aiModel,
                temperature: parseFloat(aiTemp) || 0.7,
                max_tokens: parseInt(aiMaxTokens) || 4096,
                api_key: aiApiKey,
            },
            editor: {
                autosave_debounce_ms: parseInt(edAutosave) || 800,
                draft_save_debounce_ms: parseInt(edDraftSave) || 2000,
                draft_max_age_days: parseInt(edDraftAge) || 30,
                ai_context_chars: parseInt(edAiChars) || 2000,
            },
        };
    };

    return (
        <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t("ui.settings.app_settings", "App-Einstellungen")}</h2>
            <div style={styles.card}>
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
                        options={[
                            {value: "warm-literary", label: "Warm Literary"},
                            {value: "cool-modern", label: "Cool Modern"},
                            {value: "nord", label: "Nord"},
                            {value: "classic", label: "Klassisch"},
                            {value: "studio", label: "Studio"},
                            {value: "notebook", label: "Notizbuch"},
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
                        <span className="label" style={{margin: 0}}>{t("ui.settings.trash_checkbox", "Geloeschte Buecher automatisch entfernen")}</span>
                    </label>
                    {trashEnabled && (
                        <div style={{marginTop: 8, marginLeft: 24}}>
                            <label className="label">{t("ui.settings.trash_delete_after", "Endgueltig loeschen nach")}</label>
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
                            ? t("ui.settings.trash_info", "Buecher im Papierkorb werden nach {days} Tagen automatisch geloescht").replace("{days}", trashDays)
                            : t("ui.settings.trash_disabled", "Deaktiviert (manuell loeschen)")}
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
                        <span className="label" style={{margin: 0}}>{t("ui.settings.delete_permanently", "Geloeschte Buecher sofort permanent loeschen")}</span>
                    </label>
                    <small style={{color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, display: "block", marginLeft: 24}}>
                        {t("ui.settings.delete_permanently_hint", "Bei Aktivierung werden Buecher nicht in den Papierkorb verschoben.")}
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

            {/* AI Configuration */}
            <div style={{marginTop: 16}}>
                <h2 style={styles.sectionTitle}>{t("ui.settings.ai_title", "KI-Assistent")}</h2>
                <div style={styles.card}>
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
                                    if (preset) {
                                        setAiBaseUrl(preset.base_url);
                                        setAiModel(preset.default_model);
                                        setAiApiKey("");
                                    }
                                }}
                                options={AI_PROVIDER_IDS.map((pid) => ({
                                    value: pid,
                                    label: AI_PROVIDER_PRESETS[pid].label,
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
                        <div className="field">
                            <label className="label">{t("ui.settings.ai_api_key", "API Key")}</label>
                            <div style={{display: "flex", gap: 8}}>
                                <input className="input" type={showAiKey ? "text" : "password"}
                                    value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)}
                                    placeholder={aiProvider === "lmstudio" ? t("ui.settings.ai_key_not_required", "Nicht erforderlich") : "sk-..."}
                                    style={{flex: 1, fontFamily: "var(--font-mono)", fontSize: "0.8125rem"}}/>
                                <button className="btn btn-ghost btn-sm" onClick={() => setShowAiKey(!showAiKey)}
                                    title={showAiKey ? t("ui.common.hide", "Ausblenden") : t("ui.common.show", "Anzeigen")}>
                                    {showAiKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                                </button>
                            </div>
                            <small style={{color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, display: "block"}}>
                                {t("ui.settings.ai_key_hint", "Der API-Schluessel wird nur lokal gespeichert und nur an den in 'Base URL' angegebenen Dienst uebertragen.")}
                            </small>
                        </div>
                        {aiProvider === "lmstudio" && (
                            <small style={{color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginBottom: 8}}>
                                {t("ui.settings.ai_lmstudio_hint", "Lokal laufend, kein API-Schluessel noetig. Modelle werden vom LM Studio Server bereitgestellt.")}
                            </small>
                        )}
                        <button
                            className="btn btn-ghost btn-sm"
                            disabled={!aiBaseUrl || aiTestStatus === "testing"}
                            onClick={async () => {
                                setAiTestStatus("testing");
                                try {
                                    // Save current settings first so the backend sees the latest config
                                    await onSave(buildSaveData());

                                    const resp = await fetch("/api/ai/test-connection");
                                    if (resp.ok) {
                                        const data = await resp.json();
                                        if (data.success) {
                                            setAiTestStatus("ok");
                                            notify.success(t("ui.settings.ai_test_ok", "Verbindung erfolgreich"));
                                        } else {
                                            const errorKey = data.error_key || "error";
                                            const detail = data.error_detail || "";
                                            setAiTestStatus("fail");
                                            const errorMessages: Record<string, string> = {
                                                auth_error: t("ui.settings.ai_err_auth", "API-Schluessel ungueltig"),
                                                rate_limited: t("ui.settings.ai_err_rate", "Rate Limit erreicht. Bitte spaeter erneut versuchen."),
                                                offline: t("ui.settings.ai_err_offline", "Server nicht erreichbar"),
                                                timeout: t("ui.settings.ai_err_timeout", "Zeitueberschreitung"),
                                                model_not_found: t("ui.settings.ai_err_model", "Modell nicht verfuegbar"),
                                                invalid_request: t("ui.settings.ai_err_invalid", "Ungueltige Anfrage"),
                                                server_error: t("ui.settings.ai_err_server", "Server-Fehler beim Anbieter"),
                                                disabled: t("ui.settings.ai_err_disabled", "KI-Funktionen sind deaktiviert. Aktiviere sie unter Einstellungen > Allgemein > KI-Assistent."),
                                            };
                                            const baseMessage = errorMessages[errorKey] || t("ui.settings.ai_test_fail", "Verbindung fehlgeschlagen");
                                            const fullMessage = detail ? `${baseMessage}: ${detail}` : baseMessage;
                                            notify.warning(fullMessage);
                                        }
                                    } else {
                                        setAiTestStatus("fail");
                                        notify.error(t("ui.settings.ai_test_fail", "Verbindung fehlgeschlagen"));
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

            {/* Editor Settings */}
            <div style={{marginTop: 16}}>
                <h2 style={styles.sectionTitle}>{t("ui.settings.editor_title", "Editor")}</h2>
                <div style={styles.card}>
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
                            <small style={{color: "var(--text-muted)", fontSize: "0.7rem"}}>{t("ui.settings.editor_draft_age_hint", "Lokale Entwuerfe aelter als dieser Wert werden geloescht")}</small>
                        </div>
                        <div className="field" style={{flex: 1, minWidth: 140}}>
                            <label className="label">{t("ui.settings.editor_ai_chars", "KI-Kontext (Zeichen)")}</label>
                            <input className="input" type="number" min="500" max="32000" step="500"
                                value={edAiChars} onChange={(e) => setEdAiChars(e.target.value)}/>
                            <small style={{color: "var(--text-muted)", fontSize: "0.7rem"}}>{t("ui.settings.editor_ai_chars_hint", "Maximale Zeichenanzahl fuer KI-Vorschlaege")}</small>
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
                    <div style={{...styles.card, marginTop: 12, borderLeft: "3px solid var(--accent)"}}>
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
                            {t("ui.settings.restart_hint", "Aenderungen werden beim naechsten \"Speichern\" uebernommen. Neustart erforderlich.")}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Plugin Settings Tab ---

function PluginSettings({configs, appConfig, onSavePlugin, onTogglePlugin, onAddPlugin, onRemovePlugin, onReload}: {
    configs: Record<string, Record<string, unknown>>;
    appConfig: Record<string, unknown>;
    onSavePlugin: (name: string, settings: Record<string, unknown>) => void;
    onTogglePlugin: (name: string, enable: boolean) => void;
    onAddPlugin: (data: {name: string; display_name?: string; description?: string}) => void;
    onRemovePlugin: (name: string) => void;
    onReload: () => void;
}) {
    const {t} = useI18n();
    const [showAdd, setShowAdd] = useState(false);
    const [uploading, setUploading] = useState(false);
    const pluginDialog = useDialog();
    const [newName, setNewName] = useState("");
    const [newDisplayName, setNewDisplayName] = useState("");
    const [newDescription, setNewDescription] = useState("");

    const handleUploadPlugin = async () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".zip";
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
                const result = await api.pluginInstall.install(file);
                notify.success(result.message);
                onReload();
            } catch (err) {
                notify.error(`${t("ui.common.error", "Fehler")}: ${err}`, err);
            }
            setUploading(false);
        };
        input.click();
    };

    const enabled = new Set(
        ((appConfig.plugins as Record<string, unknown>)?.enabled as string[]) || []
    );
    const disabled = new Set(
        ((appConfig.plugins as Record<string, unknown>)?.disabled as string[]) || []
    );

    const handleAdd = () => {
        if (!newName.trim()) return;
        onAddPlugin({
            name: newName.trim(),
            display_name: newDisplayName.trim() || undefined,
            description: newDescription.trim() || undefined,
        });
        setNewName("");
        setNewDisplayName("");
        setNewDescription("");
        setShowAdd(false);
    };

    // Inactive plugins: only show plugins that are NOT active core plugins
    const [loadedPlugins, setLoadedPlugins] = useState<Set<string>>(new Set());
    useEffect(() => {
        api.settings.discoveredPlugins().then((discovered) => {
            setLoadedPlugins(new Set(discovered.filter((p) => p.loaded).map((p) => p.name)));
        }).catch(() => {});
    }, [configs]);

    const inactivePlugins = Object.entries(configs)
        .filter(([name]) => {
            // Not currently enabled
            if (enabled.has(name) && !disabled.has(name)) return false;
            // Show if loaded or ZIP-installed
            return loadedPlugins.has(name) || name.startsWith("installed-");
        });

    return (
        <div style={styles.section}>
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                <h2 style={styles.sectionTitle}>{t("ui.settings.plugin_settings", "Plugin-Einstellungen")}</h2>
                <div style={{display: "flex", gap: 8}}>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleUploadPlugin}
                        disabled={uploading}
                    >
                        <Upload size={14}/> {uploading ? t("ui.settings.installing", "Installiert...") : t("ui.settings.install_zip", "ZIP installieren")}
                    </button>
                    {inactivePlugins.length > 0 && (
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>
                            <Plus size={14}/> {t("ui.settings.add_plugin", "Plugin hinzufuegen")}
                        </button>
                    )}
                </div>
            </div>

            {showAdd && inactivePlugins.length > 0 && (
                <div style={styles.card}>
                    <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 12}}>{t("ui.settings.available_plugins", "Verfuegbare Plugins")}</h3>
                    <p style={{color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 12}}>
                        {t("ui.settings.available_plugins_hint", "Diese Plugins sind installiert aber noch nicht aktiviert:")}
                    </p>
                    {inactivePlugins.map(([name, config]) => {
                        const meta = (config.plugin || {}) as Record<string, unknown>;
                        const displayName = getLocalized(meta.display_name, name);
                        const description = getLocalized(meta.description, "");
                        return (
                            <div key={name} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "10px 0", borderBottom: "1px solid var(--border)",
                            }}>
                                <div>
                                    <strong>{displayName}</strong>
                                    {description && (
                                        <p style={{color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: 2}}>{description}</p>
                                    )}
                                </div>
                                <button className="btn btn-primary btn-sm" onClick={() => {
                                    onTogglePlugin(name, true);
                                    setShowAdd(false);
                                }}>
                                    <Check size={12}/> {t("ui.settings.activate", "Aktivieren")}
                                </button>
                            </div>
                        );
                    })}
                    <div style={{marginTop: 12}}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>
                            {t("ui.common.close", "Schliessen")}
                        </button>
                    </div>
                </div>
            )}

            {Object.entries(configs)
                .filter(([name]) => enabled.has(name) && !disabled.has(name))
                .map(([name, config]) => {
                const pluginMeta = (config.plugin || {}) as Record<string, unknown>;
                const settings = (config.settings || {}) as Record<string, unknown>;
                const displayName = getLocalized(pluginMeta.display_name, name);
                const description = getLocalized(pluginMeta.description, "");

                return (
                    <PluginCard
                        key={name}
                        name={name}
                        displayName={displayName}
                        description={description}
                        version={(pluginMeta.version as string) || ""}
                        enabled={enabled.has(name) && !disabled.has(name)}
                        settings={settings}
                        onSave={(s) => onSavePlugin(name, s)}
                        onToggle={(e) => onTogglePlugin(name, e)}
                        onRemove={async () => {
                            if (await pluginDialog.confirm(t("ui.settings.remove_plugin", "Plugin entfernen"), `"${displayName}" ${t("ui.settings.remove_confirm", "wirklich entfernen? Die Konfiguration wird geloescht.")}`, "danger")) {
                                onRemovePlugin(name);
                            }
                        }}
                    />
                );
            })}
            {Object.entries(configs).filter(([name]) => enabled.has(name) && !disabled.has(name)).length === 0 && (
                <p style={{color: "var(--text-muted)"}}>{t("ui.settings.no_active_plugins", "Keine aktiven Plugins. Klicke \"Plugin hinzufuegen\" um verfuegbare Plugins zu aktivieren.")}</p>
            )}
        </div>
    );
}

const CORE_PLUGINS = new Set(["export", "help", "getstarted", "ms-tools"]);

// Normalize legacy boolean merge values to canonical enum strings.
// Migration: true -> "merged", false -> "separate".
function normalizeMergeMode(value: unknown): "separate" | "merged" | "both" {
    if (value === true) return "merged";
    if (value === false) return "separate";
    if (value === "separate" || value === "merged" || value === "both") return value;
    return "merged";
}

// --- Generic typed scalar field for the plugin settings card ---

/** Render a single scalar plugin setting with the right input type:
 *  boolean -> checkbox, number -> number input, string -> text input.
 *  Replaces the previous "everything is a text input" path that turned
 *  booleans into the literal strings "true"/"false".
 */
function ScalarSettingField({
    settingKey,
    value,
    onChange,
}: {
    settingKey: string;
    value: unknown;
    onChange: (v: string | number | boolean) => void;
}) {
    const {t} = useI18n();
    const label = t(`ui.audiobook.${settingKey}`, settingKey);

    if (typeof value === "boolean") {
        return (
            <div className="field">
                <label className="label" style={{display: "flex", alignItems: "center", gap: 8}}>
                    <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => onChange(e.target.checked)}
                    />
                    {label}
                </label>
            </div>
        );
    }

    if (typeof value === "number") {
        return (
            <div className="field">
                <label className="label">{label}</label>
                <input
                    className="input"
                    type="number"
                    value={String(value)}
                    onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (!Number.isNaN(parsed)) onChange(parsed);
                    }}
                />
            </div>
        );
    }

    // string fallback (also covers null/undefined coerced to empty)
    return (
        <div className="field">
            <label className="label">{label}</label>
            <input
                className="input"
                type="text"
                value={value == null ? "" : String(value)}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}


/** Editable JSON textarea for nested object settings. Validates on blur
 *  and only commits when the JSON parses; otherwise the local edit is
 *  kept and a warning is shown so the user does not silently lose work.
 */
function ComplexSettingField({
    settingKey,
    value,
    onChange,
}: {
    settingKey: string;
    value: unknown;
    onChange: (v: unknown) => void;
}) {
    const {t} = useI18n();
    const [text, setText] = useState(() => JSON.stringify(value, null, 2));
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setText(JSON.stringify(value, null, 2));
        setError(null);
    }, [value]);

    const commit = () => {
        try {
            const parsed = JSON.parse(text);
            setError(null);
            onChange(parsed);
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <div style={{marginBottom: 12}}>
            <label className="label">
                {settingKey}{" "}
                <span style={{fontWeight: 400, fontSize: "0.75rem", color: "var(--text-muted)"}}>
                    ({t("ui.settings.advanced_hint", "JSON, nur fuer fortgeschrittene User")})
                </span>
            </label>
            <textarea
                className="input"
                style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8125rem",
                    minHeight: 120,
                    width: "100%",
                }}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
            />
            {error && (
                <small style={{color: "var(--danger, #ef4444)", fontSize: "0.75rem"}}>
                    {t("ui.settings.invalid_json", "Ungueltiges JSON")}: {error}
                </small>
            )}
        </div>
    );
}


// --- Translation custom settings panel ---

/** Custom panel for the translation plugin. Mostly exists to render
 *  ``provider`` as a dropdown and ``deepl_api_key`` as a masked password
 *  field with a show/hide toggle, instead of leaking the key into a
 *  plain text input. The other four fields use the same typed inputs as
 *  the generic panel.
 */
function TranslationSettingsPanel({settings, onSave}: {
    settings: Record<string, unknown>;
    onSave: (s: Record<string, unknown>) => void;
}) {
    const {t} = useI18n();
    const [provider, setProvider] = useState<string>(String(settings.provider || "deepl"));
    const [apiKey, setApiKey] = useState<string>(String(settings.deepl_api_key || ""));
    const [showKey, setShowKey] = useState(false);
    const [freeApi, setFreeApi] = useState<boolean>(
        settings.deepl_free_api === undefined ? true : Boolean(settings.deepl_free_api),
    );
    const [lmstudioUrl, setLmstudioUrl] = useState<string>(
        String(settings.lmstudio_url || "http://localhost:1234/v1"),
    );
    const [lmstudioModel, setLmstudioModel] = useState<string>(
        String(settings.lmstudio_model || "default"),
    );
    const [lmstudioTemperature, setLmstudioTemperature] = useState<number>(
        typeof settings.lmstudio_temperature === "number" ? settings.lmstudio_temperature : 0.3,
    );

    const handleSave = () => {
        onSave({
            ...settings,
            provider,
            deepl_api_key: apiKey,
            deepl_free_api: freeApi,
            lmstudio_url: lmstudioUrl,
            lmstudio_model: lmstudioModel,
            lmstudio_temperature: lmstudioTemperature,
        });
    };

    const providerOptions = [
        {value: "deepl", label: "DeepL"},
        {value: "lmstudio", label: "LMStudio"},
    ];

    return (
        <>
            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                {t("ui.settings.expand_settings", "Einstellungen")}
            </h4>
            <div style={styles.settingsGrid}>
                <div className="field">
                    <label className="label">{t("ui.translation.provider", "Anbieter")}</label>
                    <RadixSelect value={provider} onValueChange={setProvider} options={providerOptions} />
                </div>
                <div className="field">
                    <label className="label">{t("ui.translation.deepl_api_key", "DeepL API-Schluessel")}</label>
                    <div style={{display: "flex", gap: 4}}>
                        <input
                            className="input"
                            type={showKey ? "text" : "password"}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={t("ui.translation.deepl_api_key_placeholder", "Optional, leer = LMStudio")}
                            style={{flex: 1}}
                            autoComplete="off"
                        />
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowKey(!showKey)}
                            title={showKey ? t("ui.common.hide", "Verbergen") : t("ui.common.show", "Anzeigen")}
                        >
                            {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                        </button>
                    </div>
                </div>
                <div className="field">
                    <label className="label" style={{display: "flex", alignItems: "center", gap: 8}}>
                        <input
                            type="checkbox"
                            checked={freeApi}
                            onChange={(e) => setFreeApi(e.target.checked)}
                        />
                        {t("ui.translation.deepl_free_api", "DeepL Free-API verwenden")}
                    </label>
                </div>
                <div className="field">
                    <label className="label">{t("ui.translation.lmstudio_url", "LMStudio URL")}</label>
                    <input
                        className="input"
                        type="text"
                        value={lmstudioUrl}
                        onChange={(e) => setLmstudioUrl(e.target.value)}
                    />
                </div>
                <div className="field">
                    <label className="label">{t("ui.translation.lmstudio_model", "LMStudio Modell")}</label>
                    <input
                        className="input"
                        type="text"
                        value={lmstudioModel}
                        onChange={(e) => setLmstudioModel(e.target.value)}
                    />
                </div>
                <div className="field">
                    <label className="label">{t("ui.translation.lmstudio_temperature", "LMStudio Temperatur")}</label>
                    <input
                        className="input"
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={lmstudioTemperature}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v)) setLmstudioTemperature(v);
                        }}
                    />
                </div>
            </div>
            <button className="btn btn-primary btn-sm mt-1" onClick={handleSave}>
                <Save size={12}/> {t("ui.common.save", "Speichern")}
            </button>
        </>
    );
}


// --- Audiobook custom settings panel with cascading dropdowns ---

function AudiobookSettingsPanel({settings, onSave}: {
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
        {value: "merged", label: t("ui.audiobook.merge_merged", "Alle Kapitel zusammenfuegen")},
        {value: "both", label: t("ui.audiobook.merge_both", "Beides")},
    ];

    return (
        <>
            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                {t("ui.settings.expand_settings", "Einstellungen")}
            </h4>
            <div style={styles.settingsGrid}>
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
                            {t("ui.audiobook.no_voices_for_combo", "Keine Stimmen fuer {engine} in {language} verfuegbar")
                                .replace("{engine}", engine)
                                .replace("{language}", language.toUpperCase())}
                        </div>
                    )}
                </div>
                <div className="field">
                    <label className="label">{t("ui.audiobook.merge", "Kapitel zusammenfuegen")}</label>
                    <RadixSelect value={merge} onValueChange={setMerge} options={mergeOptions} />
                </div>
            </div>
            <div className="field" style={{marginTop: 16}}>
                <label className="label" style={{display: "flex", alignItems: "center", gap: 8}}>
                    <input
                        type="checkbox"
                        checked={readChapterNumber}
                        onChange={(e) => setReadChapterNumber(e.target.checked)}
                    />
                    {t("ui.audiobook.read_chapter_number_label", "Kapitel-Nummer ansagen")}
                </label>
                <small style={{color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginTop: 4}}>
                    {t("ui.audiobook.read_chapter_number_description", "Wenn aktiviert, sagt die TTS vor jedem Kapitel ein 'Erstes Kapitel', 'Zweites Kapitel' usw. an. Standardmaessig deaktiviert, weil die meisten Buecher keine gesprochenen Kapitelmarken wollen.")}
                </small>
            </div>
            <button className="btn btn-primary btn-sm mt-1" onClick={handleSave}>
                <Save size={12}/> {t("ui.common.save", "Speichern")}
            </button>

            <ElevenLabsKeyPanel/>
            <GoogleCloudTTSPanel/>
        </>
    );
}

function ElevenLabsKeyPanel() {
    const {t} = useI18n();
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [keyInput, setKeyInput] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.audiobook
            .getElevenLabsConfig()
            .then((r) => setConfigured(r.configured))
            .catch(() => setConfigured(false));
    }, []);

    const handleSave = async () => {
        if (!keyInput.trim()) return;
        setBusy(true);
        try {
            const r = await api.audiobook.setElevenLabsKey(keyInput.trim());
            setConfigured(true);
            setKeyInput("");
            const tier = r.tier ? ` (${r.tier})` : "";
            notify.success(
                t("ui.audiobook.elevenlabs_saved", "ElevenLabs-Schluessel gespeichert") + tier,
            );
        } catch (err) {
            notify.error(
                t("ui.audiobook.elevenlabs_save_failed", "ElevenLabs-Schluessel konnte nicht gespeichert werden"),
                err,
            );
        }
        setBusy(false);
    };

    const handleTest = async () => {
        if (!keyInput.trim()) {
            notify.error(t("ui.audiobook.elevenlabs_empty", "Bitte API-Key eingeben"));
            return;
        }
        setBusy(true);
        try {
            const r = await api.audiobook.setElevenLabsKey(keyInput.trim());
            notify.success(
                t("ui.audiobook.elevenlabs_test_ok", "API-Key gueltig") +
                    (r.tier ? ` (${r.tier})` : ""),
            );
            setConfigured(true);
            setKeyInput("");
        } catch (err) {
            notify.error(t("ui.audiobook.elevenlabs_test_failed", "API-Key ungueltig"), err);
        }
        setBusy(false);
    };

    const handleRemove = async () => {
        setBusy(true);
        try {
            await api.audiobook.deleteElevenLabsKey();
            setConfigured(false);
            notify.success(t("ui.audiobook.elevenlabs_removed", "ElevenLabs-Schluessel entfernt"));
        } catch (err) {
            notify.error(
                t("ui.audiobook.elevenlabs_remove_failed", "Schluessel konnte nicht entfernt werden"),
                err,
            );
        }
        setBusy(false);
    };

    return (
        <div style={{
            marginTop: 24, paddingTop: 16,
            borderTop: "1px solid var(--border)",
        }}>
            <h4 style={{
                fontSize: "0.8125rem", fontWeight: 600,
                color: "var(--text-muted)", marginBottom: 8,
            }}>
                {t("ui.audiobook.api_keys", "API-Keys")}
            </h4>
            <div className="field">
                <label className="label">
                    {t("ui.audiobook.elevenlabs_key", "ElevenLabs API-Key")}
                </label>
                <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                    <input
                        className="input"
                        type={showKey ? "text" : "password"}
                        value={keyInput}
                        placeholder={configured ? t("ui.audiobook.elevenlabs_stored", "********** (gespeichert)") : "sk_..."}
                        onChange={(e) => setKeyInput(e.target.value)}
                        style={{flex: 1}}
                        disabled={busy}
                    />
                    <button
                        type="button"
                        className="btn-icon"
                        title={showKey ? t("ui.common.hide", "Ausblenden") : t("ui.common.show", "Anzeigen")}
                        onClick={() => setShowKey((v) => !v)}
                    >
                        {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                    </button>
                </div>
                <small style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                    {t(
                        "ui.audiobook.elevenlabs_hint",
                        "Nur noetig fuer ElevenLabs Engine. Kostenloses Konto auf elevenlabs.io, API-Key im Profil generieren.",
                    )}
                </small>
                {configured === true && (
                    <div style={{fontSize: "0.75rem", color: "var(--accent)", marginTop: 4}}>
                        {t("ui.audiobook.elevenlabs_configured", "Schluessel hinterlegt.")}
                    </div>
                )}
            </div>
            <div style={{display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap"}}>
                <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleTest}
                    disabled={busy || !keyInput.trim()}
                >
                    {t("ui.audiobook.elevenlabs_test", "Testen")}
                </button>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={busy || !keyInput.trim()}
                >
                    <Save size={12}/> {t("ui.common.save", "Speichern")}
                </button>
                {configured && (
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleRemove}
                        disabled={busy}
                        style={{color: "var(--danger, #c0392b)"}}
                    >
                        <Trash2 size={12}/>{" "}
                        {t("ui.audiobook.elevenlabs_remove", "Entfernen")}
                    </button>
                )}
            </div>
        </div>
    );
}

function GoogleCloudTTSPanel() {
    const {t} = useI18n();
    const [config, setConfig] = useState<{
        configured: boolean;
        project_id?: string;
        client_email?: string;
        seeding_done?: boolean;
        seeding_error?: string | null;
        voice_count?: number;
    } | null>(null);
    const [busy, setBusy] = useState(false);
    const pollRef = useRef<number | null>(null);

    const load = useCallback(async () => {
        try {
            const c = await api.audiobook.getGoogleCloudConfig();
            setConfig(c);
            return c;
        } catch {
            setConfig({configured: false});
            return {configured: false} as {configured: boolean; seeding_done?: boolean};
        }
    }, []);

    useEffect(() => {
        load();
        return () => {
            if (pollRef.current !== null) clearInterval(pollRef.current);
        };
    }, [load]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy(true);
        try {
            await api.audiobook.uploadGoogleCloudCredentials(file);
            notify.success(t("ui.audiobook.google_uploaded", "Google Cloud Credentials gespeichert. Stimmen werden geladen..."));
            // Poll until seeding is done
            pollRef.current = window.setInterval(async () => {
                const c = await load();
                if (c.seeding_done !== false) {
                    if (pollRef.current !== null) clearInterval(pollRef.current);
                    pollRef.current = null;
                    if (c.seeding_done && !("seeding_error" in c && c.seeding_error)) {
                        notify.success(
                            t("ui.audiobook.google_seeded", "Stimmen geladen") +
                            (config?.voice_count ? ` (${config.voice_count})` : ""),
                        );
                    }
                }
            }, 2000);
        } catch (err) {
            notify.error(t("ui.audiobook.google_upload_failed", "Upload fehlgeschlagen"), err);
        }
        setBusy(false);
        e.target.value = "";
    };

    const handleTest = async () => {
        setBusy(true);
        try {
            const r = await api.audiobook.testGoogleCloudCredentials();
            if (r.valid) {
                notify.success(t("ui.audiobook.google_test_ok", "Verbindung erfolgreich") + (r.message ? `: ${r.message}` : ""));
            } else {
                notify.error(t("ui.audiobook.google_test_failed", "Verbindung fehlgeschlagen") + (r.message ? `: ${r.message}` : ""));
            }
        } catch (err) {
            notify.error(t("ui.audiobook.google_test_failed", "Verbindung fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const handleRemove = async () => {
        setBusy(true);
        try {
            await api.audiobook.deleteGoogleCloudCredentials();
            setConfig({configured: false});
            notify.success(t("ui.audiobook.google_removed", "Google Cloud Credentials entfernt"));
        } catch (err) {
            notify.error(t("ui.audiobook.google_remove_failed", "Entfernen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    return (
        <div style={{
            marginTop: 24, paddingTop: 16,
            borderTop: "1px solid var(--border)",
        }}>
            <h4 style={{
                fontSize: "0.8125rem", fontWeight: 600,
                color: "var(--text-muted)", marginBottom: 8,
            }}>
                Google Cloud Text-to-Speech
            </h4>

            {config?.configured ? (
                <>
                    <div style={{fontSize: "0.75rem", color: "var(--accent)", marginBottom: 4}}>
                        {t("ui.audiobook.google_connected", "Verbunden")}
                        {config.project_id && ` - ${config.project_id}`}
                    </div>
                    {config.client_email && (
                        <div style={{fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8}}>
                            {config.client_email}
                        </div>
                    )}
                    {config.seeding_done === false && (
                        <div style={{fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8}}>
                            {t("ui.audiobook.google_seeding", "Stimmen werden geladen...")}
                        </div>
                    )}
                    {config.seeding_error && (
                        <div style={{fontSize: "0.75rem", color: "var(--danger, #c0392b)", marginBottom: 8}}>
                            {t("ui.audiobook.google_seeding_error", "Fehler beim Laden der Stimmen")}: {config.seeding_error}
                        </div>
                    )}
                    {config.voice_count && config.voice_count > 0 && (
                        <div style={{fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8}}>
                            {config.voice_count} {t("ui.audiobook.google_voices_count", "Stimmen verfuegbar")}
                        </div>
                    )}
                    <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                        <button className="btn btn-secondary btn-sm" onClick={handleTest} disabled={busy}>
                            {t("ui.audiobook.elevenlabs_test", "Testen")}
                        </button>
                        <button
                            className="btn btn-ghost btn-sm" onClick={handleRemove} disabled={busy}
                            style={{color: "var(--danger, #c0392b)"}}
                        >
                            <Trash2 size={12}/> {t("ui.audiobook.elevenlabs_remove", "Entfernen")}
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <small style={{color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginBottom: 8}}>
                        {t(
                            "ui.audiobook.google_hint",
                            "Google Cloud Console > Projekt > Cloud Text-to-Speech API aktivieren > Service Account erstellen > JSON-Key herunterladen.",
                        )}
                    </small>
                    <label className="btn btn-secondary btn-sm" style={{cursor: "pointer"}}>
                        <Upload size={12}/>
                        {" "}
                        {t("ui.audiobook.google_upload", "Service Account JSON hochladen")}
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleUpload}
                            disabled={busy}
                            style={{display: "none"}}
                        />
                    </label>
                </>
            )}
        </div>
    );
}

function PluginCard({name, displayName, description, version, enabled, settings, onSave, onToggle, onRemove}: {
    name: string;
    displayName: string;
    description: string;
    version: string;
    enabled: boolean;
    settings: Record<string, unknown>;
    onSave: (settings: Record<string, unknown>) => void;
    onToggle: (enable: boolean) => void;
    onRemove: () => void;
}) {
    const {t} = useI18n();
    const isCore = CORE_PLUGINS.has(name);
    const [localSettings, setLocalSettings] = useState(settings);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    const updateSetting = (key: string, value: string | number | boolean) => {
        setLocalSettings((prev) => ({...prev, [key]: value}));
    };

    // Categorize settings: scalar (editable), ordered-list (reorderable), complex (read-only)
    const scalarSettings: [string, unknown][] = [];
    const orderedListSettings: [string, unknown][] = [];
    const complexSettings: [string, unknown][] = [];
    for (const [key, value] of Object.entries(localSettings)) {
        if (value === null || value === undefined) continue;
        if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
            orderedListSettings.push([key, value]);
        } else if (typeof value === "object" && !Array.isArray(value) && isSectionOrder(key, value)) {
            orderedListSettings.push([key, value]);
        } else if (typeof value === "object") {
            complexSettings.push([key, value]);
        } else {
            scalarSettings.push([key, value]);
        }
    }
    const hasSettings = scalarSettings.length > 0 || orderedListSettings.length > 0 || complexSettings.length > 0;

    return (
        <div style={{
            ...styles.card,
            borderLeft: enabled ? "3px solid var(--accent)" : "3px solid transparent",
            opacity: enabled ? 1 : 0.75,
        }}>
            <div style={styles.pluginHeader}>
                <div style={{flex: 1}}>
                    <div style={{display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap"}}>
                        <strong style={{fontSize: "1rem"}}>{displayName}</strong>
                        <span style={styles.badge}>v{version}</span>
                        <span style={{
                            ...styles.badge,
                            background: "var(--accent-light)",
                            color: "var(--accent)",
                        }}>
                            {t("ui.settings.free", "Kostenlos")}
                        </span>
                        <span style={{
                            ...styles.badge,
                            background: enabled ? "rgba(34,197,94,0.12)" : "rgba(168,162,158,0.12)",
                            color: enabled ? "#16a34a" : "var(--text-muted)",
                        }}>
                            {enabled ? t("ui.settings.active", "Aktiv") : t("ui.settings.inactive", "Inaktiv")}
                        </span>
                        {isCore && (
                            <span style={{
                                ...styles.badge,
                                background: "rgba(59,130,246,0.12)",
                                color: "#2563eb",
                            }}>
                                {t("ui.settings.standard", "Standard")}
                            </span>
                        )}
                    </div>
                    {description && <p style={{color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4}}>{description}</p>}
                </div>
                <div style={{display: "flex", alignItems: "center", gap: 6, flexShrink: 0}}>
                    {hasSettings && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(!expanded)}>
                            {expanded ? t("ui.settings.collapse", "Zuklappen") : t("ui.settings.expand_settings", "Einstellungen")}
                        </button>
                    )}
                    {!isCore && (
                        <button
                            className={`btn btn-sm ${enabled ? "btn-danger" : "btn-primary"}`}
                            onClick={() => onToggle(!enabled)}
                        >
                            {enabled ? <><X size={12}/> {t("ui.settings.off", "Aus")}</> : <><Check size={12}/> {t("ui.settings.on", "An")}</>}
                        </button>
                    )}
                    {!isCore && (
                        <button
                            className="btn btn-sm btn-danger"
                            onClick={onRemove}
                            title={t("ui.settings.remove_plugin", "Plugin entfernen")}
                            style={{padding: "4px 6px"}}
                        >
                            <Trash2 size={12}/>
                        </button>
                    )}
                </div>
            </div>

            {expanded && hasSettings && (
                <div style={{marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)"}}>
                    {/* Custom audiobook settings with cascading dropdowns */}
                    {name === "audiobook" && scalarSettings.length > 0 ? (
                        <AudiobookSettingsPanel
                            settings={localSettings}
                            onSave={onSave}
                        />
                    ) : name === "translation" && scalarSettings.length > 0 ? (
                        <TranslationSettingsPanel
                            settings={localSettings}
                            onSave={onSave}
                        />
                    ) : scalarSettings.length > 0 && (
                        <>
                            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                                {t("ui.settings.expand_settings", "Einstellungen")}
                            </h4>
                            <div style={styles.settingsGrid}>
                                {scalarSettings.map(([key, value]) => (
                                    <ScalarSettingField
                                        key={key}
                                        settingKey={key}
                                        value={value}
                                        onChange={(v) => updateSetting(key, v)}
                                    />
                                ))}
                            </div>
                            <button className="btn btn-primary btn-sm mt-1" onClick={() => onSave(localSettings)}>
                                <Save size={12}/> {t("ui.common.save", "Speichern")}
                            </button>
                        </>
                    )}

                    {/* Editable ordered lists (section_order, skip files).
                        Audiobook handles its lists inside AudiobookSettingsPanel
                        to avoid showing two save buttons for one config. */}
                    {name !== "audiobook" && orderedListSettings.length > 0 && (
                        <div style={{marginTop: scalarSettings.length > 0 ? 16 : 0}}>
                            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                                {t("ui.settings.ordered_lists", "Reihenfolge und Listen")}
                            </h4>
                            {orderedListSettings.map(([key, value]) => (
                                <div key={key} style={{marginBottom: 16}}>
                                    {Array.isArray(value) ? (
                                        <OrderedListEditor
                                            label={key}
                                            items={value as string[]}
                                            onChange={(newItems) => {
                                                setLocalSettings((prev) => ({...prev, [key]: newItems}));
                                            }}
                                            addPlaceholder="z.B. front-matter/dedication.md"
                                        />
                                    ) : (
                                        /* section_order is a dict of book_type -> string[] */
                                        Object.entries(value as Record<string, unknown>).map(([subKey, subValue]) => (
                                            <div key={subKey} style={{marginBottom: 12}}>
                                                {Array.isArray(subValue) ? (
                                                    <OrderedListEditor
                                                        label={`${key} > ${subKey}`}
                                                        items={subValue as string[]}
                                                        onChange={(newItems) => {
                                                            setLocalSettings((prev) => ({
                                                                ...prev,
                                                                [key]: {
                                                                    ...(prev[key] as Record<string, unknown>),
                                                                    [subKey]: newItems,
                                                                },
                                                            }));
                                                        }}
                                                        addPlaceholder="z.B. back-matter/epilogue.md"
                                                    />
                                                ) : (
                                                    <div>
                                                        <label className="label">{key} &gt; {subKey}</label>
                                                        <span style={{fontSize: "0.8125rem", color: "var(--text-muted)"}}>
                                                            {subValue === null ? "null (Fallback)" : String(subValue)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            ))}
                            <button className="btn btn-primary btn-sm" onClick={() => onSave(localSettings)}>
                                <Save size={12}/> {t("ui.common.save", "Speichern")}
                            </button>
                        </div>
                    )}

                    {/* Complex settings: editable JSON with "Advanced" hint */}
                    {complexSettings.length > 0 && (
                        <div style={{marginTop: (scalarSettings.length > 0 || orderedListSettings.length > 0) ? 16 : 0}}>
                            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                                {t("ui.settings.advanced", "Erweitert (JSON)")}
                            </h4>
                            {complexSettings.map(([key, value]) => (
                                <ComplexSettingField
                                    key={key}
                                    settingKey={key}
                                    value={value}
                                    onChange={(v) => updateSetting(key, v as unknown as string)}
                                />
                            ))}
                            <button className="btn btn-primary btn-sm mt-1" onClick={() => onSave(localSettings)}>
                                <Save size={12}/> {t("ui.common.save", "Speichern")}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// --- Author Settings Tab ---

function AuthorSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const author = (config.author || {}) as Record<string, unknown>;
    const [name, setName] = useState((author.name as string) || "");
    const [penNames, setPenNames] = useState<string[]>(
        Array.isArray(author.pen_names) ? (author.pen_names as string[]) : []
    );
    const [newPenName, setNewPenName] = useState("");

    useEffect(() => {
        setName((author.name as string) || "");
        setPenNames(Array.isArray(author.pen_names) ? (author.pen_names as string[]) : []);
    }, [config]);

    const addPenName = () => {
        const trimmed = newPenName.trim();
        if (!trimmed || penNames.includes(trimmed)) return;
        setPenNames([...penNames, trimmed]);
        setNewPenName("");
    };

    const removePenName = (index: number) => {
        setPenNames(penNames.filter((_, i) => i !== index));
    };

    return (
        <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t("ui.settings.author_profile", "Autorenprofil")}</h2>
            <div style={styles.card}>
                <div className="field">
                    <label className="label">{t("ui.settings.real_name", "Echter Name")}</label>
                    <input
                        className="input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("ui.settings.real_name_placeholder", "Dein vollstaendiger Name")}
                    />
                </div>

                <div className="field" style={{marginTop: 16}}>
                    <label className="label">{t("ui.settings.pen_names", "Pseudonyme (Pen Names)")}</label>
                    <p style={{fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 8}}>
                        {t("ui.settings.pen_names_hint", "Beim Erstellen eines neuen Buches kannst du zwischen deinem echten Namen und Pseudonymen waehlen.")}
                    </p>
                    {penNames.length > 0 && (
                        <div style={{display: "flex", flexDirection: "column", gap: 6, marginBottom: 8}}>
                            {penNames.map((pn, i) => (
                                <div key={i} style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    padding: "6px 10px", background: "var(--bg-secondary)",
                                    borderRadius: "var(--radius-sm)",
                                }}>
                                    <span style={{flex: 1, fontSize: "0.875rem"}}>{pn}</span>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => removePenName(i)}
                                        style={{padding: "2px 6px", color: "var(--danger)"}}
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
                            value={newPenName}
                            onChange={(e) => setNewPenName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addPenName()}
                            placeholder={t("ui.settings.add_pen_name_placeholder", "Neues Pseudonym hinzufuegen")}
                            style={{flex: 1}}
                        />
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={addPenName}
                            disabled={!newPenName.trim()}
                        >
                            <Plus size={14}/> {t("ui.settings.add_pen_name", "Hinzufuegen")}
                        </button>
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    style={{marginTop: 16}}
                    disabled={saving}
                    onClick={() => onSave({author: {name, pen_names: penNames}})}
                >
                    <Save size={14}/> {t("ui.common.save", "Speichern")}
                </button>
            </div>
        </div>
    );
}

// --- Helpers ---

// --- Radix Select wrapper ---

function RadixSelect({value, onValueChange, options, testId}: {
    value: string;
    onValueChange: (value: string) => void;
    options: {value: string; label: string}[];
    testId?: string;
}) {
    return (
        <Select.Root value={value} onValueChange={onValueChange}>
            <Select.Trigger
                className="radix-select-trigger"
                data-testid={testId ? `${testId}-trigger` : undefined}
            >
                <Select.Value/>
                <Select.Icon>
                    <ChevronDownIcon size={14}/>
                </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
                <Select.Content className="radix-select-content" position="popper" sideOffset={4}>
                    <Select.Viewport>
                        {options.map((opt) => (
                            <Select.Item
                                key={opt.value}
                                value={opt.value}
                                className="radix-select-item"
                                data-testid={testId ? `${testId}-item-${opt.value}` : undefined}
                            >
                                <Select.ItemText>{opt.label}</Select.ItemText>
                            </Select.Item>
                        ))}
                    </Select.Viewport>
                </Select.Content>
            </Select.Portal>
        </Select.Root>
    );
}

function isSectionOrder(key: string, value: unknown): boolean {
    // A dict where values are string arrays or null (like section_order with ebook/paperback/etc)
    if (key !== "section_order") return false;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return Object.values(value as Record<string, unknown>).every(
        (v) => v === null || (Array.isArray(v) && v.every((item) => typeof item === "string"))
    );
}

function getLocalized(value: unknown, fallback: string): string {
    if (!value) return fallback;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
        const obj = value as Record<string, string>;
        return obj.de || obj.en || Object.values(obj)[0] || fallback;
    }
    return fallback;
}

function renderReadOnlyValue(value: unknown): React.ReactNode {
    if (Array.isArray(value)) {
        return (
            <div style={{display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4}}>
                {value.map((item, i) => (
                    <span key={i} style={{
                        fontSize: "0.75rem", padding: "2px 8px",
                        background: "var(--bg-secondary)", borderRadius: 4,
                        color: "var(--text-secondary)", fontFamily: "var(--font-mono)",
                    }}>
                        {typeof item === "object" ? JSON.stringify(item) : String(item)}
                    </span>
                ))}
            </div>
        );
    }
    if (typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>;
        return (
            <div style={{marginTop: 4, paddingLeft: 12, borderLeft: "2px solid var(--border)"}}>
                {Object.entries(obj).map(([k, v]) => (
                    <div key={k} style={{marginBottom: 4}}>
                        <span style={{fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)"}}>{k}: </span>
                        {typeof v === "object" && v !== null
                            ? renderReadOnlyValue(v)
                            : <span style={{fontSize: "0.8125rem", color: "var(--text-secondary)"}}>{String(v ?? "null")}</span>
                        }
                    </div>
                ))}
            </div>
        );
    }
    return <span style={{fontSize: "0.8125rem", color: "var(--text-secondary)"}}>{String(value)}</span>;
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
    container: {minHeight: "100vh", background: "var(--bg-primary)"},
    header: {borderBottom: "1px solid var(--border)", background: "var(--bg-card)"},
    headerInner: {
        maxWidth: 900, margin: "0 auto", padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
    },
    headerLeft: {display: "flex", alignItems: "center", gap: 8},
    backBtn: {
        background: "none", border: "none", cursor: "pointer",
        color: "var(--text-secondary)", display: "flex", alignItems: "center",
        padding: 4, borderRadius: 4,
    },
    title: {
        fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 600,
        color: "var(--text-primary)",
    },
    message: {
        fontSize: "0.8125rem", fontWeight: 500, color: "var(--accent)",
    },
    main: {maxWidth: 900, margin: "0 auto", padding: "24px"},
    section: {display: "flex", flexDirection: "column", gap: 16},
    sectionTitle: {
        fontFamily: "var(--font-display)", fontSize: "1.125rem", fontWeight: 600,
        color: "var(--text-primary)", marginBottom: 4,
    },
    card: {
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: 20,
    },
    pluginHeader: {display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16},
    badge: {
        fontSize: "0.6875rem", fontWeight: 600, padding: "2px 6px",
        borderRadius: 4, background: "var(--bg-secondary)", color: "var(--text-muted)",
    },
    settingsGrid: {
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12,
    },
};
