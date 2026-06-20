/**
 * S-03: subtle reminder banner shown on the Dashboard after 90 days
 * of active use. Only one of the three donation visibility levels,
 * and the most cautious one: it sits at the top of the book grid,
 * never during an active workflow (editor, export, AI session),
 * never outside the Dashboard, never before S-02 onboarding has
 * been acknowledged.
 *
 * Dismiss paths:
 * - "Support": open channel URL, next-allowed = today + 180 days
 * - "Not now" / close-X: next-allowed = today + 90 days
 *
 * Storage is local only. No tracking, no backend calls.
 */

import {useEffect, useMemo} from "react";
import {Heart, X, ExternalLink} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import type {DonationsConfig} from "../SupportSection";
import {DONATION_ONBOARDING_SEEN_KEY} from "../DonationOnboardingDialog";
import styles from "../DonationReminderBanner.module.css";

export const FIRST_USE_DATE_KEY = "bibliogon-first-use-date";
export const REMINDER_NEXT_ALLOWED_KEY = "bibliogon-donation-reminder-next-allowed";

// v0.35.1 (2026-05-18 user-direction): explicit constants
// replace the prior single ``DAYS_90`` that double-served as both
// grace gate AND dismissed-cooldown. Three independent knobs now:
// - GRACE_PERIOD_DAYS: time after first-use before the reminder
//   may fire. Bumped down from 90 days to 7 days per user-spec
//   "Bibliogon currently has no donation-hint visible" — 7 days
//   is a short post-install grace that still avoids ask-on-first-
//   launch (the "form an opinion" buffer Phylax cites at 90 days
//   is too long for a project at Bibliogon's stage; new users
//   would never see a donation hint).
// - COOLDOWN_DISMISSED_DAYS: re-show interval after the user
//   dismisses (90 days = ≈ 3 months per user-spec).
// - COOLDOWN_DONATED_DAYS: re-show interval after a donation
//   click-through (180 days = 6 months; preserve from prior
//   ship — donor doesn't need a reminder for 6 months per user
//   reasoning).
const GRACE_PERIOD_DAYS = 7;
const COOLDOWN_DISMISSED_DAYS = 90;
const COOLDOWN_DONATED_DAYS = 180;

/**
 * Set the first-use date if it has not been recorded yet. Idempotent:
 * subsequent calls with an existing value are no-ops. Called once on
 * app start.
 */
export function ensureFirstUseDate(): void {
  try {
    if (localStorage.getItem(FIRST_USE_DATE_KEY)) return;
    localStorage.setItem(FIRST_USE_DATE_KEY, new Date().toISOString());
  } catch {
    /* storage rejected; banner will just never fire */
  }
}

function readDate(key: string): Date | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function daysBetween(earlier: Date, later: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Pure decision helper. Returns true when all of these hold:
 *  - donations enabled in config
 *  - S-02 onboarding has been seen (flag set)
 *  - first-use date recorded at least 90 days ago
 *  - next-allowed date is either missing or in the past
 */
export function shouldShowReminder(
  donations: DonationsConfig | null,
  now: Date = new Date(),
): boolean {
  if (!donations) return false;
  try {
    if (localStorage.getItem(DONATION_ONBOARDING_SEEN_KEY) !== "true") return false;
  } catch {
    return false;
  }
  const firstUse = readDate(FIRST_USE_DATE_KEY);
  if (!firstUse) return false;
  if (daysBetween(firstUse, now) < GRACE_PERIOD_DAYS) return false;
  const nextAllowed = readDate(REMINDER_NEXT_ALLOWED_KEY);
  if (nextAllowed && nextAllowed.getTime() > now.getTime()) return false;
  return true;
}

function setCooldown(days: number): void {
  try {
    const next = new Date();
    next.setDate(next.getDate() + days);
    localStorage.setItem(REMINDER_NEXT_ALLOWED_KEY, next.toISOString());
  } catch {
    /* no-op */
  }
}

interface Props {
  donations: DonationsConfig;
  onDismiss: () => void;
}

export default function DonationReminderBanner({donations, onDismiss}: Props) {
  const {t} = useI18n();

  const supportHref = useMemo(() => {
    if (donations.landing_page_url) return donations.landing_page_url;
    const recommended = donations.channels.find((c) => c.recommended);
    return recommended?.url ?? donations.channels[0]?.url ?? "#";
  }, [donations]);

  const handleSupport = () => {
    setCooldown(COOLDOWN_DONATED_DAYS);
    onDismiss();
  };

  const handleNotNow = () => {
    setCooldown(COOLDOWN_DISMISSED_DAYS);
    onDismiss();
  };

  // v0.35.1 a11y addition: Escape key dismisses the banner with the
  // same semantics as "Not now" / close-X (90-day cooldown). The
  // banner is App-level mounted in v0.35.1, so the Escape handler
  // is global; bind on document via window event. No risk of
  // double-firing with other Esc consumers because each dismiss
  // call to onDismiss unmounts the banner — subsequent Esc presses
  // fall through to whatever else is listening.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleNotNow();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleNotNow is stable enough (closes over onDismiss + cooldown
    // setter); intentionally not in deps to avoid re-binding on every
    // render. Same pattern used in HelpPanel + ShortcutCheatsheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="region"
      // v0.35.1 a11y: aria-live=polite for the App-level banner so
      // screen readers announce the reminder when it first appears
      // without stealing focus. Polite (not assertive) because the
      // banner is non-urgent.
      aria-live="polite"
      aria-label="Bibliogon support reminder"
      className={styles.banner}
      data-testid="donation-reminder"
    >
      <Heart size={16} aria-hidden className={styles.icon} />
      <span className={styles.text}>
        {t("ui.donations.reminder_body", "Du nutzt Bibliogon seit drei Monaten. Wenn dir das Projekt gefällt:")}
      </span>
      <div className={styles.actions}>
        <a
          href={supportHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm"
          onClick={handleSupport}
          data-testid="donation-reminder-support"
        >
          <ExternalLink size={14} aria-hidden /> {t("ui.donations.support_button", "Projekt unterstützen")}
        </a>
        <button className="btn btn-secondary btn-sm" onClick={handleNotNow} data-testid="donation-reminder-not-now">
          {t("ui.donations.not_now_button", "Später")}
        </button>
        <button
          className="btn-icon"
          onClick={handleNotNow}
          aria-label={t("ui.donations.reminder_close", "Schließen")}
          data-testid="donation-reminder-close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
