import {useEffect, useState} from "react";
import {Save} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import SshKeySection from "../SshKeySection";
import styles from "../../pages/Settings.module.css";
import {HelpText} from "./HelpText";
import {SectionHeader} from "./SectionHeader";

/**
 * Settings > Erweitert tab — power-user concerns:
 * - SSH keys for Git host authentication (SshKeySection).
 * - White-Label app customisation (rename + opt-out of standard
 *   plugins).
 *
 * Both are advanced surfaces; the tab label "Erweitert" signals
 * that the user has opted in. The Phase 1 Collapsible wrapper
 * around White-Label is dropped here — once the tab itself is
 * the affordance, the extra click adds no value.
 */
export function ErweitertSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const ui = (config.ui || {}) as Record<string, unknown>;
    const pluginsConfig = (config.plugins || {}) as Record<string, unknown>;
    const enabledPlugins = (pluginsConfig.enabled as string[]) || [];

    const [uiTitle, setUiTitle] = useState((ui.title as string) || "Bibliogon");
    const [uiSubtitle, setUiSubtitle] = useState((ui.subtitle as string) || "");
    const [corePlugins, setCorePlugins] = useState<Record<string, boolean>>({
        export: true, help: true, getstarted: true,
    });

    useEffect(() => {
        setUiTitle((ui.title as string) || "Bibliogon");
        setUiSubtitle((ui.subtitle as string) || "");
        setCorePlugins({
            export: enabledPlugins.includes("export"),
            help: enabledPlugins.includes("help"),
            getstarted: enabledPlugins.includes("getstarted"),
        });
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
            ui: {title: uiTitle, subtitle: uiSubtitle},
            plugins: {enabled},
        };
    };

    return (
        <div className={styles.section} data-testid="erweitert-settings">
            <SectionHeader
                title={t("ui.settings.erweitert_title", "Erweitert")}
                description={t("ui.settings.erweitert_description", "SSH-Schlüssel für Git-Sync und White-Label-Konfiguration.")}
            />

            <SshKeySection/>

            <div className={styles.card} data-testid="white-label-card">
                <h3 style={{fontSize: "0.9375rem", fontWeight: 600, marginBottom: 4, marginTop: 0}}>
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
                <HelpText>
                    {t("ui.settings.restart_hint", "Änderungen werden beim nächsten \"Speichern\" übernommen. Neustart erforderlich.")}
                </HelpText>
                <button
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => onSave(buildSaveData())}
                    data-testid="erweitert-settings-save"
                    style={{marginTop: 12}}
                >
                    <Save size={14}/> {t("ui.common.save", "Speichern")}
                </button>
            </div>
        </div>
    );
}
