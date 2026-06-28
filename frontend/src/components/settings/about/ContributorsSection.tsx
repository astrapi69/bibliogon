/**
 * Settings > About — Contributors section: the author block, the
 * toolchain Bibliogon is built with (a horizontal tag list of linked
 * project names), and the AI assistance credit. Fully client-side, so
 * it renders offline. Extracted from AboutSettings.tsx (#675).
 */

import { ExternalLink } from "lucide-react";
import { sectionStyle, dlStyle, externalLinkStyle, type T } from "./styles";
import { AUTHOR_NAME, AUTHOR_URL, BUILT_WITH } from "./constants";

export function ContributorsSection({ t }: { t: T }) {
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
