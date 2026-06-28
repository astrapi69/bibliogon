/**
 * Settings > About — System section. Client-side system info (storage
 * backend, data directory, parsed browser platform) renders offline.
 * When systemInfo is present (api mode) the backend dependency rows
 * render after the client rows so nothing is lost online. Extracted
 * from AboutSettings.tsx (#675).
 */

import { type SystemInfo } from "../../../api/client";
import { sectionStyle, dlStyle, type T } from "./styles";
import { parseUserAgent } from "./userAgent";

export function SystemInfoSection({
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
