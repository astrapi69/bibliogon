/**
 * Minimal chapter version history modal.
 *
 * Lists the backend-maintained `chapter_versions` snapshots (retention
 * = 20) with timestamps and a Restore button per entry. No diff view
 * in v1; users see a short visible-text preview in the dialog. The
 * restore endpoint snapshots the current state first, so restoring
 * never loses what the user currently has on screen.
 */
import {useEffect, useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {X, RotateCcw, History} from "lucide-react";
import {api, type ChapterVersionSummary} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import styles from "./ChapterVersionsModal.module.css";

interface Props {
  open: boolean;
  bookId: string;
  chapterId: string | null;
  onClose: () => void;
  onRestored: (chapterId: string) => void;
}

export default function ChapterVersionsModal({open, bookId, chapterId, onClose, onRestored}: Props) {
  const {t} = useI18n();
  const [versions, setVersions] = useState<ChapterVersionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !chapterId) return;
    setLoading(true);
    setVersions(null);
    api.chapters
      .listVersions(bookId, chapterId)
      .then((list) => setVersions(list))
      .catch(() => notify.error(t("ui.versions.load_failed", "Versionsverlauf konnte nicht geladen werden.")))
      .finally(() => setLoading(false));
  }, [open, bookId, chapterId, t]);

  const handleRestore = async (versionId: string) => {
    if (!chapterId) return;
    setRestoringId(versionId);
    try {
      await api.chapters.restoreVersion(bookId, chapterId, versionId);
      notify.success(t("ui.versions.restored", "Version wiederhergestellt."));
      onRestored(chapterId);
      onClose();
    } catch {
      notify.error(t("ui.versions.restore_failed", "Wiederherstellen fehlgeschlagen."));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-dialog-overlay" />
        <Dialog.Content className={`radix-dialog-content ${styles.content}`} data-testid="chapter-versions-modal">
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              <History size={18} aria-hidden />
              {t("ui.versions.title", "Versionsverlauf")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="btn-icon" aria-label={t("ui.common.close", "Schließen")}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.description}>
            {t("ui.versions.description", "Die letzten 20 gespeicherten Fassungen dieses Kapitels. Wiederherstellen überschreibt den aktuellen Inhalt - die aktuelle Fassung wird zuvor als neue Version gesichert.")}
          </Dialog.Description>
          {loading ? (
            <p className={styles.emptyState}>{t("ui.common.loading", "Laden...")}</p>
          ) : versions && versions.length === 0 ? (
            <p className={styles.emptyState} data-testid="chapter-versions-empty">
              {t("ui.versions.empty", "Noch keine älteren Fassungen vorhanden.")}
            </p>
          ) : versions ? (
            <ul className={styles.list} data-testid="chapter-versions-list">
              {versions.map((v) => (
                <li key={v.id} className={styles.item}>
                  <div className={styles.itemLine}>
                    <span className={styles.versionBadge}>v{v.version}</span>
                    <span className={styles.timestamp}>{new Date(v.created_at).toLocaleString()}</span>
                    <span className={styles.versionTitle}>{v.title}</span>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={restoringId !== null}
                    onClick={() => void handleRestore(v.id)}
                    data-testid={`chapter-version-restore-${v.version}`}
                  >
                    <RotateCcw size={12} aria-hidden />
                    {t("ui.versions.restore", "Wiederherstellen")}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
