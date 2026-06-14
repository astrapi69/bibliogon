import {useI18n} from "../../hooks/useI18n";
import SshKeySection from "../SshKeySection";
import styles from "../../pages/Settings.module.css";
import {SectionHeader} from "./SectionHeader";

/**
 * Settings > Erweitert tab — power-user concerns.
 *
 * Hosts the SSH-key management for Git host authentication
 * (SshKeySection). The former White-Label app-customisation surface
 * was removed (#150): Bibliogon is an open-source self-publishing
 * tool, not a white-label product, so the custom app-name / subtitle
 * / core-plugin-opt-out controls had no use case.
 */
export function ErweitertSettings() {
    const {t} = useI18n();

    return (
        <div className={styles.section} data-testid="erweitert-settings">
            <SectionHeader
                title={t("ui.settings.erweitert_title", "Erweitert")}
                description={t(
                    "ui.settings.erweitert_description",
                    "SSH-Schlüssel für die Git-Host-Authentifizierung.",
                )}
            />

            <SshKeySection/>
        </div>
    );
}
