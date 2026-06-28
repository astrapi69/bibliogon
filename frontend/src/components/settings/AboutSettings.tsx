/**
 * Settings > About tab — Bibliogon's About-Dialog surface.
 *
 * Per the 2026-05-18 audit (D1.A + D4.A + D5.A), the About panel
 * lives as the 9th Settings tab. Fetches /api/system/info on
 * mount + reuses appConfig (passed by the Settings parent) for
 * the donations config. Plugin list is rendered from
 * /api/settings/plugins/discovered's extended payload.
 *
 * Issue #87 reorganises the panel into five offline-capable
 * sections: Version, System, Contributors, Support, and
 * License & Resources. Issue #675 extracts each section component
 * plus the shared styles/constants/helpers into the about/
 * subdirectory; this file is the orchestrator that fetches data
 * and wires the sections together. `parseUserAgent` is re-exported
 * for its existing test import.
 */

import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type DiscoveredPlugin,
  type SystemInfo,
} from "../../api/client";
import { getStorage } from "../../storage";
import { useI18n } from "../../hooks/useI18n";
import { ShareAppSection } from "../share/ShareAppSection";
import SupportSection, { getDonationsConfig } from "./SupportSection";
import { SectionHeader } from "./SectionHeader";
import { LanAccessSettings } from "./LanAccessSettings";
import ErrorReportDialog from "../shared/ErrorReportDialog";
import { sectionStyle } from "./about/styles";
import { VersionSection } from "./about/VersionSection";
import { SystemInfoSection } from "./about/SystemInfoSection";
import { ContributorsSection } from "./about/ContributorsSection";
import { ResourcesSection } from "./about/ResourcesSection";
import { PluginListSection } from "./about/PluginListSection";

export { parseUserAgent } from "./about/userAgent";

interface Props {
  appConfig: Record<string, unknown>;
}

export function AboutSettings({ appConfig }: Props) {
  const { t, lang } = useI18n();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [plugins, setPlugins] = useState<DiscoveredPlugin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const offline = getStorage().mode === "dexie";
  const donationsConfig = getDonationsConfig(appConfig);

  useEffect(() => {
    let cancelled = false;
    const isOffline = getStorage().mode === "dexie";
    const systemInfoP = isOffline
      ? Promise.resolve<SystemInfo | null>(null)
      : api.system.info();
    Promise.all([systemInfoP, getStorage().settings.discoveredPlugins()])
      .then(([info, pluginList]) => {
        if (cancelled) return;
        setSystemInfo(info);
        setPlugins(pluginList);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const detail = err instanceof ApiError ? err.detail : String(err);
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
      <SectionHeader
        title={t("ui.about.heading", "Über Bibliogon")}
        description={t(
          "ui.about.description",
          "Version, System-Info, installierte Plugins und Spenden-Kanäle.",
        )}
      />

      {/* Self-hiding unless the backend runs in LAN mode. */}
      <LanAccessSettings />

      {loading && (
        <div
          data-testid="about-settings-loading"
          style={{ color: "var(--text-muted)" }}
        >
          {t("ui.about.loading", "Lade Informationen ...")}
        </div>
      )}

      {error && (
        <div
          data-testid="about-settings-error"
          role="alert"
          style={{ color: "var(--danger, #c00)" }}
        >
          {t(
            "ui.about.load_failed",
            "Informationen konnten nicht geladen werden:",
          )}{" "}
          {error}
        </div>
      )}

      {!loading && !error && (
        <div
          data-testid="about-settings-content"
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* Build provenance reads build-time literals, so it renders
              offline (Dexie mode) where systemInfo is null. The System,
              Contributors and License & Resources sections are
              client-side and render in both modes; only the backend
              dependency rows inside System are gated on systemInfo. */}
          <VersionSection
            t={t}
            lang={lang}
            updates={appConfig?.updates as Record<string, unknown> | undefined}
          />
          <SystemInfoSection info={systemInfo} offline={offline} t={t} />
          <PluginListSection
            plugins={plugins}
            offline={offline}
            t={t}
            lang={lang}
          />
          <ContributorsSection t={t} />
          <ShareAppSection t={t} />
          {donationsConfig ? (
            <article data-testid="about-donations-section" style={sectionStyle}>
              <SupportSection config={donationsConfig} />
            </article>
          ) : null}
          <ResourcesSection
            t={t}
            onCreateReport={() => setReportOpen(true)}
          />
        </div>
      )}

      <ErrorReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </section>
  );
}
