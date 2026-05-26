import {useEffect, useState} from "react";
import {useLocation, useNavigate, useSearchParams} from "react-router-dom";
import {api} from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import {ChevronLeft, Check, Home, Menu} from "lucide-react";
import {notify} from "../utils/notify";
import * as Tabs from "@radix-ui/react-tabs";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {useI18n} from "../hooks/useI18n";
import SupportSection, {getDonationsConfig} from "../components/SupportSection";
import CommentsAdminSection from "../components/CommentsAdminSection";
import {ErscheinungsbildSettings} from "../components/settings/ErscheinungsbildSettings";
import {VerhaltenSettings} from "../components/settings/VerhaltenSettings";
import {EditorSettings} from "../components/settings/EditorSettings";
import {ErweitertSettings} from "../components/settings/ErweitertSettings";
import {AiAssistantSettings} from "../components/settings/AiAssistantSettings";
import {AutorenSettings} from "../components/settings/AutorenSettings";
import {TopicsSettings} from "../components/settings/TopicsSettings";
import {PluginSettings} from "../components/settings/PluginSettings";
import {AboutSettings} from "../components/settings/AboutSettings";
import {BackupsSettings} from "../components/settings/BackupsSettings";
import {DangerZoneSettings} from "../components/settings/DangerZoneSettings";
import styles from "./Settings.module.css";

const VALID_SETTINGS_TABS = ["erscheinungsbild", "verhalten", "editor", "ai", "autoren", "topics", "plugins", "comments", "backups", "support", "about", "erweitert", "danger_zone"] as const;
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
    const {setLang: setGlobalLang} = useI18n();
    const {t} = useI18n();
    const [appConfig, setAppConfig] = useState<Record<string, unknown>>({});
    const [pluginConfigs, setPluginConfigs] = useState<Record<string, Record<string, unknown>>>({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    // Deep-link tab via ?tab=autoren. Falls back to "erscheinungsbild"
    // for unknown values so a stale URL never lands on an invalid
    // Radix tab. Phase 2 removed the legacy "app" / "Allgemein" tab;
    // the three replacement tabs (erscheinungsbild + verhalten +
    // erweitert) split its content. Authors-consolidation
    // additionally redirects ?tab=author + ?tab=authors_database
    // → autoren via LEGACY_TAB_REDIRECTS.
    const rawTab = searchParams.get("tab");
    const redirected = rawTab && rawTab in LEGACY_TAB_REDIRECTS ? LEGACY_TAB_REDIRECTS[rawTab] : null;
    const initialTab: SettingsTab = redirected
        ?? (isSettingsTab(rawTab) ? (rawTab as SettingsTab) : "erscheinungsbild");
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
                        <button
                            className={styles.backBtn}
                            onClick={handleBack}
                            data-testid="settings-nav-back"
                            aria-label={t("ui.dashboard.back", "Zurück")}
                        >
                            <ChevronLeft size={18}/>
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
                    const tabDefs: {value: SettingsTab; label: string; testId: string}[] = [
                        {value: "erscheinungsbild", label: t("ui.settings.tab_erscheinungsbild", "Erscheinungsbild"), testId: "settings-tab-erscheinungsbild"},
                        {value: "verhalten", label: t("ui.settings.tab_verhalten", "Verhalten"), testId: "settings-tab-verhalten"},
                        {value: "editor", label: t("ui.settings.tab_editor", "Editor"), testId: "settings-tab-editor"},
                        {value: "ai", label: t("ui.settings.tab_ai", "KI-Assistent"), testId: "settings-tab-ai"},
                        {value: "autoren", label: t("ui.settings.tab_autoren", "Autoren"), testId: "settings-tab-autoren"},
                        {value: "topics", label: t("ui.settings.tab_topics", "Themen"), testId: "settings-tab-topics"},
                        {value: "plugins", label: t("ui.settings.tab_plugins", "Plugins"), testId: "settings-tab-plugins"},
                        {value: "comments", label: t("ui.settings.tab_comments", "Kommentare"), testId: "settings-tab-comments"},
                        {value: "backups", label: t("ui.settings.tab_backups", "Backups"), testId: "settings-tab-backups"},
                        ...(getDonationsConfig(appConfig)
                            ? [{value: "support" as SettingsTab, label: t("ui.donations.tab", "Unterstützen"), testId: "settings-tab-support"}]
                            : []),
                        {value: "about", label: t("ui.settings.tab_about", "Über"), testId: "settings-tab-about"},
                        {value: "erweitert", label: t("ui.settings.tab_erweitert", "Erweitert"), testId: "settings-tab-erweitert"},
                        {value: "danger_zone", label: t("ui.settings.tab_danger_zone", "Gefahrenzone"), testId: "settings-tab-danger-zone"},
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
                                                    data-testid={`${d.testId}-mobile`}
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

            <main id="main-content" className={styles.main}>
                <Tabs.Content value="erscheinungsbild">
                    <ErscheinungsbildSettings
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
                <Tabs.Content value="verhalten">
                    <VerhaltenSettings
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
                <Tabs.Content value="editor">
                    <EditorSettings
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
                <Tabs.Content value="autoren">
                    <AutorenSettings
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
                <Tabs.Content value="backups">
                    <BackupsSettings />
                </Tabs.Content>
                {getDonationsConfig(appConfig) ? (
                    <Tabs.Content value="support">
                        <SupportSection config={getDonationsConfig(appConfig)!} />
                    </Tabs.Content>
                ) : null}
                <Tabs.Content value="about">
                    <AboutSettings appConfig={appConfig} />
                </Tabs.Content>
                <Tabs.Content value="erweitert">
                    <ErweitertSettings
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
                <Tabs.Content value="danger_zone">
                    <DangerZoneSettings />
                </Tabs.Content>
            </main>
            </Tabs.Root>
        </div>
    );
}
