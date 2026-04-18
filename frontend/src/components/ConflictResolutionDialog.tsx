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
import {AlertTriangle, Save, X, RotateCcw} from "lucide-react";
import {useI18n} from "../hooks/useI18n";

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

export default function ConflictResolutionDialog({conflict, onKeepLocal, onDiscardLocal}: Props) {
  const {t} = useI18n();
  if (!conflict) return null;

  return (
    <Dialog.Root open={true}>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-dialog-overlay" />
        <Dialog.Content
          className="radix-dialog-content"
          data-testid="conflict-dialog"
          style={styles.content}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div style={styles.header}>
            <Dialog.Title style={styles.title}>
              <AlertTriangle size={18} aria-hidden />
              {t("ui.conflict.title", "Dieses Kapitel wurde anderswo geändert")}
            </Dialog.Title>
          </div>
          <Dialog.Description style={styles.description}>
            {t("ui.conflict.description", "Eine andere Änderung wurde gespeichert, bevor du deine Version abgeschickt hast. Wähle, was mit deinen lokalen Änderungen geschehen soll.")}
          </Dialog.Description>

          <div style={styles.panels}>
            <section style={styles.panel}>
              <h3 style={styles.panelTitle}>{t("ui.conflict.your_changes", "Deine Änderungen")}</h3>
              <pre style={styles.preview} data-testid="conflict-local-preview">
                {previewText(conflict.localContent)}
              </pre>
            </section>
            <section style={styles.panel}>
              <h3 style={styles.panelTitle}>
                {t("ui.conflict.server_version", "Server-Version")}
                {conflict.serverUpdatedAt ? (
                  <span style={styles.timestamp}> ({new Date(conflict.serverUpdatedAt).toLocaleString()})</span>
                ) : null}
              </h3>
              <pre style={styles.preview} data-testid="conflict-server-preview">
                {previewText(conflict.serverContent)}
              </pre>
            </section>
          </div>

          <div style={styles.actions}>
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
            {/* TODO: "Save as new chapter" - deferred from v1 */}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const styles: Record<string, React.CSSProperties> = {
  content: {maxWidth: "720px", width: "min(720px, 95vw)"},
  header: {display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem"},
  title: {display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.1rem", fontWeight: 600, margin: 0, color: "var(--warning, #b45309)"},
  description: {color: "var(--text-muted)", marginBottom: "1rem", lineHeight: 1.5},
  panels: {display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem"},
  panel: {border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem", background: "var(--bg-surface)", overflow: "hidden"},
  panelTitle: {fontSize: "0.85rem", fontWeight: 600, margin: "0 0 0.5rem 0", color: "var(--text)"},
  timestamp: {fontWeight: 400, color: "var(--text-muted)", fontSize: "0.75rem"},
  preview: {fontFamily: "inherit", fontSize: "0.8rem", margin: 0, maxHeight: "260px", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--text-muted)"},
  actions: {display: "flex", gap: "0.5rem", justifyContent: "flex-end", flexWrap: "wrap"},
};
