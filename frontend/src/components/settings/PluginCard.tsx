import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {Save, Check, X, Trash2, Upload} from "lucide-react";
import OrderedListEditor from "../OrderedListEditor";
import {useI18n} from "../../hooks/useI18n";
import styles from "../../pages/Settings.module.css";
import {AudiobookSettingsPanel} from "./panels/AudiobookSettingsPanel";
import {TranslationSettingsPanel} from "./panels/TranslationSettingsPanel";
import {ScalarSettingField} from "./fields/ScalarSettingField";
import {ComplexSettingField} from "./fields/ComplexSettingField";
import {isSectionOrder} from "./utils";

const CORE_PLUGINS = new Set(["export", "help", "getstarted", "ms-tools"]);

/** PluginForge v0.6.0 FilterReason → settings.plugin_status_* i18n
 *  key. Bibliogon maps the application-agnostic
 *  ``pre_activate_rejected`` to ``license_check_failed`` because
 *  that's the only consumer of the pre_activate hook in
 *  Bibliogon today (per ``app.main._check_license``). */
const FILTER_REASON_TO_I18N: Record<string, string> = {
    not_discovered: "ui.settings.plugin_status_not_discovered",
    not_enabled: "ui.settings.plugin_status_not_enabled",
    disabled: "ui.settings.plugin_status_disabled",
    incompatible_api_version: "ui.settings.plugin_status_incompatible_api_version",
    incompatible_app_version: "ui.settings.plugin_status_incompatible_app_version",
    dependency_unmet: "ui.settings.plugin_status_dependency_unmet",
    pre_activate_rejected: "ui.settings.plugin_status_license_check_failed",
    load_failed: "ui.settings.plugin_status_load_failed",
    wrong_application: "ui.settings.plugin_status_wrong_application",
};

export function PluginCard({name, displayName, description, version, enabled, settings, filterReason, loadErrorMessage, onSave, onToggle, onRemove}: {
    name: string;
    displayName: string;
    description: string;
    version: string;
    enabled: boolean;
    settings: Record<string, unknown>;
    /** PluginForge v0.6.0 FilterReason for non-activated plugins.
     *  Null when the plugin activated cleanly. Drives the status
     *  badge rendering. */
    filterReason?: string | null;
    /** PluginForge v0.6.0 ``PluginError.user_facing_message`` for
     *  load failures. Renders below the description when set so
     *  the user can act (rebuild container, fix YAML, etc.). */
    loadErrorMessage?: string | null;
    onSave: (settings: Record<string, unknown>) => void;
    onToggle: (enable: boolean) => void;
    onRemove: () => void;
}) {
    const {t} = useI18n();
    const navigate = useNavigate();
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
        <div
            className={styles.card}
            data-testid={`plugin-row-${name}`}
            style={{
                borderLeft: enabled ? "3px solid var(--accent)" : "3px solid transparent",
                opacity: enabled ? 1 : 0.75,
            }}
        >
            <div className={styles.pluginHeader}>
                <div style={{flex: 1}}>
                    <div style={{display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap"}}>
                        <strong style={{fontSize: "1rem"}} data-testid={`plugin-name-${name}`}>{displayName}</strong>
                        <span className={styles.badge}>v{version}</span>
                        <span className={styles.badge} style={{
                            background: "var(--accent-light)",
                            color: "var(--accent)",
                        }}>
                            {t("ui.settings.free", "Kostenlos")}
                        </span>
                        <span className={styles.badge} style={{
                            background: enabled ? "rgba(34,197,94,0.12)" : "rgba(168,162,158,0.12)",
                            color: enabled ? "#16a34a" : "var(--text-muted)",
                        }}>
                            {enabled ? t("ui.settings.active", "Aktiv") : t("ui.settings.inactive", "Inaktiv")}
                        </span>
                        {filterReason && FILTER_REASON_TO_I18N[filterReason] && (
                            <span
                                className={styles.badge}
                                data-testid={`plugin-status-${name}`}
                                style={{
                                    background: "rgba(239,68,68,0.12)",
                                    color: "#dc2626",
                                }}
                            >
                                {t(FILTER_REASON_TO_I18N[filterReason], filterReason)}
                            </span>
                        )}
                        {isCore && (
                            <span className={styles.badge} style={{
                                background: "rgba(59,130,246,0.12)",
                                color: "#2563eb",
                            }}>
                                {t("ui.settings.standard", "Standard")}
                            </span>
                        )}
                    </div>
                    {description && <p style={{color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4}}>{description}</p>}
                    {loadErrorMessage && (
                        <p
                            data-testid={`plugin-status-detail-${name}`}
                            style={{color: "#dc2626", fontSize: "0.8125rem", marginTop: 4}}
                        >
                            {loadErrorMessage}
                        </p>
                    )}
                </div>
                <div style={{display: "flex", alignItems: "center", gap: 6, flexShrink: 0}}>
                    {hasSettings && (
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setExpanded(!expanded)}
                            data-testid={`plugin-expand-${name}`}
                        >
                            {expanded ? t("ui.settings.collapse", "Zuklappen") : t("ui.settings.expand_settings", "Einstellungen")}
                        </button>
                    )}
                    {!isCore && (
                        <button
                            className={`btn btn-sm ${enabled ? "btn-danger" : "btn-primary"}`}
                            onClick={() => onToggle(!enabled)}
                            data-testid={`plugin-toggle-${name}`}
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
                            data-testid={`plugin-remove-${name}`}
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
                    ) : name === "medium-import" ? (
                        <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                            <p style={{fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0}}>
                                {t(
                                    "ui.medium_import.settings.pointer_hint",
                                    "Einstellungen und Importe werden auf der dedizierten Medium-Import-Seite verwaltet.",
                                )}
                            </p>
                            <div>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => navigate("/articles/import/medium")}
                                    data-testid="settings-medium-import-pointer"
                                >
                                    <Upload size={12} />{" "}
                                    {t(
                                        "ui.medium_import.settings.pointer_button",
                                        "Medium-Import öffnen",
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : scalarSettings.length > 0 && (
                        <>
                            <h4 style={{fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 8}}>
                                {t("ui.settings.expand_settings", "Einstellungen")}
                            </h4>
                            <div className={styles.settingsGrid}>
                                {scalarSettings.map(([key, value]) => (
                                    <ScalarSettingField
                                        key={key}
                                        settingKey={key}
                                        value={value}
                                        onChange={(v) => updateSetting(key, v)}
                                    />
                                ))}
                            </div>
                            <button
                                className="btn btn-primary btn-sm mt-1"
                                onClick={() => onSave(localSettings)}
                                data-testid={`plugin-save-${name}`}
                            >
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
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => onSave(localSettings)}
                                data-testid={`plugin-save-orderedlist-${name}`}
                            >
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
                            <button
                                className="btn btn-primary btn-sm mt-1"
                                onClick={() => onSave(localSettings)}
                                data-testid={`plugin-save-complex-${name}`}
                            >
                                <Save size={12}/> {t("ui.common.save", "Speichern")}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
