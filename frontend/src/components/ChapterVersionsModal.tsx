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
        <Dialog.Content className="radix-dialog-content" style={styles.content} data-testid="chapter-versions-modal">
          <div style={styles.header}>
            <Dialog.Title style={styles.title}>
              <History size={18} aria-hidden />
              {t("ui.versions.title", "Versionsverlauf")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="btn-icon" aria-label={t("ui.common.close", "Schließen")}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description style={styles.description}>
            {t("ui.versions.description", "Die letzten 20 gespeicherten Fassungen dieses Kapitels. Wiederherstellen überschreibt den aktuellen Inhalt - die aktuelle Fassung wird zuvor als neue Version gesichert.")}
          </Dialog.Description>
          {loading ? (
            <p style={styles.emptyState}>{t("ui.common.loading", "Laden...")}</p>
          ) : versions && versions.length === 0 ? (
            <p style={styles.emptyState} data-testid="chapter-versions-empty">
              {t("ui.versions.empty", "Noch keine älteren Fassungen vorhanden.")}
            </p>
          ) : versions ? (
            <ul style={styles.list} data-testid="chapter-versions-list">
              {versions.map((v) => (
                <li key={v.id} style={styles.item}>
                  <div style={styles.itemLine}>
                    <span style={styles.versionBadge}>v{v.version}</span>
                    <span style={styles.timestamp}>{new Date(v.created_at).toLocaleString()}</span>
                    <span style={styles.versionTitle}>{v.title}</span>
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

const styles: Record<string, React.CSSProperties> = {
  content: {maxWidth: "640px", width: "min(640px, 95vw)"},
  header: {display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem"},
  title: {display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.1rem", fontWeight: 600, margin: 0},
  description: {color: "var(--text-muted)", marginBottom: "1rem", lineHeight: 1.4, fontSize: "0.875rem"},
  emptyState: {color: "var(--text-muted)", textAlign: "center", padding: "1rem"},
  list: {listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: 380, overflow: "auto"},
  item: {display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-surface)"},
  itemLine: {display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, overflow: "hidden"},
  versionBadge: {fontFamily: "var(--font-mono, monospace)", fontSize: "0.75rem", color: "var(--text-muted)", flexShrink: 0},
  timestamp: {fontSize: "0.8rem", color: "var(--text-muted)", flexShrink: 0},
  versionTitle: {fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"},
};
