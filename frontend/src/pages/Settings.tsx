import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api} from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import {ChevronLeft, Save, Check, X, Key} from "lucide-react";

type Tab = "app" | "plugins" | "licenses";

export default function Settings() {
    const navigate = useNavigate();
    const [tab, setTab] = useState<Tab>("app");
    const [appConfig, setAppConfig] = useState<Record<string, unknown>>({});
    const [pluginConfigs, setPluginConfigs] = useState<Record<string, Record<string, unknown>>>({});
    const [licenses, setLicenses] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [app, plugins, lics] = await Promise.all([
                api.settings.getApp(),
                api.settings.listPlugins(),
                api.licenses.list(),
            ]);
            setAppConfig(app);
            setPluginConfigs(plugins as Record<string, Record<string, unknown>>);
            setLicenses(lics);
        } catch (err) {
            console.error("Failed to load settings:", err);
        }
    };

    const showMessage = (msg: string) => {
        setMessage(msg);
        setTimeout(() => setMessage(""), 3000);
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
                        <h1 style={styles.title}>Einstellungen</h1>
                    </div>
                    <div style={{display: "flex", alignItems: "center", gap: 8}}>
                        {message && <span style={styles.message}>{message}</span>}
                        <ThemeToggle/>
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <div style={styles.tabs}>
                {(["app", "plugins", "licenses"] as Tab[]).map((t) => (
                    <button
                        key={t}
                        style={{...styles.tab, ...(tab === t ? styles.tabActive : {})}}
                        onClick={() => setTab(t)}
                    >
                        {t === "app" ? "Allgemein" : t === "plugins" ? "Plugins" : "Lizenzen"}
                    </button>
                ))}
            </div>

            {/* Content */}
            <main style={styles.main}>
                {tab === "app" && (
                    <AppSettings
                        config={appConfig}
                        onSave={async (data) => {
                            setSaving(true);
                            try {
                                const updated = await api.settings.updateApp(data);
                                setAppConfig(updated);
                                showMessage("Gespeichert");
                            } catch (err) {
                                showMessage("Fehler beim Speichern");
                            }
                            setSaving(false);
                        }}
                        saving={saving}
                    />
                )}
                {tab === "plugins" && (
                    <PluginSettings
                        configs={pluginConfigs}
                        appConfig={appConfig}
                        onSavePlugin={async (name, settings) => {
                            try {
                                const updated = await api.settings.updatePlugin(name, settings);
                                setPluginConfigs((prev) => ({...prev, [name]: updated as Record<string, unknown>}));
                                showMessage(`${name} gespeichert`);
                            } catch (err) {
                                showMessage("Fehler beim Speichern");
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
                                showMessage(`${name} ${enable ? "aktiviert" : "deaktiviert"}`);
                            } catch (err) {
                                showMessage("Fehler");
                            }
                        }}
                    />
                )}
                {tab === "licenses" && (
                    <LicenseSettings
                        licenses={licenses}
                        onActivate={async (pluginName, key) => {
                            try {
                                await api.licenses.activate(pluginName, key);
                                const lics = await api.licenses.list();
                                setLicenses(lics);
                                showMessage("Lizenz aktiviert");
                            } catch (err) {
                                showMessage(`Lizenzfehler: ${err}`);
                            }
                        }}
                        onDeactivate={async (pluginName) => {
                            try {
                                await api.licenses.deactivate(pluginName);
                                const lics = await api.licenses.list();
                                setLicenses(lics);
                                showMessage("Lizenz entfernt");
                            } catch (err) {
                                showMessage("Fehler");
                            }
                        }}
                    />
                )}
            </main>
        </div>
    );
}

// --- App Settings Tab ---

function AppSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const app = (config.app || {}) as Record<string, unknown>;
    const ui = (config.ui || {}) as Record<string, unknown>;

    const [lang, setLang] = useState((app.default_language as string) || "de");
    const [uiTitle, setUiTitle] = useState((ui.title as string) || "Bibliogon");
    const [uiSubtitle, setUiSubtitle] = useState((ui.subtitle as string) || "");
    const [theme, setTheme] = useState((ui.theme as string) || "warm-literary");

    useEffect(() => {
        setLang((app.default_language as string) || "de");
        setUiTitle((ui.title as string) || "Bibliogon");
        setUiSubtitle((ui.subtitle as string) || "");
        setTheme((ui.theme as string) || "warm-literary");
    }, [config]);

    return (
        <div style={styles.section}>
            <h2 style={styles.sectionTitle}>App-Einstellungen</h2>
            <div style={styles.card}>
                <div className="field">
                    <label className="label">Standard-Sprache</label>
                    <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
                        <option value="de">Deutsch</option>
                        <option value="en">English</option>
                        <option value="es">Espanol</option>
                        <option value="fr">Francais</option>
                        <option value="el">Ellinika</option>
                    </select>
                </div>
                <div className="field">
                    <label className="label">Titel</label>
                    <input className="input" value={uiTitle} onChange={(e) => setUiTitle(e.target.value)}/>
                </div>
                <div className="field">
                    <label className="label">Untertitel</label>
                    <input className="input" value={uiSubtitle} onChange={(e) => setUiSubtitle(e.target.value)}/>
                </div>
                <div className="field">
                    <label className="label">Theme</label>
                    <input className="input" value={theme} onChange={(e) => setTheme(e.target.value)}/>
                </div>
                <button
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => onSave({
                        app: {default_language: lang},
                        ui: {title: uiTitle, subtitle: uiSubtitle, theme},
                    })}
                >
                    <Save size={14}/> Speichern
                </button>
            </div>
        </div>
    );
}

// --- Plugin Settings Tab ---

function PluginSettings({configs, appConfig, onSavePlugin, onTogglePlugin}: {
    configs: Record<string, Record<string, unknown>>;
    appConfig: Record<string, unknown>;
    onSavePlugin: (name: string, settings: Record<string, unknown>) => void;
    onTogglePlugin: (name: string, enable: boolean) => void;
}) {
    const enabled = new Set(
        ((appConfig.plugins as Record<string, unknown>)?.enabled as string[]) || []
    );
    const disabled = new Set(
        ((appConfig.plugins as Record<string, unknown>)?.disabled as string[]) || []
    );

    return (
        <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Plugin-Einstellungen</h2>
            {Object.entries(configs).map(([name, config]) => {
                const pluginMeta = (config.plugin || {}) as Record<string, unknown>;
                const settings = (config.settings || {}) as Record<string, unknown>;
                const displayName = getLocalized(pluginMeta.display_name, name);
                const description = getLocalized(pluginMeta.description, "");
                const isEnabled = enabled.has(name) && !disabled.has(name);

                return (
                    <PluginCard
                        key={name}
                        name={name}
                        displayName={displayName}
                        description={description}
                        version={(pluginMeta.version as string) || ""}
                        license={(pluginMeta.license as string) || "MIT"}
                        enabled={isEnabled}
                        settings={settings}
                        onSave={(s) => onSavePlugin(name, s)}
                        onToggle={(e) => onTogglePlugin(name, e)}
                    />
                );
            })}
            {Object.keys(configs).length === 0 && (
                <p style={{color: "var(--text-muted)"}}>Keine Plugin-Konfigurationen gefunden.</p>
            )}
        </div>
    );
}

function PluginCard({name, displayName, description, version, license, enabled, settings, onSave, onToggle}: {
    name: string;
    displayName: string;
    description: string;
    version: string;
    license: string;
    enabled: boolean;
    settings: Record<string, unknown>;
    onSave: (settings: Record<string, unknown>) => void;
    onToggle: (enable: boolean) => void;
}) {
    const [localSettings, setLocalSettings] = useState(settings);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    const updateSetting = (key: string, value: string | number) => {
        setLocalSettings((prev) => ({...prev, [key]: value}));
    };

    const flatSettings = flattenSettings(localSettings);
    const hasSettings = flatSettings.length > 0;

    return (
        <div style={styles.card}>
            <div style={styles.pluginHeader}>
                <div style={{flex: 1}}>
                    <div style={{display: "flex", alignItems: "center", gap: 8}}>
                        <strong style={{fontSize: "1rem"}}>{displayName}</strong>
                        <span style={styles.badge}>{version}</span>
                        <span style={{...styles.badge, background: license === "MIT" ? "var(--accent-light)" : "rgba(168,162,158,0.15)"}}>
                            {license}
                        </span>
                    </div>
                    {description && <p style={{color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4}}>{description}</p>}
                </div>
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                    {hasSettings && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(!expanded)}>
                            {expanded ? "Zuklappen" : "Einstellungen"}
                        </button>
                    )}
                    <button
                        className={`btn btn-sm ${enabled ? "btn-danger" : "btn-primary"}`}
                        onClick={() => onToggle(!enabled)}
                    >
                        {enabled ? <><X size={12}/> Deaktivieren</> : <><Check size={12}/> Aktivieren</>}
                    </button>
                </div>
            </div>

            {expanded && hasSettings && (
                <div style={styles.settingsGrid}>
                    {flatSettings.map(([key, value]) => (
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
                    <button className="btn btn-primary btn-sm" onClick={() => onSave(localSettings)}>
                        <Save size={12}/> Speichern
                    </button>
                </div>
            )}
        </div>
    );
}

// --- License Settings Tab ---

function LicenseSettings({licenses, onActivate, onDeactivate}: {
    licenses: Record<string, unknown>;
    onActivate: (pluginName: string, key: string) => void;
    onDeactivate: (pluginName: string) => void;
}) {
    const [pluginName, setPluginName] = useState("");
    const [licenseKey, setLicenseKey] = useState("");

    return (
        <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Lizenzen</h2>

            {/* Activate new license */}
            <div style={styles.card}>
                <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 12}}>Lizenz aktivieren</h3>
                <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                    <input
                        className="input"
                        placeholder="Plugin-Name (z.B. kinderbuch)"
                        value={pluginName}
                        onChange={(e) => setPluginName(e.target.value)}
                        style={{flex: "1 1 200px"}}
                    />
                    <input
                        className="input"
                        placeholder="Lizenzschluessel"
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
                        <Key size={14}/> Aktivieren
                    </button>
                </div>
            </div>

            {/* Active licenses */}
            {Object.keys(licenses).length > 0 && (
                <div style={styles.card}>
                    <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 12}}>Aktive Lizenzen</h3>
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
                                        {valid ? "Gueltig" : "Ungueltig"}
                                    </span>
                                    {typeof lic.expires === "string" && (
                                        <span style={{color: "var(--text-muted)", fontSize: "0.8125rem", marginLeft: 8}}>
                                            {lic.expires === "lifetime" ? "Unbegrenzt" : `bis ${lic.expires}`}
                                        </span>
                                    )}
                                    {typeof lic.error === "string" && (
                                        <span style={{color: "var(--danger)", fontSize: "0.8125rem", marginLeft: 8}}>
                                            {lic.error}
                                        </span>
                                    )}
                                </div>
                                <button className="btn btn-danger btn-sm" onClick={() => onDeactivate(name)}>
                                    Entfernen
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {Object.keys(licenses).length === 0 && (
                <p style={{color: "var(--text-muted)", marginTop: 12}}>Keine Lizenzen aktiviert.</p>
            )}
        </div>
    );
}

// --- Helpers ---

function getLocalized(value: unknown, fallback: string): string {
    if (!value) return fallback;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
        const obj = value as Record<string, string>;
        return obj.de || obj.en || Object.values(obj)[0] || fallback;
    }
    return fallback;
}

function flattenSettings(obj: Record<string, unknown>, prefix = ""): [string, unknown][] {
    const result: [string, unknown][] = [];
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            result.push(...flattenSettings(value as Record<string, unknown>, fullKey));
        } else if (!Array.isArray(value)) {
            result.push([fullKey, value]);
        }
    }
    return result;
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
    tabs: {
        maxWidth: 900, margin: "0 auto", padding: "0 24px",
        display: "flex", gap: 0, borderBottom: "1px solid var(--border)",
    },
    tab: {
        padding: "12px 20px", background: "none", border: "none", borderBottom: "2px solid transparent",
        cursor: "pointer", fontSize: "0.875rem", fontWeight: 500,
        fontFamily: "var(--font-body)", color: "var(--text-muted)", transition: "all 150ms",
    },
    tabActive: {
        color: "var(--accent)", borderBottomColor: "var(--accent)",
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
        marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)",
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12,
    },
    licenseRow: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 0", borderBottom: "1px solid var(--border)",
    },
};
