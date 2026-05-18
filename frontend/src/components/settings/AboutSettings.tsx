/**
 * Settings > About tab — Bibliogon's About-Dialog surface.
 *
 * Per the 2026-05-18 audit (D1.A + D4.A + D5.A), the About panel
 * lives as the 9th Settings tab. Fetches /api/system/info on
 * mount + reuses appConfig (passed by the Settings parent) for
 * the donations config. Plugin list is rendered from
 * /api/settings/plugins/discovered's extended payload.
 *
 * C2 ships the SKELETON only (fetch + loading state + error
 * state). C3 and C4 populate the actual section content
 * (Version + System-Info + Credits and then Plugin-List +
 * Donation-Channels).
 */

import {useEffect, useState} from "react";
import {api, ApiError, type SystemInfo} from "../../api/client";
import {useI18n} from "../../hooks/useI18n";

interface Props {
    appConfig: Record<string, unknown>;
}

export function AboutSettings({appConfig: _appConfig}: Props) {
    const {t} = useI18n();
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        api.system
            .info()
            .then((info) => {
                if (cancelled) return;
                setSystemInfo(info);
                setLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
                setError(detail);
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <section
            data-testid="about-settings-root"
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 20,
                maxWidth: 720,
            }}
        >
            <h2 style={{margin: 0}}>
                {t("ui.about.heading", "Über Bibliogon")}
            </h2>

            {loading && (
                <div
                    data-testid="about-settings-loading"
                    style={{color: "var(--text-muted)"}}
                >
                    {t("ui.about.loading", "Lade Informationen ...")}
                </div>
            )}

            {error && (
                <div
                    data-testid="about-settings-error"
                    role="alert"
                    style={{color: "var(--danger, #c00)"}}
                >
                    {t("ui.about.load_failed", "Informationen konnten nicht geladen werden:")}{" "}
                    {error}
                </div>
            )}

            {!loading && !error && systemInfo && (
                <div
                    data-testid="about-settings-content"
                    style={{display: "flex", flexDirection: "column", gap: 20}}
                >
                    {/* C3: Version + Build-Info + Credits + System-Info sections */}
                    {/* C4: Plugin-List + Donation-Channels sections */}
                    <p style={{color: "var(--text-muted)"}}>
                        {t(
                            "ui.about.skeleton_placeholder",
                            "Bibliogon",
                        )}{" "}
                        v{systemInfo.app.version}
                    </p>
                </div>
            )}
        </section>
    );
}
