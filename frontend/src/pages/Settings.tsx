import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api} from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import {ChevronLeft, Save, Check, X, Key, Plus, Trash2, Home, Upload, Wrench} from "lucide-react";
import OrderedListEditor from "../components/OrderedListEditor";
import {useDialog} from "../components/AppDialog";
import {toast} from "react-toastify";
import * as Tabs from "@radix-ui/react-tabs";
import * as Select from "@radix-ui/react-select";
import {ChevronDown as ChevronDownIcon} from "lucide-react";
import {useI18n} from "../hooks/useI18n";

export default function Settings() {
    const navigate = useNavigate();
    const {setLang: setGlobalLang} = useI18n();
    const {t} = useI18n();
    const [appConfig, setAppConfig] = useState<Record<string, unknown>>({});
    const [pluginConfigs, setPluginConfigs] = useState<Record<string, Record<string, unknown>>>({});
    const [licenses, setLicenses] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

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
        try {
            const lics = await api.licenses.list();
            setLicenses(lics);
        } catch (err) {
            console.error("Failed to load licenses:", err);
        }
    };

    const showMessage = (msg: string, isError = false) => {
        if (isError) {
            toast.error(msg);
        } else {
            toast.success(msg);
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

            <Tabs.Root defaultValue="app">
                <Tabs.List className="radix-tabs-list">
                    <Tabs.Trigger value="app" className="radix-tab-trigger">{t("ui.settings.tab_general", "Allgemein")}</Tabs.Trigger>
                    <Tabs.Trigger value="author" className="radix-tab-trigger">{t("ui.settings.tab_author", "Autor")}</Tabs.Trigger>
                    <Tabs.Trigger value="plugins" className="radix-tab-trigger">{t("ui.settings.tab_plugins", "Plugins")}</Tabs.Trigger>
                    <Tabs.Trigger value="licenses" className="radix-tab-trigger">{t("ui.settings.tab_licenses", "Lizenzen")}</Tabs.Trigger>
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
                <Tabs.Content value="licenses">
                    <LicenseSettings
                        licenses={licenses}
                        onActivate={async (pluginName, key) => {
                            try {
                                await api.licenses.activate(pluginName, key);
                                const lics = await api.licenses.list();
                                setLicenses(lics);
                                showMessage(t("ui.settings.license_activated", "Lizenz aktiviert"));
                            } catch (err) {
                                showMessage(`${t("ui.settings.license_error", "Lizenzfehler")}: ${err}`);
                            }
                        }}
                        onDeactivate={async (pluginName) => {
                            try {
                                await api.licenses.deactivate(pluginName);
                                const lics = await api.licenses.list();
                                setLicenses(lics);
                                showMessage(t("ui.settings.license_removed", "Lizenz entfernt"));
                            } catch (err) {
                                showMessage(t("ui.common.error", "Fehler"), true);
                            }
                        }}
                    />
                </Tabs.Content>
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

    const [lang, setLang] = useState((app.default_language as string) || "de");
    const [uiTitle, setUiTitle] = useState((ui.title as string) || "Bibliogon");
    const [uiSubtitle, setUiSubtitle] = useState((ui.subtitle as string) || "");
    const [theme, setTheme] = useState((ui.theme as string) || "warm-literary");
    const [trashDays, setTrashDays] = useState(Number(app.trash_auto_delete_days ?? 30));
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [corePlugins, setCorePlugins] = useState<Record<string, boolean>>({
        export: true, help: true, getstarted: true,
    });

    useEffect(() => {
        setLang((app.default_language as string) || "de");
        setUiTitle((ui.title as string) || "Bibliogon");
        setUiSubtitle((ui.subtitle as string) || "");
        setTheme((ui.theme as string) || "warm-literary");
        setTrashDays(Number(app.trash_auto_delete_days ?? 30));
        setCorePlugins({
            export: enabledPlugins.includes("export"),
            help: enabledPlugins.includes("help"),
            getstarted: enabledPlugins.includes("getstarted"),
        });
    }, [config]);

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
                            {value: "en", label: t("ui.languages.en", "English")},
                            {value: "es", label: t("ui.languages.es", "Espanol")},
                            {value: "fr", label: t("ui.languages.fr", "Francais")},
                            {value: "el", label: t("ui.languages.el", "Ellinika")},
                            {value: "pt", label: t("ui.languages.pt", "Portugues")},
                            {value: "tr", label: t("ui.languages.tr", "Turkce")},
                            {value: "ja", label: t("ui.languages.ja", "Nihongo")},
                        ]}
                    />
                </div>
                <div className="field">
                    <label className="label">{t("ui.settings.app_name", "App-Name")}</label>
                    <input className="input" value={uiTitle} onChange={(e) => setUiTitle(e.target.value)}/>
                </div>
                <div className="field">
                    <label className="label">{t("ui.settings.description", "Beschreibung")}</label>
                    <input className="input" value={uiSubtitle} onChange={(e) => setUiSubtitle(e.target.value)}/>
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
                        options={[
                            {value: "warm-literary", label: "Warm Literary"},
                            {value: "cool-modern", label: "Cool Modern"},
                            {value: "nord", label: "Nord"},
                        ]}
                    />
                </div>
                <div className="field">
                    <label className="label">{t("ui.settings.trash_auto_delete", "Papierkorb auto-loeschen nach (Tage)")}</label>
                    <input
                        className="input"
                        type="number"
                        min={0}
                        max={365}
                        value={trashDays}
                        onChange={(e) => setTrashDays(Number(e.target.value))}
                    />
                    <small style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                        {trashDays === 0
                            ? t("ui.settings.trash_disabled", "Deaktiviert (manuell loeschen)")
                            : t("ui.settings.trash_info", "Buecher im Papierkorb werden nach {days} Tagen automatisch geloescht").replace("{days}", String(trashDays))}
                    </small>
                </div>
                <button
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => {
                        const enabled = Object.entries(corePlugins)
                            .filter(([, v]) => v).map(([k]) => k);
                        // Add non-core plugins that were already enabled
                        for (const p of enabledPlugins) {
                            if (!["export", "help", "getstarted"].includes(p) && !enabled.includes(p)) {
                                enabled.push(p);
                            }
                        }
                        onSave({
                            app: {default_language: lang, trash_auto_delete_days: trashDays},
                            ui: {title: uiTitle, subtitle: uiSubtitle, theme},
                            plugins: {enabled},
                        });
                    }}
                >
                    <Save size={14}/> {t("ui.common.save", "Speichern")}
                </button>
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
                toast.success(result.message);
                onReload();
            } catch (err) {
                toast.error(`${t("ui.common.error", "Fehler")}: ${err}`);
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
    // and NOT unimplemented premium plugins (no entry point loaded)
    const [loadedPlugins, setLoadedPlugins] = useState<Set<string>>(new Set());
    const [pluginLicenseInfo, setPluginLicenseInfo] = useState<Record<string, {tier: string; hasLicense: boolean}>>({});
    useEffect(() => {
        api.settings.discoveredPlugins().then((discovered) => {
            setLoadedPlugins(new Set(discovered.filter((p) => p.loaded).map((p) => p.name)));
            const info: Record<string, {tier: string; hasLicense: boolean}> = {};
            for (const p of discovered) {
                info[p.name] = {
                    tier: (p as Record<string, unknown>).license_tier as string || "core",
                    hasLicense: (p as Record<string, unknown>).has_license as boolean ?? true,
                };
            }
            setPluginLicenseInfo(info);
        }).catch(() => {});
    }, [configs]);

    const inactivePlugins = Object.entries(configs)
        .filter(([name]) => {
            // Not currently enabled
            if (enabled.has(name) && !disabled.has(name)) return false;
            // Show if loaded, ZIP-installed, or has license info (premium plugins with YAML config)
            return loadedPlugins.has(name) || name.startsWith("installed-") || name in pluginLicenseInfo;
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
                        const lic = (meta.license as string) || "MIT";
                        const isPremium = lic !== "MIT" && lic.toLowerCase() !== "free";
                        return (
                            <div key={name} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "10px 0", borderBottom: "1px solid var(--border)",
                            }}>
                                <div>
                                    <strong>{displayName}</strong>
                                    {isPremium && (
                                        <span style={{
                                            ...styles.badge, marginLeft: 8,
                                            background: "rgba(168,85,247,0.12)", color: "#7c3aed",
                                        }}>{t("ui.settings.premium", "Premium")}</span>
                                    )}
                                    {isPremium && !(pluginLicenseInfo[name]?.hasLicense) && (
                                        <span style={{
                                            ...styles.badge, marginLeft: 4,
                                            background: "rgba(239,68,68,0.12)", color: "#ef4444",
                                        }}>{t("ui.settings.license_required", "Lizenz erforderlich")}</span>
                                    )}
                                    {description && (
                                        <p style={{color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: 2}}>{description}</p>
                                    )}
                                </div>
                                {isPremium && !(pluginLicenseInfo[name]?.hasLicense) ? (
                                    <button
                                        className="btn btn-sm"
                                        style={{background: "rgba(168,85,247,0.15)", color: "#7c3aed", border: "1px solid rgba(168,85,247,0.3)"}}
                                        onClick={() => { setShowAdd(false); window.location.hash = "#licenses"; }}
                                    >
                                        <Key size={12}/> {t("ui.settings.enter_license", "Lizenz eingeben")}
                                    </button>
                                ) : (
                                    <button className="btn btn-primary btn-sm" onClick={() => {
                                        onTogglePlugin(name, true);
                                        setShowAdd(false);
                                    }}>
                                        <Check size={12}/> {t("ui.settings.activate", "Aktivieren")}
                                    </button>
                                )}
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
                        license={(pluginMeta.license as string) || "MIT"}
                        hasLicense={pluginLicenseInfo[name]?.hasLicense ?? true}
                        enabled={true}
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

const CORE_PLUGINS = new Set(["export", "help", "getstarted"]);

function PluginCard({name, displayName, description, version, license, hasLicense, enabled, settings, onSave, onToggle, onRemove}: {
    name: string;
    displayName: string;
    description: string;
    version: string;
    license: string;
    hasLicense: boolean;
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

    const updateSetting = (key: string, value: string | number) => {
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

    const isPremium = license !== "MIT" && license.toLowerCase() !== "free";

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
                            background: isPremium ? "rgba(168,85,247,0.12)" : "var(--accent-light)",
                            color: isPremium ? "#7c3aed" : "var(--accent)",
                        }}>
                            {isPremium ? t("ui.settings.premium", "Premium") : t("ui.settings.free", "Kostenlos")}
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
                        {isPremium && !hasLicense && (
                            <span style={{
                                ...styles.badge,
                                background: "rgba(239,68,68,0.12)",
                                color: "#ef4444",
                            }}>
                                {t("ui.settings.license_required", "Lizenz erforderlich")}
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
                    {!isCore && isPremium && !hasLicense ? (
                        <button
                            className="btn btn-sm"
                            style={{background: "rgba(168,85,247,0.15)", color: "#7c3aed", border: "1px solid rgba(168,85,247,0.3)"}}
                            onClick={() => {
                                // Navigate to license tab
                                window.location.hash = "#licenses";
                            }}
                        >
                            <Key size={12}/> {t("ui.settings.enter_license", "Lizenz eingeben")}
                        </button>
                    ) : !isCore && (
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
                    {/* Editable scalar settings */}
                    {scalarSettings.length > 0 && (
                        <>
                            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                                {t("ui.settings.expand_settings", "Einstellungen")}
                            </h4>
                            <div style={styles.settingsGrid}>
                                {scalarSettings.map(([key, value]) => (
                                    <div key={key} className="field">
                                        <label className="label">{key}</label>
                                        <input
                                            className="input"
                                            value={String(value)}
                                            onChange={(e) => {
                                                const v = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
                                                updateSetting(key, v as string | number);
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                            <button className="btn btn-primary btn-sm mt-1" onClick={() => onSave(localSettings)}>
                                <Save size={12}/> {t("ui.common.save", "Speichern")}
                            </button>
                        </>
                    )}

                    {/* Editable ordered lists (section_order, skip files) */}
                    {orderedListSettings.length > 0 && (
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

                    {/* Read-only complex settings */}
                    {complexSettings.length > 0 && (
                        <div style={{marginTop: (scalarSettings.length > 0 || orderedListSettings.length > 0) ? 16 : 0}}>
                            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                                {t("ui.settings.read_only", "Konfiguration (nur lesen)")}
                            </h4>
                            {complexSettings.map(([key, value]) => (
                                <div key={key} style={{marginBottom: 12}}>
                                    <label className="label">{key}</label>
                                    {renderReadOnlyValue(value)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// --- License Settings Tab ---

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

// --- License Settings Tab ---

function LicenseSettings({licenses, onActivate, onDeactivate}: {
    licenses: Record<string, unknown>;
    onActivate: (pluginName: string, key: string) => void;
    onDeactivate: (pluginName: string) => void;
}) {
    const {t} = useI18n();
    const [pluginName, setPluginName] = useState("");
    const [licenseKey, setLicenseKey] = useState("");

    return (
        <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t("ui.settings.licenses", "Lizenzen")}</h2>

            {/* Activate new license */}
            <div style={styles.card}>
                <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 12}}>{t("ui.settings.activate_license", "Lizenz aktivieren")}</h3>
                <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                    <input
                        className="input"
                        placeholder={t("ui.settings.plugin_name_placeholder", "Plugin-Name (z.B. kinderbuch)")}
                        value={pluginName}
                        onChange={(e) => setPluginName(e.target.value)}
                        style={{flex: "1 1 200px"}}
                    />
                    <input
                        className="input"
                        placeholder={t("ui.settings.license_key_placeholder", "Lizenzschluessel")}
                        value={licenseKey}
                        onChange={(e) => setLicenseKey(e.target.value)}
                        style={{flex: "2 1 300px"}}
                    />
                    <button
                        className="btn btn-primary"
                        disabled={!pluginName || !licenseKey}
                        onClick={() => {
                            onActivate(pluginName, licenseKey);
                            setPluginName("");
                            setLicenseKey("");
                        }}
                    >
                        <Key size={14}/> {t("ui.settings.activate", "Aktivieren")}
                    </button>
                </div>
            </div>

            {/* Active licenses */}
            {Object.keys(licenses).length > 0 && (
                <div style={styles.card}>
                    <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 12}}>{t("ui.settings.active_licenses", "Aktive Lizenzen")}</h3>
                    {Object.entries(licenses).map(([name, info]) => {
                        const lic = info as Record<string, unknown>;
                        const valid = lic.status === "valid";
                        return (
                            <div key={name} style={styles.licenseRow}>
                                <div>
                                    <strong>{name}</strong>
                                    <span style={{
                                        ...styles.badge,
                                        marginLeft: 8,
                                        background: valid ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                        color: valid ? "#16a34a" : "#dc2626",
                                    }}>
                                        {valid ? t("ui.settings.valid", "Gueltig") : t("ui.settings.invalid", "Ungueltig")}
                                    </span>
                                    {typeof lic.expires === "string" && (
                                        <span style={{color: "var(--text-muted)", fontSize: "0.8125rem", marginLeft: 8}}>
                                            {lic.expires === "lifetime" ? t("ui.settings.lifetime", "Unbegrenzt") : `${t("ui.settings.until", "bis")} ${lic.expires}`}
                                        </span>
                                    )}
                                    {typeof lic.error === "string" && (
                                        <span style={{color: "var(--danger)", fontSize: "0.8125rem", marginLeft: 8}}>
                                            {lic.error}
                                        </span>
                                    )}
                                </div>
                                <button className="btn btn-danger btn-sm" onClick={() => onDeactivate(name)}>
                                    {t("ui.common.remove", "Entfernen")}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {Object.keys(licenses).length === 0 && (
                <p style={{color: "var(--text-muted)", marginTop: 12}}>{t("ui.settings.no_licenses", "Keine Lizenzen aktiviert.")}</p>
            )}
        </div>
    );
}

// --- Helpers ---

// --- Radix Select wrapper ---

function RadixSelect({value, onValueChange, options}: {
    value: string;
    onValueChange: (value: string) => void;
    options: {value: string; label: string}[];
}) {
    return (
        <Select.Root value={value} onValueChange={onValueChange}>
            <Select.Trigger className="radix-select-trigger">
                <Select.Value/>
                <Select.Icon>
                    <ChevronDownIcon size={14}/>
                </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
                <Select.Content className="radix-select-content" position="popper" sideOffset={4}>
                    <Select.Viewport>
                        {options.map((opt) => (
                            <Select.Item key={opt.value} value={opt.value} className="radix-select-item">
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
    licenseRow: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 0", borderBottom: "1px solid var(--border)",
    },
};
