/**
 * 409 version-conflict dialog.
 *
 * Shown when PATCH /chapters rejects a save because the server moved
 * on (another tab, another device, a reconnect flush race). The user
 * picks between keeping their local edit (force-save with the new
 * server version) or discarding it (pull the server content into the
 * editor).
 *
 * Side-by-side plain-text preview for v1. A real inline diff can come
 * later; the critical thing is that no content is silently lost.
 */
import * as Dialog from "@radix-ui/react-dialog";
import {AlertTriangle, Save, RotateCcw, FilePlus} from "lucide-react";
import {useI18n} from "../hooks/useI18n";
import styles from "./ConflictResolutionDialog.module.css";

export interface ConflictInfo {
  chapterId: string;
  localContent: string;   // JSON string from the editor
  serverContent: string;  // JSON string from the server
  serverVersion: number;
  serverTitle?: string;
  serverUpdatedAt?: string;
}

interface Props {
  conflict: ConflictInfo | null;
  onKeepLocal: (info: ConflictInfo) => void | Promise<void>;
  onDiscardLocal: (info: ConflictInfo) => void | Promise<void>;
  /** PS-13 third option: fork the local edit into a NEW chapter
   *  inserted after the current one, then load the server content
   *  into the editor. Optional so existing tests + callers stay
   *  backward-compatible; the button is hidden when this prop is
   *  not supplied. */
  onSaveAsNewChapter?: (info: ConflictInfo) => void | Promise<void>;
}

/** Extract the visible text of a TipTap JSON doc for a rough preview.
 *  Returns the raw string on parse failure so at least something shows.
 */
function previewText(content: string): string {
  try {
    const doc = JSON.parse(content);
    const parts: string[] = [];
    const walk = (node: {type?: string; text?: string; content?: unknown[]}) => {
      if (node.text) parts.push(node.text);
      if (Array.isArray(node.content)) {
        for (const c of node.content) walk(c as {type?: string; text?: string; content?: unknown[]});
      }
    };
    walk(doc);
    return parts.join("\n").trim() || "(empty)";
  } catch {
    return content.slice(0, 1000);
  }
}

export default function ConflictResolutionDialog({conflict, onKeepLocal, onDiscardLocal, onSaveAsNewChapter}: Props) {
  const {t} = useI18n();
  if (!conflict) return null;

  return (
    <Dialog.Root open={true}>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-dialog-overlay" />
        <Dialog.Content
          className={`radix-dialog-content ${styles.content}`}
          data-testid="conflict-dialog"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              <AlertTriangle size={18} aria-hidden />
              {t("ui.conflict.title", "Dieses Kapitel wurde anderswo geändert")}
            </Dialog.Title>
          </div>
          <Dialog.Description className={styles.description}>
            {t("ui.conflict.description", "Eine andere Änderung wurde gespeichert, bevor du deine Version abgeschickt hast. Wähle, was mit deinen lokalen Änderungen geschehen soll.")}
          </Dialog.Description>

          <div className={styles.panels}>
            <section className={styles.panel}>
              <h3 className={styles.panelTitle}>{t("ui.conflict.your_changes", "Deine Änderungen")}</h3>
              <pre className={styles.preview} data-testid="conflict-local-preview">
                {previewText(conflict.localContent)}
              </pre>
            </section>
            <section className={styles.panel}>
              <h3 className={styles.panelTitle}>
                {t("ui.conflict.server_version", "Server-Version")}
                {conflict.serverUpdatedAt ? (
                  <span className={styles.timestamp}> ({new Date(conflict.serverUpdatedAt).toLocaleString()})</span>
                ) : null}
              </h3>
              <pre className={styles.preview} data-testid="conflict-server-preview">
                {previewText(conflict.serverContent)}
              </pre>
            </section>
          </div>

          <div className={styles.actions}>
            <button
              className="btn btn-primary"
              onClick={() => void onKeepLocal(conflict)}
              data-testid="conflict-keep"
            >
              <Save size={14} aria-hidden />
              {t("ui.conflict.keep_local", "Meine Änderungen behalten")}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => void onDiscardLocal(conflict)}
              data-testid="conflict-discard"
            >
              <RotateCcw size={14} aria-hidden />
              {t("ui.conflict.discard_local", "Meine Änderungen verwerfen")}
            </button>
            {onSaveAsNewChapter && (
              <button
                className="btn btn-secondary"
                onClick={() => void onSaveAsNewChapter(conflict)}
                data-testid="conflict-save-as-new"
                title={t(
                  "ui.conflict.save_as_new_chapter_tooltip",
                  "Lokale Änderungen als neues Kapitel direkt nach diesem speichern; das aktuelle Kapitel behält die Server-Version.",
                )}
              >
                <FilePlus size={14} aria-hidden />
                {t("ui.conflict.save_as_new_chapter", "Als neues Kapitel speichern")}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
