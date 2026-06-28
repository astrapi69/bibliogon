/**
 * Settings > About — Plugins section: active plugin list (localized
 * display_name + version + description). Reads
 * /api/settings/plugins/discovered's extended payload and filters to
 * plugins that are ENABLED + loaded in the config. In Dexie mode the
 * list comes from the curated seed registry, so a hint clarifies these
 * run directly in the browser (#97). Extracted from AboutSettings.tsx
 * (#675).
 */

import { type DiscoveredPlugin } from "../../../api/client";
import { getLocalized } from "../utils";
import { sectionStyle, type T } from "./styles";

export function PluginListSection({
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
