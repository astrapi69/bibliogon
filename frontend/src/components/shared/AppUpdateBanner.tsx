import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "../../hooks/useI18n";
import { UpdateBanner } from "../../lib/components/UpdateBanner";
import {
  applyUpdate,
  checkForUpdate,
  subscribeToUpdates,
} from "../../shared/utils/swUpdateManager";
import { useReleaseBanner } from "./ReleaseBannerContext";

/**
 * App-level wiring of the {@link UpdateBanner} to the service-worker update
 * manager. Subscribes to update-availability, renders the banner with
 * translated strings when a new worker is waiting, and triggers a proactive
 * update check on every route change (so a user navigating around an
 * already-open tab picks up a fresh deploy promptly).
 *
 * Clicking "update now" shows a brief "saving …" state while
 * {@link applyUpdate} posts SKIP_WAITING; the manager reloads the page once
 * the new worker takes control (the reload flushes pending editor drafts via
 * the existing unload-flush, so no content is lost). Dismissing hides the
 * banner for the current session; the next detected update re-surfaces it.
 *
 * In the PWA a single deploy also triggers the richer {@link AppVersionUpdateBanner}
 * (GitHub release + notes). To avoid two banners at once, this one steps aside
 * while that one is showing (`releaseBannerActive` from {@link useReleaseBanner});
 * it still covers the cases the release banner does not (a deploy without a
 * formal release, or a release the user dismissed per-version).
 */
export default function AppUpdateBanner() {
  const { t } = useI18n();
  const location = useLocation();
  const { releaseBannerActive } = useReleaseBanner();
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => subscribeToUpdates(setAvailable), []);

  useEffect(() => {
    checkForUpdate();
  }, [location.pathname]);

  if (releaseBannerActive || !available || dismissed) return null;

  return (
    <UpdateBanner
      message={
        updating
          ? t("ui.update_banner.updating", "Saving your work and updating …")
          : t("ui.update_banner.message", "A new version of Bibliogon is available.")
      }
      buttonLabel={t("ui.update_banner.button", "Update now")}
      onUpdate={() => {
        setUpdating(true);
        applyUpdate();
      }}
      onDismiss={updating ? undefined : () => setDismissed(true)}
      dismissLabel={t("ui.update_banner.dismiss", "Dismiss")}
    />
  );
}
