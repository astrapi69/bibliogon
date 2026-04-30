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
import styles from "./SupportSection.module.css";

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
      <section className={styles.section}>
        <h2 className={styles.heading}>
          <Heart size={18} aria-hidden /> {t("ui.donations.section_title", "Bibliogon unterstützen")}
        </h2>
        <p className={styles.intro}>
          {t("ui.donations.intro", "Bibliogon entsteht als Open-Source-Projekt...")}
        </p>
        <a
          href={config.landing_page_url}
          target="_blank"
          rel="noopener noreferrer"
          className={`btn btn-primary ${styles.primaryButton}`}
        >
          <ExternalLink size={16} aria-hidden />
          {t("ui.donations.support_button", "Projekt unterstützen")}
        </a>
      </section>
    );
  }

  return (
    <section className={styles.section} data-testid="support-section">
      <h2 className={styles.heading}>
        <Heart size={18} aria-hidden /> {t("ui.donations.section_title", "Bibliogon unterstützen")}
      </h2>
      <p className={styles.intro}>
        {t("ui.donations.intro", "Bibliogon entsteht als Open-Source-Projekt...")}
      </p>
      <div className={styles.channelGrid}>
        {config.channels.map((channel) => (
          <article key={channel.name} className={styles.channelCard} data-testid={`donation-channel-${channel.name}`}>
            <div className={styles.channelHeader}>
              <strong>{channel.name}</strong>
              {channel.recommended ? (
                <span className={styles.badge} title={t("ui.donations.recommended_badge", "Empfohlen")}>
                  <Star size={12} aria-hidden /> {t("ui.donations.recommended_badge", "Empfohlen")}
                </span>
              ) : null}
            </div>
            {channel.description_key ? (
              <p className={styles.channelDesc}>{t(channel.description_key, "")}</p>
            ) : null}
            <a
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-secondary btn-sm ${styles.channelButton}`}
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

