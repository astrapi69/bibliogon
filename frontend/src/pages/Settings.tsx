import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { getStorage } from "../storage";
import FullscreenButton from "../components/FullscreenButton";
import ThemeToggle from "../components/ThemeToggle";
import { ChevronLeft, Home } from "lucide-react";
import { notify } from "../utils/notify";
import { useI18n } from "../hooks/useI18n";
import SupportSection, { getDonationsConfig } from "../components/SupportSection";
import CommentsAdminSection from "../components/CommentsAdminSection";
import { ErscheinungsbildSettings } from "../components/settings/ErscheinungsbildSettings";
import { VerhaltenSettings } from "../components/settings/VerhaltenSettings";
import { EditorSettings } from "../components/settings/EditorSettings";
import { ErweitertSettings } from "../components/settings/ErweitertSettings";
import { AiAssistantSettings } from "../components/settings/AiAssistantSettings";
import { AI_CONFIG_CHANGED_EVENT } from "../features/useHasAiKey";
import { AutorenSettings } from "../components/settings/AutorenSettings";
import { TopicsSettings } from "../components/settings/TopicsSettings";
import { PluginSettings } from "../components/settings/PluginSettings";
import { AboutSettings } from "../components/settings/AboutSettings";
import { BackupsSettings } from "../components/settings/BackupsSettings";
import { DangerZoneSettings } from "../components/settings/DangerZoneSettings";
import { SettingsSidebar, type SidebarGroup } from "../components/settings/SettingsSidebar";
import { SettingsMobileMenu } from "../components/settings/SettingsMobileMenu";
import styles from "./Settings.module.css";

const VALID_SETTINGS_TABS = [
    "erscheinungsbild",
    "verhalten",
    "editor",
    "ai",
    "autoren",
    "topics",
    "plugins",
    "comments",
    "backups",
    "support",
    "about",
    "erweitert",
    "danger_zone",
] as const;
type SettingsTab = (typeof VALID_SETTINGS_TABS)[number];

function isSettingsTab(value: string | null): value is SettingsTab {
    return value !== null && (VALID_SETTINGS_TABS as readonly string[]).includes(value);
}

// SETT-AUTHORS-TAB-CONSOLIDATION-01: the legacy "author" +
// "authors_database" tabs merged into a single "autoren" tab.
// Keep old deep-link URLs working by redirecting them at parse
// time so bookmarks + the help-docs "?tab=author" links land on
// the right surface.
const LEGACY_TAB_REDIRECTS: Record<string, SettingsTab> = {
    author: "autoren",
    authors_database: "autoren",
};

export default function Settings() {
    const navigate = useNavigate();
    const location = useLocation();
    // ``location.key`` is the react-router v6/v7 sentinel for "this
    // is the first entry in the app's history stack" - it equals
    // "default" until a programmatic navigation runs. When the user
    // reached Settings via a direct URL (deep link, bookmark,
    // refresh), navigate(-1) would leave the app entirely; fall back
    // to the Books-Dashboard root in that case.
    const handleBack = () => {
        if (location.key === "default") {
            navigate("/");
        } else {
            navigate(-1);
        }
    };
    const [searchParams, setSearchParams] = useSearchParams();
    const { setLang: setGlobalLang } = useI18n();
    const { t } = useI18n();
    const [appConfig, setAppConfig] = useState<Record<string, unknown>>({});
    // Gate the settings forms on the FIRST app-config load. The forms
    // hydrate their local state from `config`; rendering them before the
    // async getApp resolves means a fast edit can be clobbered when the
    // real config arrives (the systemic settings-save flake). Holding the
    // form area until loaded closes that window for every form at once.
    const [appLoaded, setAppLoaded] = useState(false);
    const [pluginConfigs, setPluginConfigs] = useState<Record<string, Record<string, unknown>>>({});
    const [saving, setSaving] = useState(false);

    // Deep-link tab via ?tab=autoren. Falls back to "erscheinungsbild"
    // for unknown values so a stale URL never lands on an invalid
    // section. Phase 2 removed the legacy "app" / "Allgemein" tab;
    // the three replacement tabs (erscheinungsbild + verhalten +
    // erweitert) split its content. Authors-consolidation
    // additionally redirects ?tab=author + ?tab=authors_database
    // → autoren via LEGACY_TAB_REDIRECTS.
    const rawTab = searchParams.get("tab");
    const redirected =
        rawTab && rawTab in LEGACY_TAB_REDIRECTS ? LEGACY_TAB_REDIRECTS[rawTab] : null;
    const initialTab: SettingsTab =
        redirected ?? (isSettingsTab(rawTab) ? (rawTab as SettingsTab) : "erscheinungsbild");
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

    const handleTabChange = (next: string) => {
        if (!isSettingsTab(next)) return;
        setActiveTab(next);
        // Mirror the active tab back into the URL so reload + back-
        // button keep state. ``replace`` avoids polluting history
        // with one entry per tab click.
        const params = new URLSearchParams(searchParams);
        params.set("tab", next);
        setSearchParams(params, { replace: true });
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        // Load each independently so one failure doesn't block the rest
        try {
            const app = await getStorage().settings.getApp();
            setAppConfig(app);
        } catch (err) {
            console.error("Failed to load app settings:", err);
        }
        // Render the forms now (with the loaded config, or with defaults
        // if the load failed — better degraded than hung).
        setAppLoaded(true);
        if (getStorage().mode === "dexie") return;
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

    // Sidebar groups + the legacy flat tabDefs share the same item
    // definitions so testids + labels stay in lock-step. The mobile
    // dropdown reuses the flat list; C2 will refine the mobile UX.
    const hasDonations = Boolean(getDonationsConfig(appConfig));
    // White-Label feature flag (features.white_label in app.yaml).
    // Defaults to false so the "Erweitert" tab stays hidden for the
    // typical author user; power users flip the flag in YAML to
    // surface the SSH-key + white-label customisation panels.
    const hasWhiteLabel = Boolean(
        (appConfig.features as Record<string, unknown> | undefined)?.white_label,
    );

    // White-Label gate: a stale deep-link like ?tab=erweitert lands on
    // an empty panel when the flag is off. Redirect to the default
    // tab once appConfig has loaded and confirms the flag is false.
    useEffect(() => {
        if (activeTab === "erweitert" && !hasWhiteLabel) {
            handleTabChange("erscheinungsbild");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, hasWhiteLabel]);
    const sidebarGroups: SidebarGroup[] = useMemo(() => {
        const groups: SidebarGroup[] = [
            {
                key: "darstellung",
                label: t("ui.settings.group_darstellung", "Darstellung"),
                items: [
                    {
                        value: "erscheinungsbild",
                        label: t("ui.settings.tab_erscheinungsbild", "Erscheinungsbild"),
                        testId: "settings-tab-erscheinungsbild",
                    },
                    {
                        value: "verhalten",
                        label: t("ui.settings.tab_verhalten", "Verhalten"),
                        testId: "settings-tab-verhalten",
                    },
                    {
                        value: "editor",
                        label: t("ui.settings.tab_editor", "Editor"),
                        testId: "settings-tab-editor",
                    },
                ],
            },
            {
                key: "inhalt",
                label: t("ui.settings.group_inhalt", "Inhalt"),
                items: [
                    {
                        value: "ai",
                        label: t("ui.settings.tab_ai", "KI-Assistent"),
                        testId: "settings-tab-ai",
                    },
                    {
                        value: "autoren",
                        label: t("ui.settings.tab_autoren", "Autoren"),
                        testId: "settings-tab-autoren",
                    },
                    {
                        value: "topics",
                        label: t("ui.settings.tab_topics", "Themen"),
                        testId: "settings-tab-topics",
                    },
                ],
            },
            {
                key: "system",
                label: t("ui.settings.group_system", "System"),
                items: [
                    {
                        value: "plugins",
                        label: t("ui.settings.tab_plugins", "Plugins"),
                        testId: "settings-tab-plugins",
                    },
                    {
                        value: "comments",
                        label: t("ui.settings.tab_comments", "Kommentare"),
                        testId: "settings-tab-comments",
                    },
                    {
                        value: "backups",
                        label: t("ui.settings.tab_backups", "Backups"),
                        testId: "settings-tab-backups",
                    },
                    ...(hasWhiteLabel
                        ? [
                              {
                                  value: "erweitert",
                                  label: t("ui.settings.tab_erweitert", "Erweitert"),
                                  testId: "settings-tab-erweitert",
                              },
                          ]
                        : []),
                ],
            },
            {
                key: "info",
                label: t("ui.settings.group_info", "Info"),
                items: [
                    {
                        value: "about",
                        label: t("ui.settings.tab_about", "Über"),
                        testId: "settings-tab-about",
                    },
                    ...(hasDonations
                        ? [
                              {
                                  value: "support",
                                  label: t("ui.donations.tab", "Unterstützen"),
                                  testId: "settings-tab-support",
                              },
                          ]
                        : []),
                ],
            },
            {
                key: "danger",
                // The single-item Danger Zone group renders only the
                // item (no group header) since the header text would
                // duplicate the item label. ``variant: "danger"``
                // drives the red accent + visual separation.
                variant: "danger",
                items: [
                    {
                        value: "danger_zone",
                        label: t("ui.settings.tab_danger_zone", "Gefahrenzone"),
                        testId: "settings-tab-danger-zone",
                    },
                ],
            },
        ];
        return groups;
    }, [t, hasDonations, hasWhiteLabel]);

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <div className={styles.headerLeft}>
                        <button
                            className={styles.backBtn}
                            onClick={handleBack}
                            data-testid="settings-nav-back"
                            aria-label={t("ui.dashboard.back", "Zurück")}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <h1 className={styles.title}>{t("ui.settings.title", "Einstellungen")}</h1>
                    </div>
                    <div className="icon-row">
                        <button
                            className="btn-icon"
                            onClick={() => navigate("/")}
                            data-testid="settings-nav-home"
                            aria-label={t("ui.dashboard.title", "Dashboard")}
                            title={t("ui.dashboard.title", "Dashboard")}
                        >
                            <Home size={18} />
                        </button>
                        <FullscreenButton testidPrefix="settings" />
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <SettingsMobileMenu
                groups={sidebarGroups}
                activeTab={activeTab}
                onChange={handleTabChange}
            />

            <div className={styles.layout}>
                <div className={styles.sidebarColumn}>
                    <SettingsSidebar
                        groups={sidebarGroups}
                        activeTab={activeTab}
                        onChange={handleTabChange}
                    />
                </div>

                <main id="main-content" className={styles.main}>
                    {!appLoaded ? (
                        <p data-testid="settings-loading">{t("ui.common.loading", "Lädt…")}</p>
                    ) : (
                        <>
                            {activeTab === "erscheinungsbild" && (
                                <ErscheinungsbildSettings
                                    config={appConfig}
                                    onSave={async (data) => {
                                        setSaving(true);
                                        try {
                                            const updated =
                                                await getStorage().settings.updateApp(data);
                                            setAppConfig(updated);
                                            showMessage(t("ui.settings.saved", "Gespeichert"));
                                        } catch (err) {
                                            showMessage(
                                                t(
                                                    "ui.settings.save_error",
                                                    "Fehler beim Speichern",
                                                ),
                                                true,
                                            );
                                        }
                                        setSaving(false);
                                    }}
                                    saving={saving}
                                />
                            )}
                            {activeTab === "verhalten" && (
                                <VerhaltenSettings
                                    config={appConfig}
                                    onSave={async (data) => {
                                        setSaving(true);
                                        try {
                                            const updated =
                                                await getStorage().settings.updateApp(data);
                                            setAppConfig(updated);
                                            // Live language switch without reload
                                            const newLang = (data.app as Record<string, unknown>)
                                                ?.default_language as string;
                                            if (newLang) setGlobalLang(newLang);
                                            showMessage(t("ui.settings.saved", "Gespeichert"));
                                        } catch (err) {
                                            showMessage(
                                                t(
                                                    "ui.settings.save_error",
                                                    "Fehler beim Speichern",
                                                ),
                                                true,
                                            );
                                        }
                                        setSaving(false);
                                    }}
                                    saving={saving}
                                />
                            )}
                            {activeTab === "editor" && (
                                <EditorSettings
                                    config={appConfig}
                                    onSave={async (data) => {
                                        setSaving(true);
                                        try {
                                            const updated =
                                                await getStorage().settings.updateApp(data);
                                            setAppConfig(updated);
                                            showMessage(t("ui.settings.saved", "Gespeichert"));
                                        } catch (err) {
                                            showMessage(
                                                t(
                                                    "ui.settings.save_error",
                                                    "Fehler beim Speichern",
                                                ),
                                                true,
                                            );
                                        }
                                        setSaving(false);
                                    }}
                                    saving={saving}
                                />
                            )}
                            {activeTab === "ai" && (
                                <AiAssistantSettings
                                    config={appConfig}
                                    onSave={async (data) => {
                                        setSaving(true);
                                        try {
                                            const updated =
                                                await getStorage().settings.updateApp(data);
                                            setAppConfig(updated);
                                            window.dispatchEvent(
                                                new Event(AI_CONFIG_CHANGED_EVENT),
                                            );
                                            showMessage(t("ui.settings.saved", "Gespeichert"));
                                        } catch (err) {
                                            showMessage(
                                                t(
                                                    "ui.settings.save_error",
                                                    "Fehler beim Speichern",
                                                ),
                                                true,
                                            );
                                        }
                                        setSaving(false);
                                    }}
                                    saving={saving}
                                />
                            )}
                            {activeTab === "autoren" && (
                                <AutorenSettings
                                    config={appConfig}
                                    onSave={async (data) => {
                                        setSaving(true);
                                        try {
                                            const updated =
                                                await getStorage().settings.updateApp(data);
                                            setAppConfig(updated);
                                            showMessage(
                                                t(
                                                    "ui.settings.author_saved",
                                                    "Autorenprofil gespeichert",
                                                ),
                                            );
                                        } catch {
                                            showMessage(
                                                t(
                                                    "ui.settings.save_error",
                                                    "Fehler beim Speichern",
                                                ),
                                                true,
                                            );
                                        }
                                        setSaving(false);
                                    }}
                                    saving={saving}
                                />
                            )}
                            {activeTab === "topics" && (
                                <TopicsSettings
                                    config={appConfig}
                                    onSave={async (data) => {
                                        setSaving(true);
                                        try {
                                            const updated =
                                                await getStorage().settings.updateApp(data);
                                            setAppConfig(updated);
                                            showMessage(
                                                t("ui.settings.topics_saved", "Themen gespeichert"),
                                            );
                                        } catch {
                                            showMessage(
                                                t(
                                                    "ui.settings.save_error",
                                                    "Fehler beim Speichern",
                                                ),
                                                true,
                                            );
                                        }
                                        setSaving(false);
                                    }}
                                    saving={saving}
                                />
                            )}
                            {activeTab === "plugins" && (
                                <PluginSettings
                                    configs={pluginConfigs}
                                    appConfig={appConfig}
                                    onReload={loadData}
                                    onSavePlugin={async (name, settings) => {
                                        try {
                                            const updated = await api.settings.updatePlugin(
                                                name,
                                                settings,
                                            );
                                            setPluginConfigs((prev) => ({
                                                ...prev,
                                                [name]: updated as Record<string, unknown>,
                                            }));
                                            showMessage(
                                                `${name} ${t("ui.settings.saved", "gespeichert")}`,
                                            );
                                        } catch (err) {
                                            showMessage(
                                                t(
                                                    "ui.settings.save_error",
                                                    "Fehler beim Speichern",
                                                ),
                                                true,
                                            );
                                        }
                                    }}
                                    onTogglePlugin={async (name, enable) => {
                                        try {
                                            if (enable) {
                                                await api.settings.enablePlugin(name);
                                            } else {
                                                await api.settings.disablePlugin(name);
                                            }
                                            const app = await getStorage().settings.getApp();
                                            setAppConfig(app);
                                            showMessage(
                                                `${name} ${enable ? t("ui.settings.active", "aktiviert") : t("ui.settings.inactive", "deaktiviert")}`,
                                            );
                                        } catch (err) {
                                            showMessage(t("ui.common.error", "Fehler"), true);
                                        }
                                    }}
                                    onAddPlugin={async (data) => {
                                        try {
                                            await api.settings.createPlugin(data);
                                            const plugins = await api.settings.listPlugins();
                                            setPluginConfigs(
                                                plugins as Record<string, Record<string, unknown>>,
                                            );
                                            showMessage(`${data.name} hinzugefügt`);
                                        } catch (err) {
                                            showMessage(
                                                `${t("ui.common.error", "Fehler")}: ${err}`,
                                                true,
                                            );
                                        }
                                    }}
                                    onRemovePlugin={async (name) => {
                                        try {
                                            await api.settings.deletePlugin(name);
                                            const [plugins, app] = await Promise.all([
                                                api.settings.listPlugins(),
                                                getStorage().settings.getApp(),
                                            ]);
                                            setPluginConfigs(
                                                plugins as Record<string, Record<string, unknown>>,
                                            );
                                            setAppConfig(app);
                                            showMessage(
                                                `${name} ${t("ui.common.remove", "entfernt")}`,
                                            );
                                        } catch (err) {
                                            showMessage(
                                                `${t("ui.common.error", "Fehler")}: ${err}`,
                                                true,
                                            );
                                        }
                                    }}
                                />
                            )}
                            {activeTab === "comments" && <CommentsAdminSection />}
                            {activeTab === "backups" && <BackupsSettings />}
                            {activeTab === "support" && hasDonations && (
                                <SupportSection config={getDonationsConfig(appConfig)!} />
                            )}
                            {activeTab === "about" && <AboutSettings appConfig={appConfig} />}
                            {activeTab === "erweitert" && hasWhiteLabel && (
                                <ErweitertSettings
                                    config={appConfig}
                                    onSave={async (data) => {
                                        setSaving(true);
                                        try {
                                            const updated =
                                                await getStorage().settings.updateApp(data);
                                            setAppConfig(updated);
                                            showMessage(t("ui.settings.saved", "Gespeichert"));
                                        } catch (err) {
                                            showMessage(
                                                t(
                                                    "ui.settings.save_error",
                                                    "Fehler beim Speichern",
                                                ),
                                                true,
                                            );
                                        }
                                        setSaving(false);
                                    }}
                                    saving={saving}
                                />
                            )}
                            {activeTab === "danger_zone" && <DangerZoneSettings />}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
