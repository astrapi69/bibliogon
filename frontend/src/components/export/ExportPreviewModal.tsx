/**
 * Export preview modal (#316).
 *
 * Renders the client-side HTML export (`toHtml`, the same TipTap -> HTML path
 * the HTML/PDF exports use) in a sandboxed iframe so authors can see the
 * formatted result — title, author, chapter structure, body with clean
 * print-style typography — before exporting. No backend, no real PDF renderer:
 * it reuses the existing export model, so it works online and offline.
 *
 * Positioned with explicit Tailwind utilities (not undefined CSS-module
 * classes) so it is actually visible — see the "Coverage Illusion" lesson
 * where a modal relied on never-defined `radix-dialog-*` classes.
 */

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { useI18n } from "../../hooks/useI18n";
import type { ExportDocument } from "../../export";
import { toHtml } from "../../export/formatHtml";

interface ExportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** The export model to preview; null renders an empty frame. */
  doc: ExportDocument | null;
}

export default function ExportPreviewModal({
  open,
  onClose,
  doc,
}: ExportPreviewModalProps) {
  const { t } = useI18n();
  const html = doc ? toHtml(doc) : "";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[201] flex h-[85vh] w-[90vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col rounded bg-card shadow-[var(--shadow-lg)]"
          data-testid="export-preview-modal"
        >
          <div
            className="flex items-center justify-between border-b px-4 py-2"
            style={{ borderColor: "var(--border)" }}
          >
            <Dialog.Title className="text-sm font-semibold">
              {t("ui.export.preview_title", "Export-Vorschau")}
              {doc?.title ? ` — ${doc.title}` : ""}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {t(
                "ui.export.preview_desc",
                "Formatierte Vorschau Ihres Exports.",
              )}
            </Dialog.Description>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("ui.common.close", "Schließen")}
              className="btn btn-ghost btn-sm min-h-[44px]"
              data-testid="export-preview-close"
            >
              <X size={16} />
            </button>
          </div>
          <iframe
            title={t("ui.export.preview_title", "Export-Vorschau")}
            srcDoc={html}
            sandbox=""
            className="min-h-0 flex-1 w-full rounded-b border-0 bg-white"
            data-testid="export-preview-frame"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
