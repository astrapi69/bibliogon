/**
 * Settings > About tab — Bibliogon's About-Dialog surface.
 *
 * Per the 2026-05-18 audit (D1.A + D4.A + D5.A), the About panel
 * lives as the 9th Settings tab. Fetches /api/system/info on
 * mount + reuses appConfig (passed by the Settings parent) for
 * the donations config. Plugin list is rendered from
 * /api/settings/plugins/discovered's extended payload.
 *
 * C3 adds the three static-data sections: Version + System-Info +
 * Credits. C4 adds Plugin-List + Donation-Channels. C5 ships the
 * i18n keys across all 8 catalogs.
 */

import {useEffect, useState} from "react";
import {ExternalLink} from "lucide-react";
import {api, ApiError, type DiscoveredPlugin, type SystemInfo} from "../../api/client";
import {useI18n} from "../../hooks/useI18n";
import {getLocalized} from "./utils";
import SupportSection, {getDonationsConfig} from "../SupportSection";

interface Props {
    appConfig: Record<string, unknown>;
}

const sectionStyle: React.CSSProperties = {
    padding: 16,
    border: "1px solid var(--border, #ddd)",
    borderRadius: 8,
    backgroundColor: "var(--surface-2, #fafafa)",
};

const dlStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: "4px 16px",
    fontSize: "0.9rem",
    margin: 0,
};

export function AboutSettings({appConfig}: Props) {
    const {t, lang} = useI18n();
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [plugins, setPlugins] = useState<DiscoveredPlugin[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const donationsConfig = getDonationsConfig(appConfig);

    useEffect(() => {
        let cancelled = false;
        Promise.all([api.system.info(), api.settings.discoveredPlugins()])
            .then(([info, pluginList]) => {
                if (cancelled) return;
                setSystemInfo(info);
                setPlugins(pluginList);
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
                    <VersionSection info={systemInfo} t={t} />
                    <CreditsSection info={systemInfo} t={t} />
                    <PluginListSection plugins={plugins} t={t} lang={lang} />
                    {donationsConfig ? (
                        <article
                            data-testid="about-donations-section"
                            style={sectionStyle}
                        >
                            <SupportSection config={donationsConfig} />
                        </article>
                    ) : null}
                    <SystemInfoSection info={systemInfo} t={t} />
                </div>
            )}
        </section>
    );
}

/** Bibliogon's name + version + license + repository links. */
function VersionSection({
    info,
    t,
}: {
    info: SystemInfo;
    t: (key: string, fallback: string) => string;
}) {
    return (
        <article data-testid="about-version-section" style={sectionStyle}>
            <h3 style={{marginTop: 0, marginBottom: 12}}>
                {t("ui.about.version_heading", "Version")}
            </h3>
            <dl style={dlStyle}>
                <dt>
                    <strong>{t("ui.about.app_label", "Bibliogon")}</strong>
                </dt>
                <dd data-testid="about-app-version" style={{margin: 0}}>
                    v{info.app.version}
                </dd>
                <dt>
                    <strong>{t("ui.about.license_label", "Lizenz")}</strong>
                </dt>
                <dd style={{margin: 0}}>{info.app.license}</dd>
            </dl>
        </article>
    );
}

/** Credits: authors + repository + issue tracker links. */
function CreditsSection({
    info,
    t,
}: {
    info: SystemInfo;
    t: (key: string, fallback: string) => string;
}) {
    return (
        <article data-testid="about-credits-section" style={sectionStyle}>
            <h3 style={{marginTop: 0, marginBottom: 12}}>
                {t("ui.about.credits_heading", "Mitwirkende")}
            </h3>
            <dl style={dlStyle}>
                <dt>
                    <strong>{t("ui.about.authors_label", "Autor:innen")}</strong>
                </dt>
                <dd data-testid="about-authors" style={{margin: 0}}>
                    {info.app.authors.length > 0
                        ? info.app.authors.join(", ")
                        : t("ui.about.authors_unknown", "Unbekannt")}
                </dd>
                <dt>
                    <strong>{t("ui.about.repository_label", "Repository")}</strong>
                </dt>
                <dd style={{margin: 0}}>
                    <a
                        href={info.app.repository_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="about-repository-link"
                        style={{display: "inline-flex", alignItems: "center", gap: 4}}
                    >
                        <ExternalLink size={14} aria-hidden />
                        {info.app.repository_url.replace(/^https?:\/\//, "")}
                    </a>
                </dd>
                <dt>
                    <strong>{t("ui.about.issues_label", "Fehler melden")}</strong>
                </dt>
                <dd style={{margin: 0}}>
                    <a
                        href={info.app.issues_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="about-issues-link"
                        style={{display: "inline-flex", alignItems: "center", gap: 4}}
                    >
                        <ExternalLink size={14} aria-hidden />
                        {info.app.issues_url.replace(/^https?:\/\//, "")}
                    </a>
                </dd>
            </dl>
        </article>
    );
}

/** Active plugin list: localized display_name + version + tier
 *  badge. Reads /api/settings/plugins/discovered's extended
 *  payload (C1 — added display_name + description + version
 *  fields). Filters to plugins that are ENABLED in the config —
 *  matches the user-overlay activation semantics so the About
 *  list only shows what's actually mounted. */
function PluginListSection({
    plugins,
    t,
    lang,
}: {
    plugins: DiscoveredPlugin[];
    t: (key: string, fallback: string) => string;
    lang: string;
}) {
    const active = plugins
        .filter((p) => p.enabled && p.loaded)
        .sort((a, b) => a.name.localeCompare(b.name));
    return (
        <article data-testid="about-plugins-section" style={sectionStyle}>
            <h3 style={{marginTop: 0, marginBottom: 12}}>
                {t("ui.about.plugins_heading", "Plugins")}
            </h3>
            {active.length === 0 ? (
                <p
                    data-testid="about-plugins-empty"
                    style={{color: "var(--text-muted)", margin: 0}}
                >
                    {t("ui.about.plugins_empty", "Keine Plugins aktiv.")}
                </p>
            ) : (
                <ul
                    data-testid="about-plugins-list"
                    style={{listStyle: "none", padding: 0, margin: 0}}
                >
                    {active.map((p) => {
                        const displayName = getLocalized(
                            p.display_name,
                            p.name,
                            lang,
                        );
                        const description = getLocalized(p.description, "", lang);
                        return (
                            <li
                                key={p.name}
                                data-testid={`about-plugin-row-${p.name}`}
                                style={{
                                    padding: "8px 0",
                                    borderBottom: "1px solid var(--border)",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 2,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                    }}
                                >
                                    <strong>{displayName}</strong>
                                    {p.version ? (
                                        <span
                                            style={{
                                                color: "var(--text-muted)",
                                                fontSize: "0.85rem",
                                            }}
                                        >
                                            v{p.version}
                                        </span>
                                    ) : null}
                                </div>
                                {description ? (
                                    <span
                                        style={{
                                            color: "var(--text-muted)",
                                            fontSize: "0.85rem",
                                        }}
                                    >
                                        {description}
                                    </span>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </article>
    );
}

/** Runtime + bundled-dependency versions (Python, FastAPI, etc.).
 *  Dependencies render as "unknown" when the backend reports null
 *  for a missing import (graceful degrade per /api/system/info
 *  C1 contract). */
function SystemInfoSection({
    info,
    t,
}: {
    info: SystemInfo;
    t: (key: string, fallback: string) => string;
}) {
    const depRow = (label: string, version: string | null, testid: string) => (
        <>
            <dt>
                <strong>{label}</strong>
            </dt>
            <dd data-testid={testid} style={{margin: 0}}>
                {version ?? t("ui.about.dep_unknown", "Unbekannt")}
            </dd>
        </>
    );
    return (
        <article data-testid="about-system-section" style={sectionStyle}>
            <h3 style={{marginTop: 0, marginBottom: 12}}>
                {t("ui.about.system_heading", "System")}
            </h3>
            <dl style={dlStyle}>
                <dt>
                    <strong>Python</strong>
                </dt>
                <dd data-testid="about-python-version" style={{margin: 0}}>
                    {info.runtime.python_version}
                </dd>
                <dt>
                    <strong>{t("ui.about.platform_label", "Plattform")}</strong>
                </dt>
                <dd data-testid="about-platform" style={{margin: 0}}>
                    {info.runtime.platform_system} {info.runtime.platform_release}
                    {info.runtime.platform_machine ? ` (${info.runtime.platform_machine})` : ""}
                </dd>
                {depRow("FastAPI", info.dependencies.fastapi, "about-dep-fastapi")}
                {depRow("SQLAlchemy", info.dependencies.sqlalchemy, "about-dep-sqlalchemy")}
                {depRow("Pydantic", info.dependencies.pydantic, "about-dep-pydantic")}
                {depRow("PluginForge", info.dependencies.pluginforge, "about-dep-pluginforge")}
            </dl>
        </article>
    );
}
