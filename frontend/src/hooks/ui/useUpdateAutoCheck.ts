/**
 * useUpdateAutoCheck — background auto-check for new releases (#477 Phase 2).
 *
 * On mount (once), reads the `updates` settings block, and if auto-check is
 * on, the interval is not `never`, and a check is due (`isCheckDue`), runs the
 * GitHub-Releases check (`checkForUpdate`). The last-check time is persisted
 * back to settings so the next mount respects the interval. When a strictly
 * newer release is found that the user has not dismissed (`shouldShowBanner`),
 * the result is returned for the banner to render.
 *
 * Pure update logic (isCheckDue / shouldShowBanner / compareVersions) lives in
 * `lib/utils/updateChecker`; this hook only wires it to the settings seam +
 * the build-time `__APP_VERSION__`. It works in both modes: the GitHub
 * Releases API is a public endpoint (not `/api`), so the offline guard does
 * not block it.
 */

import { useCallback, useEffect, useState } from "react";

import { getStorage } from "../../storage";
import {
  checkForUpdate,
  isCheckDue,
  shouldShowBanner,
  type UpdateInterval,
} from "../../lib/utils/updateChecker";

/** Build-time app version (vite `define`, from package.json). */
const APP_VERSION = __APP_VERSION__;

export interface PendingUpdate {
  /** Latest published tag, e.g. "v0.57.0". */
  latestVersion: string;
  /** Link to the release page. */
  releaseUrl?: string;
  /** Raw Markdown release notes. */
  releaseNotes?: string;
}

interface UpdatesSettings {
  auto_check?: boolean;
  check_interval?: UpdateInterval;
  last_check_at?: string | null;
  dismissed_version?: string | null;
}

function readUpdates(config: Record<string, unknown>): UpdatesSettings {
  return (config.updates as UpdatesSettings | undefined) ?? {};
}

/**
 * Returns the pending update (or null) plus a `dismiss` that records the
 * dismissed version so the banner stays hidden until a strictly newer
 * release ships.
 */
export function useUpdateAutoCheck(): {
  pending: PendingUpdate | null;
  dismiss: () => void;
} {
  const [pending, setPending] = useState<PendingUpdate | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let updates: UpdatesSettings;
      try {
        updates = readUpdates(await getStorage().settings.getApp());
      } catch {
        return;
      }
      if (cancelled) return;
      const autoCheck = updates.auto_check !== false;
      const interval: UpdateInterval = updates.check_interval ?? "daily";
      if (!autoCheck || interval === "never") return;
      if (!isCheckDue(updates.last_check_at, interval, Date.now())) return;

      const result = await checkForUpdate(APP_VERSION);
      if (cancelled) return;

      // Persist the check time regardless of outcome so a transient
      // failure doesn't busy-loop the check on every mount.
      void getStorage()
        .settings.updateApp({
          updates: { ...updates, last_check_at: new Date().toISOString() },
        })
        .catch(() => {});

      if (
        result.status === "update-available" &&
        result.latestVersion &&
        shouldShowBanner(result.latestVersion, updates.dismissed_version)
      ) {
        setPending({
          latestVersion: result.latestVersion,
          releaseUrl: result.releaseUrl,
          releaseNotes: result.releaseNotes,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    const version = pending?.latestVersion;
    setPending(null);
    if (!version) return;
    void getStorage()
      .settings.getApp()
      .then((config) =>
        getStorage().settings.updateApp({
          updates: { ...readUpdates(config), dismissed_version: version },
        }),
      )
      .catch(() => {});
  }, [pending]);

  return { pending, dismiss };
}
