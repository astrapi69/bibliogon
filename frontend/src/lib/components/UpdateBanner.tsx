import { RefreshCw, X } from "lucide-react";

/**
 * Props for {@link UpdateBanner}.
 */
export interface UpdateBannerProps {
  /** The message shown to the user (e.g. "A new version is available."). */
  message: string;
  /** Label for the primary "update now" button. */
  buttonLabel: string;
  /** Invoked when the user clicks the primary update button. */
  onUpdate: () => void;
  /**
   * Optional dismiss handler. When provided, a dismiss (X) control is
   * rendered. Omit it to make the banner non-dismissible.
   */
  onDismiss?: () => void;
  /** Accessible label for the dismiss control. Defaults to "Dismiss". */
  dismissLabel?: string;
  /**
   * Optional extra actions rendered as secondary buttons before the primary
   * one (e.g. "What's new?" / "Later"). Presentational only — the caller
   * wires the handlers.
   */
  secondaryActions?: {
    label: string;
    onClick: () => void;
    testId?: string;
  }[];
}

/**
 * Non-intrusive, app-agnostic "new version available" banner.
 *
 * Pinned to the bottom of the viewport above all content, styled as an
 * informational (not warning) bar using theme tokens so it works across
 * every Bibliogon palette. It does NOT auto-dismiss: the user either applies
 * the update or dismisses it (when {@link UpdateBannerProps.onDismiss} is
 * provided). Zero application imports — purely presentational, driven by props.
 *
 * @example
 * ```tsx
 * <UpdateBanner
 *   message="A new version is available."
 *   buttonLabel="Update now"
 *   onUpdate={() => applyUpdate()}
 *   onDismiss={() => setVisible(false)}
 * />
 * ```
 */
export function UpdateBanner({
  message,
  buttonLabel,
  onUpdate,
  onDismiss,
  dismissLabel = "Dismiss",
  secondaryActions = [],
}: UpdateBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="update-banner"
      className="fixed inset-x-0 bottom-0 z-[1000] flex flex-wrap items-center justify-center gap-3 border-t border-[var(--accent)] bg-[var(--bg-card)] px-4 py-3 text-[var(--text)] shadow-[var(--shadow-lg)]"
    >
      <RefreshCw size={18} aria-hidden className="shrink-0 text-[var(--accent)]" />
      <span className="text-center text-[0.95rem]">{message}</span>
      {secondaryActions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          data-testid={action.testId}
          className="btn btn-secondary shrink-0"
        >
          {action.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onUpdate}
        data-testid="update-banner-button"
        className="btn btn-primary shrink-0"
      >
        {buttonLabel}
      </button>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          data-testid="update-banner-dismiss"
          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <X size={18} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export default UpdateBanner;
