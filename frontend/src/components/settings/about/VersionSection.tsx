/**
 * Settings > About — Version section. Bibliogon's running build:
 * version + build hash + commit + branch + build date. All come from
 * Vite build-time literals, so the section renders offline (Dexie
 * mode). The running license moved to the License & Resources section
 * per issue #87. Extracted from AboutSettings.tsx (#675).
 */

import { ExternalLink } from "lucide-react";
import { getBuildInfo } from "../../../lib/buildInfo";
import { UpdateCheckButton } from "../UpdateCheckButton";
import { NextUpdateCheck } from "../NextUpdateCheck";
import { sectionStyle, dlStyle, externalLinkStyle, type T } from "./styles";
import { formatBuildDate } from "./userAgent";

export function VersionSection({
  t,
  lang,
  updates,
}: {
  t: T;
  lang: string;
  updates: Record<string, unknown> | undefined;
}) {
  const build = getBuildInfo();
  return (
    <article data-testid="about-version-section" style={sectionStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>
        {t("ui.about.version_heading", "Version")}
      </h3>
      {build.isPreview ? (
        <div
          data-testid="about-preview-notice"
          role="status"
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            border: "1px solid var(--warning)",
            borderRadius: 8,
            backgroundColor: "var(--warning-bg)",
            color: "var(--warning-dark)",
            fontSize: "0.85rem",
          }}
        >
          <strong>{t("ui.about.preview_heading", "Vorschau-/Testversion")}</strong>
          <div>
            {t(
              "ui.preview_banner.message",
              "Du verwendest eine Vorschau-/Testversion. Sie ist nicht stabil und kann Fehler enthalten.",
            )}
          </div>
        </div>
      ) : null}
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
          <strong>{t("ui.about.commit_label", "Commit")}</strong>
        </dt>
        <dd style={{ margin: 0 }}>
          <a
            href={build.commitUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="about-build-commit"
            style={externalLinkStyle}
          >
            <ExternalLink size={14} aria-hidden />
            {build.commitShort}
          </a>
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
      <UpdateCheckButton />
      <NextUpdateCheck updates={updates} />
    </article>
  );
}
