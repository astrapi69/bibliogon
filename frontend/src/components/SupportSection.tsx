/**
 * Support Bibliogon section rendered inside the Settings page.
 *
 * Corresponds to S-01 in the donation UX strategy (docs/explorations/donations-ux.md):
 * a permanent, discoverable link surface. No popups, no nags. The section
 * renders only if `config.donations.enabled === true`; otherwise the
 * parent Settings page hides the entire tab.
 *
 * Channel list comes from the app config. A null `landing_page_url`
 * means we render the per-channel buttons; a non-null value collapses
 * the UI to a single "Support the project" button that links there.
 */

import {ExternalLink, Heart, Star} from "lucide-react";
import {useI18n} from "../hooks/useI18n";

export interface DonationChannel {
  name: string;
  url: string;
  icon?: string;
  recommended?: boolean;
  description_key?: string;
}

export interface DonationsConfig {
  enabled: boolean;
  landing_page_url: string | null;
  channels: DonationChannel[];
}

export function getDonationsConfig(
  appConfig: Record<string, unknown>,
): DonationsConfig | null {
  const raw = appConfig.donations as Record<string, unknown> | undefined;
  if (!raw || raw.enabled !== true) return null;
  const channels = Array.isArray(raw.channels) ? (raw.channels as DonationChannel[]) : [];
  const landing = raw.landing_page_url;
  return {
    enabled: true,
    landing_page_url: typeof landing === "string" && landing.length > 0 ? landing : null,
    channels,
  };
}

interface Props {
  config: DonationsConfig;
}

export default function SupportSection({config}: Props) {
  const {t} = useI18n();

  if (config.landing_page_url) {
    return (
      <section style={styles.section}>
        <h2 style={styles.heading}>
          <Heart size={18} aria-hidden /> {t("ui.donations.section_title", "Bibliogon unterstützen")}
        </h2>
        <p style={styles.intro}>
          {t("ui.donations.intro", "Bibliogon entsteht als Open-Source-Projekt...")}
        </p>
        <a
          href={config.landing_page_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={styles.primaryButton}
        >
          <ExternalLink size={16} aria-hidden />
          {t("ui.donations.support_button", "Projekt unterstützen")}
        </a>
      </section>
    );
  }

  return (
    <section style={styles.section} data-testid="support-section">
      <h2 style={styles.heading}>
        <Heart size={18} aria-hidden /> {t("ui.donations.section_title", "Bibliogon unterstützen")}
      </h2>
      <p style={styles.intro}>
        {t("ui.donations.intro", "Bibliogon entsteht als Open-Source-Projekt...")}
      </p>
      <div style={styles.channelGrid}>
        {config.channels.map((channel) => (
          <article key={channel.name} style={styles.channelCard} data-testid={`donation-channel-${channel.name}`}>
            <div style={styles.channelHeader}>
              <strong>{channel.name}</strong>
              {channel.recommended ? (
                <span style={styles.badge} title={t("ui.donations.recommended_badge", "Empfohlen")}>
                  <Star size={12} aria-hidden /> {t("ui.donations.recommended_badge", "Empfohlen")}
                </span>
              ) : null}
            </div>
            {channel.description_key ? (
              <p style={styles.channelDesc}>{t(channel.description_key, "")}</p>
            ) : null}
            <a
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={styles.channelButton}
            >
              <ExternalLink size={14} aria-hidden />
              {t("ui.donations.support_button", "Projekt unterstützen")}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    maxWidth: 720,
    padding: "1rem",
  },
  heading: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "1.15rem",
    marginBottom: "0.75rem",
  },
  intro: {
    color: "var(--text-muted)",
    marginBottom: "1.5rem",
    lineHeight: 1.5,
  },
  channelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: "0.75rem",
  },
  channelCard: {
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "0.75rem",
    background: "var(--bg-surface)",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  channelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
  channelDesc: {
    fontSize: "0.9rem",
    color: "var(--text-muted)",
    margin: 0,
    lineHeight: 1.4,
  },
  channelButton: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
  },
};
