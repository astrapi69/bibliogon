import {useEffect, useState} from "react";
import {Check, Plus, Upload} from "lucide-react";
import {api} from "../../api/client";
import {useDialog} from "../AppDialog";
import {useI18n} from "../../hooks/useI18n";
import {notify} from "../../utils/notify";
import styles from "../../pages/Settings.module.css";
import {PluginCard} from "./PluginCard";
import {getLocalized} from "./utils";

export function PluginSettings({configs, appConfig, onSavePlugin, onTogglePlugin, onAddPlugin, onRemovePlugin, onReload}: {
    configs: Record<string, Record<string, unknown>>;
    appConfig: Record<string, unknown>;
    onSavePlugin: (name: string, settings: Record<string, unknown>) => void;
    onTogglePlugin: (name: string, enable: boolean) => void;
    onAddPlugin: (data: {name: string; display_name?: string; description?: string}) => void;
    onRemovePlugin: (name: string) => void;
    onReload: () => void;
}) {
    const {t, lang} = useI18n();
    const [showAdd, setShowAdd] = useState(false);
    const [uploading, setUploading] = useState(false);
    const pluginDialog = useDialog();
    // onAddPlugin is wired through the prop chain for future use (no
    // inline create-plugin form is rendered today).
    void onAddPlugin;

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

    // Inactive plugins: only show plugins that are NOT active core plugins
    const [loadedPlugins, setLoadedPlugins] = useState<Set<string>>(new Set());
    // V060: per-plugin filter_reason + load_error_message for the
    // status badge on each PluginCard (sourced from PluginForge's
    // last DiscoveryResult via /api/settings/plugins/discovered).
    const [pluginStates, setPluginStates] = useState<Record<string, {filterReason: string | null; loadErrorMessage: string | null}>>({});
    useEffect(() => {
        api.settings.discoveredPlugins().then((discovered) => {
            setLoadedPlugins(new Set(discovered.filter((p) => p.loaded).map((p) => p.name)));
            const states: Record<string, {filterReason: string | null; loadErrorMessage: string | null}> = {};
            for (const p of discovered) {
                states[p.name] = {
                    filterReason: p.filter_reason,
                    loadErrorMessage: p.load_error_message,
                };
            }
            setPluginStates(states);
        }).catch(() => {});
    }, [configs]);

    const inactivePlugins = Object.entries(configs)
        .filter(([name]) => {
            // Not currently enabled
            if (enabled.has(name) && !disabled.has(name)) return false;
            // Show if loaded or ZIP-installed
            return loadedPlugins.has(name) || name.startsWith("installed-");
        });

    const activePlugins = Object.entries(configs)
        .filter(([name]) => enabled.has(name) && !disabled.has(name));

    return (
        <div className={styles.section} data-testid="plugin-settings">
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                <h2 className={styles.sectionTitle}>{t("ui.settings.plugin_settings", "Plugin-Einstellungen")}</h2>
                <div style={{display: "flex", gap: 8}}>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleUploadPlugin}
                        disabled={uploading}
                        data-testid="plugin-install-trigger"
                    >
                        <Upload size={14}/> {uploading ? t("ui.settings.installing", "Installiert...") : t("ui.settings.install_zip", "ZIP installieren")}
                    </button>
                    {inactivePlugins.length > 0 && (
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setShowAdd(!showAdd)}
                            data-testid="plugin-add-trigger"
                        >
                            <Plus size={14}/> {t("ui.settings.add_plugin", "Plugin hinzufügen")}
                        </button>
                    )}
                </div>
            </div>

            {showAdd && inactivePlugins.length > 0 && (
                <div className={styles.card} data-testid="plugin-available-list">
                    <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 12}}>{t("ui.settings.available_plugins", "Verfügbare Plugins")}</h3>
                    <p style={{color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: 12}}>
                        {t("ui.settings.available_plugins_hint", "Diese Plugins sind installiert aber noch nicht aktiviert:")}
                    </p>
                    {inactivePlugins.map(([name, config]) => {
                        const meta = (config.plugin || {}) as Record<string, unknown>;
                        const displayName = getLocalized(meta.display_name, name, lang);
                        const description = getLocalized(meta.description, "", lang);
                        return (
                            <div
                                key={name}
                                data-testid={`plugin-available-row-${name}`}
                                style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "10px 0", borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <div>
                                    <strong>{displayName}</strong>
                                    {description && (
                                        <p style={{color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: 2}}>{description}</p>
                                    )}
                                </div>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => {
                                        onTogglePlugin(name, true);
                                        setShowAdd(false);
                                    }}
                                    data-testid={`plugin-activate-${name}`}
                                >
                                    <Check size={12}/> {t("ui.settings.activate", "Aktivieren")}
                                </button>
                            </div>
                        );
                    })}
                    <div style={{marginTop: 12}}>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowAdd(false)}
                            data-testid="plugin-available-close"
                        >
                            {t("ui.common.close", "Schließen")}
                        </button>
                    </div>
                </div>
            )}

            {activePlugins.map(([name, config]) => {
                const pluginMeta = (config.plugin || {}) as Record<string, unknown>;
                const settings = (config.settings || {}) as Record<string, unknown>;
                const displayName = getLocalized(pluginMeta.display_name, name, lang);
                const description = getLocalized(pluginMeta.description, "", lang);

                return (
                    <PluginCard
                        key={name}
                        name={name}
                        displayName={displayName}
                        description={description}
                        version={(pluginMeta.version as string) || ""}
                        enabled={enabled.has(name) && !disabled.has(name)}
                        settings={settings}
                        filterReason={pluginStates[name]?.filterReason ?? null}
                        loadErrorMessage={pluginStates[name]?.loadErrorMessage ?? null}
                        onSave={(s) => onSavePlugin(name, s)}
                        onToggle={(e) => onTogglePlugin(name, e)}
                        onRemove={async () => {
                            if (await pluginDialog.confirm(t("ui.settings.remove_plugin", "Plugin entfernen"), `"${displayName}" ${t("ui.settings.remove_confirm", "wirklich entfernen? Die Konfiguration wird gelöscht.")}`, "danger")) {
                                onRemovePlugin(name);
                            }
                        }}
                    />
                );
            })}
            {activePlugins.length === 0 && (
                <p className="muted" data-testid="plugin-empty-state">{t("ui.settings.no_active_plugins", "Keine aktiven Plugins. Klicke \"Plugin hinzufügen\" um verfügbare Plugins zu aktivieren.")}</p>
            )}
        </div>
    );
}
