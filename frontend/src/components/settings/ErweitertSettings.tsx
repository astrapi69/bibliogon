import { useEffect, useState } from "react";
import { useI18n } from "../../hooks/useI18n";
import SshKeySection from "./SshKeySection";
import styles from "../../pages/Settings.module.css";
import { SectionHeader } from "./SectionHeader";
import { HelpText } from "./HelpText";
import { useSettingsAutoSave } from "./useSettingsAutoSave";
import { DEFAULT_MAX_UPLOAD_MB, resolveMaxUploadMb } from "../../utils/platform/uploadLimit";

/**
 * Settings > Erweitert tab — power-user concerns.
 *
 * Hosts the SSH-key management for Git host authentication
 * (SshKeySection). The former White-Label app-customisation surface
 * was removed (#150): Bibliogon is an open-source self-publishing
 * tool, not a white-label product, so the custom app-name / subtitle
 * / core-plugin-opt-out controls had no use case.
 */
export function ErweitertSettings({
    config,
    onSave,
}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void | Promise<void>;
    saving: boolean;
}) {
    const { t } = useI18n();
    const app = (config.app || {}) as Record<string, unknown>;
    const [maxUploadMb, setMaxUploadMb] = useState<string>(
        String(app.max_upload_mb ?? DEFAULT_MAX_UPLOAD_MB),
    );

    useEffect(() => {
        const resolved = resolveMaxUploadMb(config);
        setMaxUploadMb(String(resolved ?? 0));
    }, [config]);

    const buildSaveData = () => {
        const parsed = Number(maxUploadMb);
        const next = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : DEFAULT_MAX_UPLOAD_MB;
        return {
            app: {
                max_upload_mb: next,
            },
        };
    };

    const triggerSave = useSettingsAutoSave(buildSaveData, onSave);

    return (
        <div className={styles.section} data-testid="erweitert-settings">
            <SectionHeader
                title={t("ui.settings.erweitert_title", "Erweitert")}
                description={t(
                    "ui.settings.erweitert_description",
                    "SSH-Schlüssel und Upload-Limits für große Importe.",
                )}
            />

            <div className={styles.card} data-testid="settings-upload-limit">
                <div className="field">
                    <label className="label">
                        {t("ui.settings.upload_limit_label", "Max. Upload (MB)")}
                    </label>
                    <input
                        className="input"
                        type="number"
                        min="0"
                        step="50"
                        data-testid="settings-upload-limit-input"
                        value={maxUploadMb}
                        onChange={(e) => {
                            setMaxUploadMb(e.target.value);
                            if (e.target.value.trim() === "") return;
                            triggerSave();
                        }}
                    />
                    <HelpText>
                        {t(
                            "ui.settings.upload_limit_hint",
                            "0 = unbegrenzt. Greift für Backup-Import, ZIP-Import, Plugin-Install und Uploads.",
                        )}
                    </HelpText>
                    <HelpText>
                        {t(
                            "ui.settings.upload_limit_restart",
                            "Änderungen benötigen einen Neustart der Desktop-App.",
                        )}
                    </HelpText>
                </div>
            </div>

            <SshKeySection />
        </div>
    );
}
