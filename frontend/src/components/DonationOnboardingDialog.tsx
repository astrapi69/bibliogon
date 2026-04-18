/**
 * S-02: one-time onboarding dialog after the first successful book
 * creation. Mirrors the AiSetupWizard pattern: Radix Dialog + a
 * `bibliogon-donation-onboarding-seen` localStorage flag. Every dismiss
 * path (Support, Understood, close-X, Escape, overlay click) sets
 * the flag, so the dialog only shows once per user per machine.
 *
 * Trigger lives in the Dashboard's book-creation handlers. This
 * component just renders when told to.
 */

import {useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {Heart, X, ExternalLink, Star} from "lucide-react";
import {useI18n} from "../hooks/useI18n";
import type {DonationsConfig} from "./SupportSection";

export const DONATION_ONBOARDING_SEEN_KEY = "bibliogon-donation-onboarding-seen";

export function shouldShowDonationOnboarding(): boolean {
  try {
    return localStorage.getItem(DONATION_ONBOARDING_SEEN_KEY) !== "true";
  } catch {
    return false;
  }
}

function markOnboardingSeen(): void {
  try {
    localStorage.setItem(DONATION_ONBOARDING_SEEN_KEY, "true");
  } catch {
    /* no-op: user rejected storage, still close cleanly */
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  donations: DonationsConfig;
}

export default function DonationOnboardingDialog({open, onClose, donations}: Props) {
  const {t} = useI18n();
  const [showChannels, setShowChannels] = useState(false);

  const handleClose = () => {
    markOnboardingSeen();
    setShowChannels(false);
    onClose();
  };

  const handleSupport = () => {
    markOnboardingSeen();
    if (donations.landing_page_url) {
      window.open(donations.landing_page_url, "_blank", "noopener,noreferrer");
      setShowChannels(false);
      onClose();
      return;
    }
    // No single landing page: let the user pick a channel from the list.
    setShowChannels(true);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-dialog-overlay" />
        <Dialog.Content className="radix-dialog-content" data-testid="donation-onboarding" style={styles.content}>
          <div style={styles.header}>
            <Dialog.Title style={styles.title}>
              <Heart size={18} aria-hidden /> {t("ui.donations.onboarding_title", "Bibliogon unterstützen")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="btn-icon" aria-label={t("ui.common.close", "Schließen")} data-testid="donation-onboarding-close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {!showChannels ? (
            <>
              <p style={styles.body}>
                {t("ui.donations.onboarding_body", "Bibliogon entsteht als Open-Source-Projekt ohne Tracking, ohne Cloud-Backend, ohne Werbung.")}
              </p>
              <p style={styles.hint}>{t("ui.donations.onboarding_hint", "Diesen Hinweis findest du jederzeit in den Einstellungen.")}</p>
              <div style={styles.actions}>
                <button className="btn btn-primary" onClick={handleSupport} data-testid="donation-onboarding-support">
                  <ExternalLink size={14} aria-hidden /> {t("ui.donations.support_button", "Projekt unterstützen")}
                </button>
                <button className="btn btn-secondary" onClick={handleClose} data-testid="donation-onboarding-understood">
                  {t("ui.donations.understood_button", "Verstanden")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={styles.body}>{t("ui.donations.intro", "Bibliogon entsteht als Open-Source-Projekt...")}</p>
              <div style={styles.channelList}>
                {donations.channels.map((channel) => (
                  <a
                    key={channel.name}
                    href={channel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    onClick={() => { handleClose(); }}
                    style={styles.channelLink}
                    data-testid={`donation-onboarding-channel-${channel.name}`}
                  >
                    <span style={styles.channelName}>
                      <ExternalLink size={14} aria-hidden /> {channel.name}
                    </span>
                    {channel.recommended ? (
                      <span style={styles.badge}>
                        <Star size={12} aria-hidden /> {t("ui.donations.recommended_badge", "Empfohlen")}
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
              <div style={styles.actions}>
                <button className="btn btn-secondary" onClick={handleClose}>
                  {t("ui.donations.understood_button", "Verstanden")}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const styles: Record<string, React.CSSProperties> = {
  content: {
    maxWidth: "480px",
    width: "min(480px, 90vw)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  title: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "1.1rem",
    fontWeight: 600,
    margin: 0,
  },
  body: {
    color: "var(--text)",
    lineHeight: 1.5,
    marginBottom: "0.75rem",
  },
  hint: {
    color: "var(--text-muted)",
    fontSize: "0.875rem",
    marginBottom: "1rem",
  },
  actions: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  channelList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginBottom: "1rem",
  },
  channelLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    textDecoration: "none",
  },
  channelName: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
};
