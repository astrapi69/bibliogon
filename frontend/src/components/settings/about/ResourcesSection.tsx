/**
 * Settings > About — License & Resources section: license + external
 * resource links (repository, documentation, issue tracker) plus a
 * proactive "create error report" entry that opens the
 * ErrorReportDialog without a preceding crash (EVT-03). Static
 * client-side data, so it renders offline. Extracted from
 * AboutSettings.tsx (#675).
 */

import { Bug, ExternalLink } from "lucide-react";
import { sectionStyle, dlStyle, externalLinkStyle, type T } from "./styles";
import { DOCS_URL, ISSUES_URL, LICENSE_URL, REPOSITORY_URL } from "./constants";

export function ResourcesSection({
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
