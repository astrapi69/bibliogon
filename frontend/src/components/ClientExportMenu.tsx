/**
 * Client-side export dropdown (Maximal-Offline P2).
 *
 * A backend-free "Export" menu offering the six client formats. Works in both
 * storage modes: on the offline build it is the only export path; online it
 * sits alongside the Pandoc export as a quick no-wait alternative.
 *
 * The caller supplies `getDocument` (resolving the book/article into the
 * shared ExportDocument) so this component stays entity-agnostic. Per the
 * Menu-Dialog lesson the items do not preventDefault — they open no dialog, so
 * Radix's default close-on-select is the wanted behaviour.
 */

import { useState } from "react";
import { Download } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import {
  EXPORT_FORMATS,
  downloadExport,
  type ExportDocument,
  type ExportFormat,
} from "../export";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/notify";

/** Format display names stay in English (Markdown / HTML / … are universal). */
const FORMAT_LABELS: Record<ExportFormat, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "Text",
  pdf: "PDF",
  epub: "EPUB",
  docx: "DOCX",
};

interface Props {
  /** Resolve the entity (book + chapters / article) into the export model. */
  getDocument: () => ExportDocument | Promise<ExportDocument>;
  disabled?: boolean;
  testId?: string;
}

export default function ClientExportMenu({ getDocument, disabled, testId }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function run(format: ExportFormat): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const doc = await getDocument();
      await downloadExport(doc, format);
      notify.success(t("ui.export.success", "Export erstellt."));
    } catch {
      notify.error(t("ui.export.failed", "Export fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  const label = t("ui.export.menu_label", "Exportieren");

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="btn btn-ghost"
          data-testid={testId ?? "client-export-trigger"}
          disabled={disabled || busy}
          aria-label={label}
        >
          <Download size={16} />
          <span className="hide-mobile">{label}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="hamburger-menu-content"
          align="end"
          sideOffset={4}
        >
          {EXPORT_FORMATS.map((format) => (
            <DropdownMenu.Item
              key={format}
              className="hamburger-menu-item"
              data-testid={`client-export-${format}`}
              onSelect={() => run(format)}
            >
              {FORMAT_LABELS[format]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
