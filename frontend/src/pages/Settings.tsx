import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api} from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import {ChevronLeft, Save, Check, X, Key, Plus, Trash2} from "lucide-react";
import OrderedListEditor from "../components/OrderedListEditor";

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
                        onAddPlugin={async (data) => {
                            try {
                                await api.settings.createPlugin(data);
                                const plugins = await api.settings.listPlugins();
                                setPluginConfigs(plugins as Record<string, Record<string, unknown>>);
                                showMessage(`${data.name} hinzugefuegt`);
                            } catch (err) {
                                showMessage(`Fehler: ${err}`);
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
                                showMessage(`${name} entfernt`);
                            } catch (err) {
                                showMessage(`Fehler: ${err}`);
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

function PluginSettings({configs, appConfig, onSavePlugin, onTogglePlugin, onAddPlugin, onRemovePlugin}: {
    configs: Record<string, Record<string, unknown>>;
    appConfig: Record<string, unknown>;
    onSavePlugin: (name: string, settings: Record<string, unknown>) => void;
    onTogglePlugin: (name: string, enable: boolean) => void;
    onAddPlugin: (data: {name: string; display_name?: string; description?: string}) => void;
    onRemovePlugin: (name: string) => void;
}) {
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDisplayName, setNewDisplayName] = useState("");
    const [newDescription, setNewDescription] = useState("");

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

    return (
        <div style={styles.section}>
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                <h2 style={styles.sectionTitle}>Plugin-Einstellungen</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>
                    <Plus size={14}/> Plugin hinzufuegen
                </button>
            </div>

            {showAdd && (
                <div style={styles.card}>
                    <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 12}}>Neues Plugin</h3>
                    <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12}}>
                        <div className="field">
                            <label className="label">Name (eindeutig)</label>
                            <input className="input" placeholder="z.B. my-plugin" value={newName}
                                onChange={(e) => setNewName(e.target.value)}/>
                        </div>
                        <div className="field">
                            <label className="label">Anzeigename</label>
                            <input className="input" placeholder="z.B. Mein Plugin" value={newDisplayName}
                                onChange={(e) => setNewDisplayName(e.target.value)}/>
                        </div>
                    </div>
                    <div className="field">
                        <label className="label">Beschreibung</label>
                        <input className="input" placeholder="Was macht das Plugin?" value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}/>
                    </div>
                    <div style={{display: "flex", gap: 8}}>
                        <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newName.trim()}>
                            <Plus size={12}/> Erstellen
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>
                            Abbrechen
                        </button>
                    </div>
                </div>
            )}

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
                        onRemove={() => {
                            if (confirm(`Plugin "${displayName}" wirklich entfernen? Die Konfiguration wird geloescht.`)) {
                                onRemovePlugin(name);
                            }
                        }}
                    />
                );
            })}
            {Object.keys(configs).length === 0 && (
                <p style={{color: "var(--text-muted)"}}>Keine Plugin-Konfigurationen gefunden.</p>
            )}
        </div>
    );
}

function PluginCard({name, displayName, description, version, license, enabled, settings, onSave, onToggle, onRemove}: {
    name: string;
    displayName: string;
    description: string;
    version: string;
    license: string;
    enabled: boolean;
    settings: Record<string, unknown>;
    onSave: (settings: Record<string, unknown>) => void;
    onToggle: (enable: boolean) => void;
    onRemove: () => void;
}) {
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
                            {isPremium ? "Premium" : "Kostenlos"}
                        </span>
                        <span style={{
                            ...styles.badge,
                            background: enabled ? "rgba(34,197,94,0.12)" : "rgba(168,162,158,0.12)",
                            color: enabled ? "#16a34a" : "var(--text-muted)",
                        }}>
                            {enabled ? "Aktiv" : "Inaktiv"}
                        </span>
                    </div>
                    {description && <p style={{color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4}}>{description}</p>}
                </div>
                <div style={{display: "flex", alignItems: "center", gap: 6, flexShrink: 0}}>
                    {hasSettings && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(!expanded)}>
                            {expanded ? "Zuklappen" : "Einstellungen"}
                        </button>
                    )}
                    <button
                        className={`btn btn-sm ${enabled ? "btn-danger" : "btn-primary"}`}
                        onClick={() => onToggle(!enabled)}
                    >
                        {enabled ? <><X size={12}/> Aus</> : <><Check size={12}/> An</>}
                    </button>
                    <button
                        className="btn btn-sm btn-danger"
                        onClick={onRemove}
                        title="Plugin entfernen"
                        style={{padding: "4px 6px"}}
                    >
                        <Trash2 size={12}/>
                    </button>
                </div>
            </div>

            {expanded && hasSettings && (
                <div style={{marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)"}}>
                    {/* Editable scalar settings */}
                    {scalarSettings.length > 0 && (
                        <>
                            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                                Einstellungen
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
                                <Save size={12}/> Speichern
                            </button>
                        </>
                    )}

                    {/* Editable ordered lists (section_order, skip files) */}
                    {orderedListSettings.length > 0 && (
                        <div style={{marginTop: scalarSettings.length > 0 ? 16 : 0}}>
                            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                                Reihenfolge und Listen
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
                                <Save size={12}/> Reihenfolge speichern
                            </button>
                        </div>
                    )}

                    {/* Read-only complex settings */}
                    {complexSettings.length > 0 && (
                        <div style={{marginTop: (scalarSettings.length > 0 || orderedListSettings.length > 0) ? 16 : 0}}>
                            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                                Konfiguration (nur lesen)
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
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12,
    },
    licenseRow: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 0", borderBottom: "1px solid var(--border)",
    },
};
