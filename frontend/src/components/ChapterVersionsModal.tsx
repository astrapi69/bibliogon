/**
 * Chapter version-history + snapshots modal (CHAPTER-SNAPSHOTS-01).
 *
 * Lists the backend `chapter_versions` rows: automatic version-history
 * snapshots (retention = 20) AND Scrivener-style manual named
 * snapshots (kept until deleted). The user can:
 *   - Take a named manual snapshot of the current saved state.
 *   - Restore any row (the restore endpoint snapshots the current
 *     state first, so restoring never loses what is on screen).
 *   - Delete a manual snapshot.
 *
 * The diff-vs-current view lives in C3.
 */
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, RotateCcw, History, Camera, Trash2, Bookmark } from "lucide-react";
import { api, type ChapterVersionSummary } from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { useDialog } from "./AppDialog";
import { notify } from "../utils/notify";
import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./ChapterVersionsModal.module.css";

interface Props {
  open: boolean;
  bookId: string;
  chapterId: string | null;
  onClose: () => void;
  onRestored: (chapterId: string) => void;
}

export default function ChapterVersionsModal({
  open,
  bookId,
  chapterId,
  onClose,
  onRestored,
}: Props) {
  const { t } = useI18n();
  const dialog = useDialog();
  const [versions, setVersions] = useState<ChapterVersionSummary[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    if (!chapterId) return;
    setLoading(true);
    try {
      const list = await api.chapters.listVersions(bookId, chapterId);
      setVersions(list);
    } catch {
      notify.error(
        t(
          "ui.versions.load_failed",
          "Versionsverlauf konnte nicht geladen werden.",
        ),
      );
    } finally {
      setLoading(false);
    }
    // ``t`` is only used in the failure toast; including it would make
    // ``reload`` change identity on every render (the i18n provider is
    // not memoised under test) and refire the load effect endlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapterId]);

  useEffect(() => {
    if (!open || !chapterId) return;
    setVersions(null);
    setSnapshotName("");
    void reload();
  }, [open, chapterId, reload]);

  const handleTakeSnapshot = async () => {
    if (!chapterId || creating) return;
    setCreating(true);
    try {
      await api.chapters.createSnapshot(
        bookId,
        chapterId,
        snapshotName.trim() || null,
      );
      notify.success(t("ui.versions.snapshot_taken", "Snapshot erstellt."));
      setSnapshotName("");
      await reload();
    } catch {
      notify.error(
        t(
          "ui.versions.snapshot_failed",
          "Snapshot konnte nicht erstellt werden.",
        ),
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    if (!chapterId) return;
    const ok = await dialog.confirm(
      t("ui.versions.restore_confirm_title", "Version wiederherstellen?"),
      t(
        "ui.versions.restore_confirm_message",
        "Der aktuelle Inhalt wird überschrieben. Die aktuelle Fassung wird zuvor automatisch als neue Version gesichert.",
      ),
    );
    if (!ok) return;
    setBusyId(versionId);
    try {
      await api.chapters.restoreVersion(bookId, chapterId, versionId);
      notify.success(t("ui.versions.restored", "Version wiederhergestellt."));
      onRestored(chapterId);
      onClose();
    } catch {
      notify.error(
        t("ui.versions.restore_failed", "Wiederherstellen fehlgeschlagen."),
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (versionId: string) => {
    if (!chapterId) return;
    const ok = await dialog.confirm(
      t("ui.versions.delete_confirm_title", "Snapshot löschen?"),
      t(
        "ui.versions.delete_confirm_message",
        "Dieser Snapshot wird dauerhaft entfernt.",
      ),
      "danger",
    );
    if (!ok) return;
    setBusyId(versionId);
    try {
      await api.chapters.deleteVersion(bookId, chapterId, versionId);
      notify.success(t("ui.versions.deleted", "Snapshot gelöscht."));
      await reload();
    } catch {
      notify.error(t("ui.versions.delete_failed", "Löschen fehlgeschlagen."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="radix-dialog-overlay" />
        <Dialog.Content
          className={`radix-dialog-content ${styles.content}`}
          data-testid="chapter-versions-modal"
        >
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              <History size={18} aria-hidden />
              {t("ui.versions.title", "Versionsverlauf")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="btn-icon"
                aria-label={t("ui.common.close", "Schließen")}
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.description}>
            {t(
              "ui.versions.description",
              "Die letzten 20 automatisch gespeicherten Fassungen plus deine manuellen Snapshots. Wiederherstellen überschreibt den aktuellen Inhalt - die aktuelle Fassung wird zuvor als neue Version gesichert.",
            )}
          </Dialog.Description>

          <div className={styles.takeRow}>
            <input
              type="text"
              className="input"
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder={t(
                "ui.versions.snapshot_name_placeholder",
                "Snapshot-Name (optional)",
              )}
              maxLength={200}
              data-testid="chapter-snapshot-name"
              disabled={creating}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void handleTakeSnapshot()}
              disabled={creating}
              data-testid="chapter-snapshot-create"
            >
              <Camera size={14} aria-hidden />
              {t("ui.versions.take_snapshot", "Snapshot erstellen")}
            </button>
          </div>

          {loading ? (
            <LoadingIndicator
              testId="chapter-versions-loading"
              variant="block"
              label={t("ui.common.loading", "Laden...")}
            />
          ) : versions && versions.length === 0 ? (
            <p
              className={styles.emptyState}
              data-testid="chapter-versions-empty"
            >
              {t(
                "ui.versions.empty",
                "Noch keine älteren Fassungen vorhanden.",
              )}
            </p>
          ) : versions ? (
            <ul className={styles.list} data-testid="chapter-versions-list">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className={styles.item}
                  data-testid={`chapter-version-item-${v.id}`}
                >
                  <div className={styles.itemLine}>
                    {v.is_manual ? (
                      <span
                        className={styles.snapshotBadge}
                        data-testid={`chapter-version-manual-${v.id}`}
                      >
                        <Bookmark size={11} aria-hidden />
                        {t("ui.versions.snapshot_badge", "Snapshot")}
                      </span>
                    ) : (
                      <span className={styles.versionBadge}>v{v.version}</span>
                    )}
                    <span className={styles.timestamp}>
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                    <span className={styles.versionTitle}>
                      {v.name || v.title}
                    </span>
                  </div>
                  <div className={styles.actions}>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busyId !== null}
                      onClick={() => void handleRestore(v.id)}
                      data-testid={`chapter-version-restore-${v.id}`}
                    >
                      <RotateCcw size={12} aria-hidden />
                      {t("ui.versions.restore", "Wiederherstellen")}
                    </button>
                    {v.is_manual ? (
                      <button
                        className="btn-icon"
                        disabled={busyId !== null}
                        onClick={() => void handleDelete(v.id)}
                        aria-label={t("ui.versions.delete", "Snapshot löschen")}
                        data-testid={`chapter-version-delete-${v.id}`}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
