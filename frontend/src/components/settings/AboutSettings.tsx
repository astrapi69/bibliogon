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
 * License & Resources. The Version section keeps only the
 * build-time provenance rows; the running license moved to the
 * License & Resources section. The Contributors + License &
 * Resources sections are entirely client-side static, so they
 * render identically online and offline (Dexie mode). The
 * backend dependency rows still render inside the System section
 * when systemInfo is present (api mode).
 */

import { useEffect, useState } from "react";
import { Bug, ExternalLink } from "lucide-react";
import {
  api,
  ApiError,
  type DiscoveredPlugin,
  type SystemInfo,
} from "../../api/client";
import { getStorage } from "../../storage";
import { useI18n } from "../../hooks/useI18n";
import { getLocalized } from "./utils";
import SupportSection, { getDonationsConfig } from "../SupportSection";
import { SectionHeader } from "./SectionHeader";
import { LanAccessSettings } from "./LanAccessSettings";
import ErrorReportDialog from "../ErrorReportDialog";

interface Props {
  appConfig: Record<string, unknown>;
}

type T = (key: string, fallback: string) => string;

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

const externalLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

/** The toolchain Bibliogon is built with. Each tag links to the
 *  project's home; the labels are project names and stay English
 *  (untranslated) per issue #87. */
const BUILT_WITH: ReadonlyArray<{ label: string; url: string }> = [
  { label: "React", url: "https://react.dev" },
  { label: "FastAPI", url: "https://fastapi.tiangolo.com" },
  { label: "PluginForge", url: "https://github.com/astrapi69/pluginforge" },
  { label: "TipTap", url: "https://tiptap.dev" },
  { label: "Dexie", url: "https://dexie.org" },
  { label: "Tailwind", url: "https://tailwindcss.com" },
  { label: "SQLAlchemy", url: "https://www.sqlalchemy.org" },
  { label: "Pydantic", url: "https://docs.pydantic.dev" },
  { label: "Vite", url: "https://vite.dev" },
  { label: "TypeScript", url: "https://www.typescriptlang.org" },
  { label: "Playwright", url: "https://playwright.dev" },
];

const AUTHOR_NAME = "Asterios Raptis";
const AUTHOR_URL = "https://github.com/astrapi69";
const LICENSE_URL =
  "https://github.com/astrapi69/bibliogon/blob/main/LICENSE";
const REPOSITORY_URL = "https://github.com/astrapi69/bibliogon";
const DOCS_URL = "https://astrapi69.github.io/bibliogon/docs/";
const ISSUES_URL = "https://github.com/astrapi69/bibliogon/issues";

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
          <VersionSection t={t} lang={lang} />
          <SystemInfoSection info={systemInfo} offline={offline} t={t} />
          <PluginListSection
            plugins={plugins}
            offline={offline}
            t={t}
            lang={lang}
          />
          <ContributorsSection t={t} />
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

/** Format the build-time ISO timestamp into a locale-aware string,
 *  falling back to the raw value if it is not a parseable date. */
function formatBuildDate(iso: string, lang: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return parsed.toLocaleString(lang);
  } catch {
    return parsed.toLocaleString();
  }
}

/**
 * Parse a browser User-Agent string into a readable "OS · Browser
 * Version" label. Handles the common desktop + mobile platforms
 * (Windows, macOS, Linux, Android, iOS) and the common browsers
 * (Edge, Chrome, Firefox, Safari) with a version number. Falls
 * back to the raw User-Agent string when it cannot be parsed.
 *
 * @param ua - The raw navigator.userAgent string.
 * @returns A human-readable "OS · Browser Version" string, or the
 *   raw User-Agent when neither OS nor browser is recognised.
 */
export function parseUserAgent(ua: string): string {
  if (!ua) return ua;

  let os = "";
  if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/(iPhone|iPad|iPod)/.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser = "";
  let version = "";
  let match: RegExpMatchArray | null;
  if ((match = ua.match(/Edg(?:e|A|iOS)?\/(\d+(?:\.\d+)?)/))) {
    browser = "Edge";
    version = match[1];
  } else if ((match = ua.match(/Firefox\/(\d+(?:\.\d+)?)/))) {
    browser = "Firefox";
    version = match[1];
  } else if ((match = ua.match(/Chrome\/(\d+(?:\.\d+)?)/))) {
    browser = "Chrome";
    version = match[1];
  } else if ((match = ua.match(/Version\/(\d+(?:\.\d+)?).*Safari/))) {
    browser = "Safari";
    version = match[1];
  } else if (/Safari/.test(ua)) {
    browser = "Safari";
  }

  const browserPart = [browser, version].filter(Boolean).join(" ");
  const parts = [os, browserPart].filter(Boolean);
  if (parts.length === 0) return ua;
  return parts.join(" · ");
}

/** Bibliogon's running build: version + build hash + branch +
 *  build date. All four come from Vite build-time literals, so the
 *  section renders offline (Dexie mode). The running license moved
 *  to the License & Resources section per issue #87. */
function VersionSection({ t, lang }: { t: T; lang: string }) {
  return (
    <article data-testid="about-version-section" style={sectionStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>
        {t("ui.about.version_heading", "Version")}
      </h3>
      <dl style={dlStyle}>
        <dt>
          <strong>{t("ui.about.app_label", "Bibliogon")}</strong>
        </dt>
        <dd data-testid="about-app-version" style={{ margin: 0 }}>
          v{__APP_VERSION__}
        </dd>
        <dt>
          <strong>{t("ui.about.build_label", "Build")}</strong>
        </dt>
        <dd data-testid="about-build-hash" style={{ margin: 0 }}>
          {__BUILD_HASH__}
        </dd>
        <dt>
          <strong>{t("ui.about.branch_label", "Branch")}</strong>
        </dt>
        <dd data-testid="about-build-branch" style={{ margin: 0 }}>
          {__BUILD_BRANCH__}
        </dd>
        <dt>
          <strong>{t("ui.about.build_date_label", "Build-Datum")}</strong>
        </dt>
        <dd data-testid="about-build-date" style={{ margin: 0 }}>
          {formatBuildDate(__BUILD_DATE__, lang)}
        </dd>
      </dl>
    </article>
  );
}

/** Client-side system info: storage backend, data directory, and the
 *  parsed browser platform — all render offline. When systemInfo is
 *  present (api mode) the backend dependency rows (Python + FastAPI +
 *  SQLAlchemy + Pydantic + PluginForge) render after the client rows
 *  so nothing is lost online. */
function SystemInfoSection({
  info,
  offline,
  t,
}: {
  info: SystemInfo | null;
  offline: boolean;
  t: T;
}) {
  const storageLabel = offline
    ? t("ui.about.storage_indexeddb", "Lokaler Browser-Speicher (IndexedDB)")
    : t("ui.about.storage_sqlite", "SQLite (Desktop)");
  const dataDirLabel = offline
    ? t("ui.about.data_dir_browser", "Browser-Speicher (IndexedDB)")
    : storageLabel;
  const platform =
    typeof navigator !== "undefined"
      ? parseUserAgent(navigator.userAgent)
      : "";
  const depRow = (label: string, version: string | null, testid: string) => (
    <>
      <dt>
        <strong>{label}</strong>
      </dt>
      <dd data-testid={testid} style={{ margin: 0 }}>
        {version ?? t("ui.about.dep_unknown", "Unbekannt")}
      </dd>
    </>
  );
  return (
    <article data-testid="about-system-section" style={sectionStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>
        {t("ui.about.system_heading", "System")}
      </h3>
      <dl style={dlStyle}>
        <dt>
          <strong>{t("ui.about.storage_label", "Speicher")}</strong>
        </dt>
        <dd data-testid="about-storage" style={{ margin: 0 }}>
          {storageLabel}
        </dd>
        <dt>
          <strong>{t("ui.about.data_dir_label", "Datenverzeichnis")}</strong>
        </dt>
        <dd data-testid="about-data-dir" style={{ margin: 0 }}>
          {dataDirLabel}
        </dd>
        <dt>
          <strong>{t("ui.about.platform_label", "Plattform")}</strong>
        </dt>
        <dd data-testid="about-platform-client" style={{ margin: 0 }}>
          {platform}
        </dd>
        {info ? (
          <>
            <dt>
              <strong>Python</strong>
            </dt>
            <dd data-testid="about-python-version" style={{ margin: 0 }}>
              {info.runtime.python_version}
            </dd>
            {depRow("FastAPI", info.dependencies.fastapi, "about-dep-fastapi")}
            {depRow(
              "SQLAlchemy",
              info.dependencies.sqlalchemy,
              "about-dep-sqlalchemy",
            )}
            {depRow(
              "Pydantic",
              info.dependencies.pydantic,
              "about-dep-pydantic",
            )}
            {depRow(
              "PluginForge",
              info.dependencies.pluginforge,
              "about-dep-pluginforge",
            )}
          </>
        ) : null}
      </dl>
    </article>
  );
}

/** Contributors: the author block, the toolchain Bibliogon is built
 *  with (a horizontal tag list of linked project names), and the AI
 *  assistance credit. Fully client-side, so it renders offline. */
function ContributorsSection({ t }: { t: T }) {
  return (
    <article data-testid="about-contributors-section" style={sectionStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>
        {t("ui.about.contributors_heading", "Mitwirkende")}
      </h3>
      <dl style={dlStyle}>
        <dt>
          <strong>{t("ui.about.author_label", "Autor")}</strong>
        </dt>
        <dd style={{ margin: 0 }}>
          <a
            href={AUTHOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="about-author"
            style={externalLinkStyle}
          >
            <ExternalLink size={14} aria-hidden />
            {AUTHOR_NAME}
          </a>
        </dd>
        <dt>
          <strong>{t("ui.about.built_with_label", "Gebaut mit")}</strong>
        </dt>
        <dd style={{ margin: 0 }}>
          <ul
            data-testid="about-built-with"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {BUILT_WITH.map((tool) => (
              <li key={tool.label} style={{ margin: 0 }}>
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    border: "1px solid var(--border, #ddd)",
                    borderRadius: 12,
                    fontSize: "0.8rem",
                    backgroundColor: "var(--bg-card, #fff)",
                    textDecoration: "none",
                  }}
                >
                  {tool.label}
                </a>
              </li>
            ))}
          </ul>
        </dd>
        <dt>
          <strong>{t("ui.about.ai_assistance_label", "KI-Assistenz")}</strong>
        </dt>
        <dd data-testid="about-ai-assistance" style={{ margin: 0 }}>
          {t(
            "ui.about.ai_assistance_value",
            "Claude (Anthropic) - Architektur, Code, Content, Dokumentation",
          )}
        </dd>
      </dl>
    </article>
  );
}

/** License + external resource links (repository, documentation,
 *  issue tracker) plus a proactive "create error report" entry that
 *  opens the ErrorReportDialog without a preceding crash (EVT-03).
 *  Static client-side data, so it renders offline. */
function ResourcesSection({
  t,
  onCreateReport,
}: {
  t: T;
  onCreateReport: () => void;
}) {
  return (
    <article data-testid="about-resources-section" style={sectionStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>
        {t("ui.about.resources_heading", "Lizenz & Ressourcen")}
      </h3>
      <dl style={dlStyle}>
        <dt>
          <strong>{t("ui.about.license_label", "Lizenz")}</strong>
        </dt>
        <dd style={{ margin: 0 }}>
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="about-license"
            style={externalLinkStyle}
          >
            <ExternalLink size={14} aria-hidden />
            MIT
          </a>
        </dd>
        <dt>
          <strong>{t("ui.about.repository_label", "Repository")}</strong>
        </dt>
        <dd style={{ margin: 0 }}>
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="about-repository-link"
            style={externalLinkStyle}
          >
            <ExternalLink size={14} aria-hidden />
            {REPOSITORY_URL.replace(/^https?:\/\//, "")}
          </a>
        </dd>
        <dt>
          <strong>{t("ui.about.docs_label", "Dokumentation")}</strong>
        </dt>
        <dd style={{ margin: 0 }}>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="about-docs-link"
            style={externalLinkStyle}
          >
            <ExternalLink size={14} aria-hidden />
            {DOCS_URL.replace(/^https?:\/\//, "")}
          </a>
        </dd>
        <dt>
          <strong>{t("ui.about.issues_label", "Fehler melden")}</strong>
        </dt>
        <dd style={{ margin: 0 }}>
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="about-issues-link"
            style={externalLinkStyle}
          >
            <ExternalLink size={14} aria-hidden />
            {ISSUES_URL.replace(/^https?:\/\//, "")}
          </a>
        </dd>
      </dl>
      <button
        type="button"
        className="btn btn-secondary"
        data-testid="about-create-report"
        onClick={onCreateReport}
        style={{
          marginTop: 16,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minHeight: 44,
        }}
      >
        <Bug size={16} aria-hidden />
        {t("ui.error_report.create_button", "Fehlerbericht erstellen")}
      </button>
    </article>
  );
}

/** Active plugin list: localized display_name + version + tier
 *  badge. Reads /api/settings/plugins/discovered's extended
 *  payload (C1 — added display_name + description + version
 *  fields). Filters to plugins that are ENABLED in the config —
 *  matches the user-overlay activation semantics so the About
 *  list only shows what's actually mounted.
 *
 *  In Dexie mode (the backendless PWA) the list comes from the
 *  curated seed registry (export/help/getstarted — the plugins
 *  whose function exists client-side), so a hint clarifies that
 *  these run directly in the browser (#97). */
function PluginListSection({
  plugins,
  offline,
  t,
  lang,
}: {
  plugins: DiscoveredPlugin[];
  offline: boolean;
  t: T;
  lang: string;
}) {
  const active = plugins
    .filter((p) => p.enabled && p.loaded)
    .sort((a, b) => a.name.localeCompare(b.name));
  // No active plugins (the backendless PWA when nothing is seeded as
  // loaded) -> render nothing rather than an empty "Installed plugins"
  // container.
  if (active.length === 0) return null;
  return (
    <article data-testid="about-plugins-section" style={sectionStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>
        {t("ui.about.plugins_heading", "Plugins")}
      </h3>
      {offline ? (
        <p
          data-testid="about-plugins-browser-hint"
          style={{
            marginTop: 0,
            marginBottom: 12,
            color: "var(--text-muted)",
            fontSize: "0.85rem",
          }}
        >
          {t(
            "ui.about.plugins_browser_hint",
            "Diese Plugins sind direkt in diesem Browser verfügbar.",
          )}
        </p>
      ) : null}
      <ul
        data-testid="about-plugins-list"
        style={{ listStyle: "none", padding: 0, margin: 0 }}
      >
        {active.map((p) => {
          const displayName = getLocalized(p.display_name, p.name, lang);
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
    </article>
  );
}
