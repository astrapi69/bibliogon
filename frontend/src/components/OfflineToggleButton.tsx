/**
 * "Take offline" / "Remove offline" toggle (mobile-sync Phase 3, C3).
 *
 * Downloads a book's full graph into IndexedDB (or clears it). Lives in
 * the BookEditor sidebar via ChapterSidebar's `offlineSlot`. The heavy
 * offline-download module (which pulls in Dexie) is imported DYNAMICALLY
 * inside the handlers, so this button is safe to bundle on the desktop
 * without dragging IndexedDB into the main chunk. Only `isOfflineEnabled`
 * (a tiny localStorage read) is imported statically.
 */

import { useEffect, useState } from "react";
import { CloudDownload, CloudOff, Loader2 } from "lucide-react";
import { toast } from "react-toastify";

import { isOfflineEnabled } from "../storage/connectivity";
import { useI18n } from "../hooks/useI18n";

interface Props {
  bookId: string;
}

export function OfflineToggleButton({ bookId }: Props) {
  const { t } = useI18n();
  const [offline, setOffline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isOfflineEnabled()) {
      setOffline(false);
      return;
    }
    void import("../storage/offline-download").then(async (mod) => {
      const is = await mod.isBookOffline(bookId);
      if (!cancelled) setOffline(is);
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const takeOffline = async () => {
    setBusy(true);
    try {
      const mod = await import("../storage/offline-download");
      await mod.downloadBookOffline(bookId);
      setOffline(true);
      toast.success(t("ui.offline.taken", "Buch ist jetzt offline verfügbar."));
    } catch (err) {
      toast.error(
        `${t("ui.offline.error", "Offline-Aktion fehlgeschlagen.")} ${String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const removeOffline = async () => {
    setBusy(true);
    try {
      const mod = await import("../storage/offline-download");
      await mod.removeBookOffline(bookId);
      setOffline(false);
      toast.success(
        t("ui.offline.removed", "Buch aus dem Offline-Speicher entfernt."),
      );
    } catch (err) {
      toast.error(
        `${t("ui.offline.error", "Offline-Aktion fehlgeschlagen.")} ${String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  if (offline === null) return null; // resolving initial state

  return (
    <button
      className="btn-sidebar-block"
      style={{ marginBottom: 6 }}
      onClick={offline ? removeOffline : takeOffline}
      disabled={busy}
      data-testid="offline-toggle"
      data-offline={offline ? "true" : "false"}
      title={
        offline
          ? t("ui.offline.remove", "Offline entfernen")
          : t("ui.offline.take", "Offline nehmen")
      }
    >
      {busy ? (
        <Loader2 size={14} className="spin" />
      ) : offline ? (
        <CloudOff size={14} />
      ) : (
        <CloudDownload size={14} />
      )}{" "}
      {busy
        ? t("ui.offline.working", "Arbeitet …")
        : offline
          ? t("ui.offline.remove", "Offline entfernen")
          : t("ui.offline.take", "Offline nehmen")}
    </button>
  );
}

export default OfflineToggleButton;
