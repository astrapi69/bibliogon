/**
 * SyncStatusWatcher — activates offline sync on reconnect (P3-C9).
 *
 * Headless: mounted once in App.tsx. It subscribes to connectivity via
 * useStorageMode and, on an offline -> online transition, drains the
 * offline write queue against the API (processSyncQueue) and toasts the
 * outcome. The visible offline state is shown by the existing
 * <OfflineBanner>; this component is the wiring that makes the C1-C7
 * sync engine actually run.
 *
 * Desktop-safe: useStorageMode only starts the connectivity monitor when
 * offline capability is enabled (a book was taken offline). On the normal
 * desktop it never monitors, never reconnect-syncs, and the heavy
 * sync-engine module is dynamically imported only inside the handler.
 */

import { useCallback } from "react";
import { toast } from "react-toastify";

import { useI18n } from "../hooks/useI18n";
import { useStorageMode } from "../storage/useStorageMode";

export default function SyncStatusWatcher() {
  const { t } = useI18n();

  const onReconnect = useCallback(async () => {
    const { processSyncQueue } = await import("../storage/sync-engine");
    const result = await processSyncQueue();
    if (result.synced > 0) {
      toast.success(
        t("ui.offline.synced_toast", "Kapitel synchronisiert: {count}").replace(
          "{count}",
          String(result.synced),
        ),
      );
    }
    if (result.conflicts.length > 0) {
      toast.warning(
        t(
          "ui.offline.conflicts_found",
          "Konflikt gefunden. Bitte in den Einstellungen lösen.",
        ),
      );
    }
    if (result.failed > 0) {
      toast.error(
        t(
          "ui.offline.sync_partial",
          "Einige Änderungen konnten nicht synchronisiert werden.",
        ),
      );
    }
  }, [t]);

  useStorageMode({ onReconnect });
  return null;
}
