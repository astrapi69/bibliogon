import { useState } from "react";
import { ServerOff } from "lucide-react";

import { useI18n } from "../../hooks/useI18n";
import { useBackendReachability } from "../../hooks/ui/useBackendReachability";
import { useOnlineStatus } from "../../hooks/ui/useOnlineStatus";
import { backendReachability } from "../../api/backendReachability";

/**
 * Persistent top-of-shell banner while the backend is unreachable
 * (#765): ONE deduplicated surface replacing the per-request error
 * toasts (which `notify.error` suppresses via the `network` flag).
 *
 * Renders only when the BROWSER is online - a device-offline
 * situation is the existing OfflineBanner's job, and showing both
 * would be noise. Clears automatically on the next received backend
 * response (any status) or via the retry probe; while down, the
 * reachability store itself probes `/api/health` every 10s so the
 * banner also clears without user traffic.
 */
export default function BackendUnreachableBanner() {
  const backendDown = useBackendReachability();
  const browserOnline = useOnlineStatus();
  const { t } = useI18n();
  const [retrying, setRetrying] = useState(false);

  if (!backendDown || !browserOnline) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await backendReachability.retryNow();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="backend-unreachable-banner"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-[var(--warning)] bg-[var(--warning-bg)] px-4 py-2 text-center text-sm text-[var(--warning-dark)]"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <ServerOff size={16} aria-hidden />
        {t(
          "ui.offline.backend_banner_message",
          "Backend nicht erreichbar – läuft der Server?",
        )}
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        data-testid="backend-unreachable-retry"
        onClick={handleRetry}
        disabled={retrying}
      >
        {retrying
          ? t("ui.offline.backend_banner_retrying", "Prüfe…")
          : t("ui.offline.backend_banner_retry", "Erneut versuchen")}
      </button>
    </div>
  );
}
