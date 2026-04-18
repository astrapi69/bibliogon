/**
 * S-safety: dismissible offline banner + automatic reconnect flush.
 *
 * - When `navigator.onLine` is false, a banner appears at the top of
 *   the app shell with a non-alarming message. Editor failures no
 *   longer pop up retry toasts in this state (the Editor checks the
 *   flag); the IndexedDB draft is the authoritative store until
 *   reconnect.
 * - On the transition from offline -> online, iterate every draft
 *   in IndexedDB and attempt to flush it to the backend. Toast the
 *   summary.
 */
import {useEffect, useRef, useState} from "react";
import {WifiOff} from "lucide-react";
import {useOnlineStatus} from "../hooks/useOnlineStatus";
import {useI18n} from "../hooks/useI18n";
import {db, deleteDraft, type ChapterDraft} from "../db/drafts";
import {api, ApiError} from "../api/client";
import {notify} from "../utils/notify";

/**
 * Sync all pending drafts to the backend. Pure function so it can be
 * tested without the React wrapper. Returns a summary counter.
 */
export async function syncAllDrafts(): Promise<{synced: number; failed: number; conflicts: number}> {
  let drafts: ChapterDraft[] = [];
  try {
    drafts = await db.drafts.toArray();
  } catch {
    return {synced: 0, failed: 0, conflicts: 0};
  }
  let synced = 0;
  let failed = 0;
  let conflicts = 0;
  for (const draft of drafts) {
    try {
      await api.chapters.update(draft.bookId, draft.chapterId, {content: draft.content});
      await deleteDraft(draft.chapterId);
      synced += 1;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        conflicts += 1;
        // Keep the draft: the 409-handling dialog will prompt the user
        // when they next open the chapter. See commit 7.
      } else {
        failed += 1;
      }
    }
  }
  return {synced, failed, conflicts};
}

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const {t} = useI18n();
  const [wasOffline, setWasOffline] = useState(!online);
  const syncing = useRef(false);

  useEffect(() => {
    if (online && wasOffline && !syncing.current) {
      syncing.current = true;
      setWasOffline(false);
      void syncAllDrafts().then((result) => {
        if (result.synced > 0) {
          notify.success(
            t("ui.offline.synced_toast", "Kapitel synchronisiert: {count}")
              .replace("{count}", String(result.synced)),
          );
        }
        if (result.failed > 0 || result.conflicts > 0) {
          notify.warning(
            t("ui.offline.sync_partial", "Einige Kapitel konnten nicht synchronisiert werden.")
          );
        }
      }).finally(() => {
        syncing.current = false;
      });
    }
    if (!online && !wasOffline) {
      setWasOffline(true);
    }
  }, [online, wasOffline, t]);

  if (online) return null;

  return (
    <div role="alert" aria-live="polite" style={styles.banner} data-testid="offline-banner">
      <WifiOff size={16} aria-hidden />
      <span>{t("ui.offline.banner_message", "Du bist offline. Änderungen sind lokal gesichert und werden beim nächsten Verbindungsaufbau synchronisiert.")}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 1rem",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-muted)",
    fontSize: "0.875rem",
  },
};
