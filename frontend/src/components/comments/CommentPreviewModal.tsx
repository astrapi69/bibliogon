/**
 * Detail-view modal for a single ArticleComment. Opens when the
 * user clicks a row in the Comments-Admin table; carries the full
 * body text (no truncation) plus all metadata and the two single-
 * item actions (Reclassify / Delete).
 *
 * Bug 4c (post-correction) deliberately keeps Reclassify ONLY in
 * this modal — out of the list row. The educational tooltip near
 * the Reclassify button is the user-onboarding surface for what
 * the action means.
 *
 * Pure-presentational: the parent owns the AppDialog.confirm()
 * gate inside the onReclassify / onDelete callbacks (per the
 * existing single-item handlers). The modal forwards the event
 * to those handlers and stays open until the parent closes it
 * via ``comment={null}``.
 */

import * as Dialog from "@radix-ui/react-dialog";
import { FileText, Trash2, X } from "lucide-react";

import type { ArticleComment } from "../../api/client";
import { formatLocaleDateTime } from "../../utils/formatDate";

interface Props {
  comment: ArticleComment | null;
  onClose: () => void;
  onReclassify: (comment: ArticleComment) => void;
  onDelete: (comment: ArticleComment) => void;
  /** True while the parent has a reclassify/delete API call
   *  in flight — disables both buttons. */
  pendingReclassify: boolean;
  pendingDelete: boolean;
  t: (key: string, fallback?: string) => string;
  lang: string;
}

function formatDate(iso: string | null, lang: string): string {
  return formatLocaleDateTime(iso, lang);
}

export default function CommentPreviewModal({
  comment,
  onClose,
  onReclassify,
  onDelete,
  pendingReclassify,
  pendingDelete,
  t,
  lang,
}: Props) {
  const open = comment !== null;
  const busy = pendingReclassify || pendingDelete;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onEscapeKeyDown={onClose}
          data-testid="comment-preview-modal"
          style={{ maxWidth: 640, width: "92vw" }}
          aria-describedby={undefined}
        >
          <div className="dialog-header">
            <Dialog.Title className="dialog-title">
              {t("ui.comments.admin.preview.title", "Kommentar-Details")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="btn-icon"
                onClick={onClose}
                aria-label={t("ui.common.close", "Schließen")}
                data-testid="comment-preview-close"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {comment && (
            <>
              <div
                style={{
                  padding: "12px 20px",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "6px 16px",
                  fontSize: "0.875rem",
                  color: "var(--text-secondary, #4b5563)",
                }}
                data-testid="comment-preview-metadata"
              >
                <span style={{ fontWeight: 600 }}>
                  {t("ui.comments.admin.col_author", "Author")}:
                </span>
                <span>
                  {comment.author?.trim() ||
                    t("ui.comments.admin.no_author", "Unknown")}
                </span>

                <span style={{ fontWeight: 600 }}>
                  {t("ui.comments.admin.col_source", "Source")}:
                </span>
                <span>{comment.imported_from}</span>

                <span style={{ fontWeight: 600 }}>
                  {t("ui.comments.admin.col_date", "Imported")}:
                </span>
                <span>{formatDate(comment.imported_at, lang)}</span>

                <span style={{ fontWeight: 600 }}>
                  {t("ui.comments.admin.col_status", "Status")}:
                </span>
                <span>
                  {comment.responds_to_article_id === null
                    ? t("ui.comments.admin.orphan", "Orphan")
                    : t("ui.comments.admin.linked", "Linked")}
                </span>

                {comment.responds_to_url && (
                  <>
                    <span style={{ fontWeight: 600 }}>
                      {t("ui.comments.admin.preview.parent_url", "Parent")}:
                    </span>
                    <a
                      href={comment.responds_to_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--accent, #2563eb)",
                        wordBreak: "break-all",
                      }}
                    >
                      {comment.responds_to_url}
                    </a>
                  </>
                )}
              </div>

              <div
                style={{
                  padding: "12px 20px",
                  borderTop: "1px solid var(--border, #e5e7eb)",
                  borderBottom: "1px solid var(--border, #e5e7eb)",
                  maxHeight: 320,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                  fontSize: "0.9375rem",
                }}
                data-testid="comment-preview-body"
              >
                {comment.body_text}
              </div>
            </>
          )}

          <div
            className="dialog-footer"
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            {/* Reclassify lives in the modal only (Bug 4c).
                            The native title attribute carries the
                            educational tooltip per D7. */}
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="comment-preview-reclassify"
              disabled={busy || !comment}
              onClick={() => {
                if (comment) onReclassify(comment);
              }}
              title={t(
                "ui.comments.admin.reclassify_tooltip",
                "Diese Aktion verschiebt den Kommentar in die Artikel-Sammlung. Nutze sie wenn die Import-Heuristik einen Artikel fälschlich als Kommentar klassifiziert hat.",
              )}
            >
              <FileText size={14} />{" "}
              {t("ui.comments.admin.reclassify_action", "Move to articles")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              data-testid="comment-preview-delete"
              disabled={busy || !comment}
              onClick={() => {
                if (comment) onDelete(comment);
              }}
            >
              <Trash2 size={14} />{" "}
              {t("ui.comments.admin.delete_action", "Delete comment")}
            </button>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              data-testid="comment-preview-close-footer"
            >
              {t("ui.common.close", "Schließen")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
