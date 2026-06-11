/**
 * Settings > About: LAN-access card (LAN-MODE-PHASE-1 C4b).
 *
 * Renders the current LAN URL + PIN + a scannable QR so an
 * already-connected device can onboard a second one. Fetches
 * /api/lan-auth/info on mount; that endpoint only exists when the
 * backend runs with BIBLIOGON_LAN_MODE, so a 404 (or any error)
 * means "LAN mode is off" and the whole section hides itself.
 *
 * Inline styling mirrors the sibling AboutSettings card so the two
 * read identically inside the About tab.
 */

import { useEffect, useState } from "react";
import { api, type LanAccessInfo } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../../features/featureConfig";
import { SectionHeader } from "./SectionHeader";

const sectionStyle: React.CSSProperties = {
    padding: 16,
    border: "1px solid var(--border, #ddd)",
    borderRadius: 8,
    backgroundColor: "var(--surface-2, #fafafa)",
    marginBottom: 16,
};

const rowStyle: React.CSSProperties = {
    display: "flex",
    gap: 20,
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 12,
};

const dlStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: "6px 16px",
    margin: 0,
    fontSize: "0.95rem",
};

export function LanAccessSettings() {
    const { t } = useI18n();
    const lanMode = useFeature(FEATURES.LAN_MODE);
    const offline = !lanMode.isActive;
    const [info, setInfo] = useState<LanAccessInfo | null>(null);

    useEffect(() => {
        if (offline) return;
        let cancelled = false;
        api.lanAuth
            .info()
            .then((data) => {
                if (!cancelled) setInfo(data);
            })
            .catch(() => {
                // 404 -> LAN mode off; any other error -> nothing to show.
                if (!cancelled) setInfo(null);
            });
        return () => {
            cancelled = true;
        };
    }, [offline]);

    if (lanMode.isHidden || !info) return null;

    return (
        <section style={sectionStyle} data-testid="lan-access-section">
            <SectionHeader
                title={t("ui.lan_access.heading")}
                description={t("ui.lan_access.description")}
                testId="lan-access-header"
            />
            <div style={rowStyle}>
                <img
                    src="/api/lan-auth/qr.svg"
                    alt={t("ui.lan_access.scan_hint")}
                    width={160}
                    height={160}
                    style={{ backgroundColor: "#fff", borderRadius: 8, padding: 8 }}
                    data-testid="lan-access-qr"
                />
                <dl style={dlStyle}>
                    <dt>{t("ui.lan_access.url_label")}</dt>
                    <dd style={{ margin: 0 }} data-testid="lan-access-url">
                        <code>{info.url}</code>
                    </dd>
                    <dt>{t("ui.lan_access.pin_label")}</dt>
                    <dd style={{ margin: 0 }} data-testid="lan-access-pin">
                        <code>{info.pin}</code>
                    </dd>
                </dl>
            </div>
        </section>
    );
}

export default LanAccessSettings;
