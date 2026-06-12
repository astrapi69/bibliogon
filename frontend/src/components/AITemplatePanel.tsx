import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Sparkles, Download, Upload, X } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useStorageMode } from "../storage/useStorageMode";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../features/featureConfig";
import { Toggle } from "./settings/Toggle";
import { notify } from "../utils/notify";
import { api, ApiError } from "../api/client";
import type { AiFillResponse, AiTemplateImportResult } from "../api/client";
import { aiFillArticle, aiFillBook } from "../ai/aiFill";
import { ARTICLE_OFFLINE_FILL_CLASSES } from "../ai/articleFillPrompts";
import { BOOK_OFFLINE_FILL_CLASSES } from "../ai/bookFillPrompts";
import FieldClassDialog, { type FieldClassDialogResult } from "./FieldClassDialog";
import TemplateImportDropZone, { TemplateImportFilePreview } from "./TemplateImportDropZone";

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 3/10. Three first-
// class buttons that orchestrate the per-record AI-template
// workflows for one article or one book. Consumed by the article +
// book editor sidebars (commits 4 + 5) and by any other surface
// that wants to expose the same workflows for a single record.
//
// The panel itself owns no AI-config / endpoint knowledge - it just
// dispatches to api.{articles,books}.aiTemplate.* and api.{...}.aiFill
// based on the ``kind`` prop. Toast feedback uses the project's
// notify wrapper so error toasts get the "Report Issue" link.

export type AITemplateKind = "article" | "book";

interface Props {
    kind: AITemplateKind;
    /** The record id (article or book). */
    id: string;
    /** Called after a successful Fill or Import so the parent can
     *  refresh its local state (the panel does not own the record). */
    onApplied?: () => void;
    /** Optional layout hint. ``compact`` reduces the button padding
     *  for tight sidebar real estate. */
    layout?: "default" | "compact";
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export default function AITemplatePanel({ kind, id, onApplied, layout = "default" }: Props) {
    const { t } = useI18n();
    const { mode } = useStorageMode();
    const offline = mode === "dexie";
    const aiFill = useFeature(FEATURES.AI_FILL);
    const fileIo = useFeature(FEATURES.AI_TEMPLATE_FILE_IO);
    const namespace = kind === "article" ? api.articles : api.books;

    const offlineSupportedClasses =
        kind === "article" ? ARTICLE_OFFLINE_FILL_CLASSES : BOOK_OFFLINE_FILL_CLASSES;
    const fillTitle = aiFill.isDisabled
        ? t(
              "ui.ai_template.offline_configure_key",
              "Configure your API key in Settings > AI to use Fill offline.",
          )
        : undefined;

    // Per-button loading flags so the user can tell which action is
    // in flight when they kicked off two close together (rare, but
    // explicit beats ambiguous).
    const [fillLoading, setFillLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [importLoading, setImportLoading] = useState(false);

    const [showFillDialog, setShowFillDialog] = useState(false);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importForce, setImportForce] = useState(false);

    // ----- Fill -----

    const handleFillSubmit = async (req: FieldClassDialogResult) => {
        setFillLoading(true);
        try {
            const result = offline
                ? kind === "article"
                    ? await aiFillArticle(id, req)
                    : await aiFillBook(id, req)
                : ((await namespace.aiFill(id, req)) as AiFillResponse);
            const updated = result.updated_fields.length;
            const skipped = result.skipped_fields.length;
            const errors = Object.keys(result.field_class_errors).length;

            if (errors > 0) {
                notify.warning(
                    t(
                        "ui.ai_template.fill.toast.partial",
                        "AI-fill: {updated} updated, {skipped} skipped, {errors} class errors",
                    )
                        .replace("{updated}", String(updated))
                        .replace("{skipped}", String(skipped))
                        .replace("{errors}", String(errors)),
                );
            } else {
                notify.success(
                    t(
                        "ui.ai_template.fill.toast.success",
                        "AI-fill: {updated} field(s) updated, {skipped} skipped ({tokens} tokens)",
                    )
                        .replace("{updated}", String(updated))
                        .replace("{skipped}", String(skipped))
                        .replace("{tokens}", String(result.tokens_used)),
                );
            }
            setShowFillDialog(false);
            onApplied?.();
        } catch (err) {
            const detail =
                err instanceof ApiError
                    ? err.detail
                    : err instanceof Error
                      ? err.message
                      : t("ui.ai_template.fill.toast.error", "AI-fill failed");
            notify.error(detail, err);
        } finally {
            setFillLoading(false);
        }
    };

    // ----- Export -----

    const handleExport = async () => {
        setExportLoading(true);
        try {
            const { blob, filename } = await namespace.aiTemplate.export(id);
            downloadBlob(blob, filename);
            notify.success(
                t("ui.ai_template.export.toast.success", "Template exported: {filename}").replace(
                    "{filename}",
                    filename,
                ),
            );
        } catch (err) {
            const detail =
                err instanceof ApiError
                    ? err.detail
                    : t("ui.ai_template.export.toast.error", "Export failed");
            notify.error(detail, err);
        } finally {
            setExportLoading(false);
        }
    };

    // ----- Import -----

    const openImportDialog = () => {
        setImportFile(null);
        setImportForce(false);
        setShowImportDialog(true);
    };

    const closeImportDialog = () => {
        setShowImportDialog(false);
    };

    const handleImportSubmit = async () => {
        if (!importFile) return;
        setImportLoading(true);
        try {
            const yamlText = await importFile.text();
            const result = (await namespace.aiTemplate.import(
                id,
                yamlText,
                importForce,
            )) as AiTemplateImportResult;
            const updated = result.updated_fields.length;
            const skipped = result.skipped_fields.length;
            const dropped = result.dropped_chapter_summaries?.length ?? 0;

            if (updated === 0) {
                notify.info(
                    t(
                        "ui.ai_template.import.toast.noop",
                        "Import complete: no fields updated ({skipped} skipped)",
                    ).replace("{skipped}", String(skipped)),
                );
            } else {
                notify.success(
                    t(
                        "ui.ai_template.import.toast.success",
                        "Import complete: {updated} field(s) updated, {skipped} skipped",
                    )
                        .replace("{updated}", String(updated))
                        .replace("{skipped}", String(skipped)),
                );
            }
            if (dropped > 0) {
                // Surface the reconciliation drops as a follow-up
                // info toast - book-only, but harmless on articles.
                notify.info(
                    t(
                        "ui.ai_template.import.toast.dropped_summaries",
                        "{dropped} chapter summary entr(y/ies) could not be matched and were dropped",
                    ).replace("{dropped}", String(dropped)),
                );
            }
            setShowImportDialog(false);
            onApplied?.();
        } catch (err) {
            const detail =
                err instanceof ApiError
                    ? err.detail
                    : t("ui.ai_template.import.toast.error", "Import failed");
            notify.error(detail, err);
        } finally {
            setImportLoading(false);
        }
    };

    const btnClass = layout === "compact" ? "btn btn-secondary btn-sm" : "btn btn-secondary";

    return (
        <div
            data-testid="ai-template-panel"
            data-kind={kind}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 12,
                background: "var(--surface-2, #f7f7f8)",
                borderRadius: 8,
                border: "1px solid var(--border, #e5e7eb)",
            }}
        >
            <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                {t("ui.ai_template.panel.title", "AI Template")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                    type="button"
                    className={btnClass}
                    onClick={() => setShowFillDialog(true)}
                    disabled={fillLoading || aiFill.isDisabled}
                    title={fillTitle}
                    data-testid="ai-template-fill"
                >
                    <Sparkles size={14} style={{ marginRight: 6 }} />
                    {t("ui.ai_template.panel.fill", "Fill with AI")}
                </button>
                {!fileIo.isHidden && (
                    <>
                        <button
                            type="button"
                            className={btnClass}
                            onClick={handleExport}
                            disabled={exportLoading}
                            data-testid="ai-template-export"
                        >
                            <Download size={14} style={{ marginRight: 6 }} />
                            {t("ui.ai_template.panel.export", "Export template")}
                        </button>
                        <button
                            type="button"
                            className={btnClass}
                            onClick={openImportDialog}
                            disabled={importLoading}
                            data-testid="ai-template-import"
                        >
                            <Upload size={14} style={{ marginRight: 6 }} />
                            {t("ui.ai_template.panel.import", "Import filled template")}
                        </button>
                    </>
                )}
            </div>

            <FieldClassDialog
                open={showFillDialog}
                onClose={() => setShowFillDialog(false)}
                onSubmit={handleFillSubmit}
                kind={kind}
                availableClasses={offline ? offlineSupportedClasses : undefined}
                loading={fillLoading}
            />

            <Dialog.Root
                open={showImportDialog}
                onOpenChange={(open) => {
                    if (!open) closeImportDialog();
                }}
            >
                <Dialog.Portal>
                    <Dialog.Overlay className="dialog-overlay" />
                    <Dialog.Content
                        className="dialog-content dialog-content-wide"
                        data-testid="ai-template-import-dialog"
                        onEscapeKeyDown={closeImportDialog}
                    >
                        <div className="dialog-header">
                            <Dialog.Title className="dialog-title">
                                {t("ui.ai_template.import_dialog.title", "Import filled template")}
                            </Dialog.Title>
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={closeImportDialog}
                                    aria-label={t("ui.common.close", "Schließen")}
                                >
                                    <X size={16} />
                                </button>
                            </Dialog.Close>
                        </div>
                        <Dialog.Description className="dialog-message">
                            {t(
                                "ui.ai_template.import_dialog.description",
                                "Drop a filled .biblio.yaml here. The template's reference.id must match this record.",
                            )}
                        </Dialog.Description>
                        <div style={{ marginTop: 12 }}>
                            <TemplateImportDropZone
                                mode="single"
                                onFile={setImportFile}
                                loading={importLoading}
                            />
                            {importFile && <TemplateImportFilePreview file={importFile} />}
                        </div>
                        <div
                            style={{
                                marginTop: 12,
                                padding: "8px 12px",
                                background: "var(--surface-2, #f5f5f5)",
                                borderRadius: 6,
                            }}
                        >
                            <Toggle
                                testId="ai-template-import-force"
                                checked={importForce}
                                onChange={setImportForce}
                                label={t(
                                    "ui.ai_template.import_dialog.force",
                                    "Overwrite existing values",
                                )}
                                description={t(
                                    "ui.ai_template.import_dialog.force_hint",
                                    "Without this, populated fields stay unchanged.",
                                )}
                            />
                        </div>
                        <div className="dialog-footer" style={{ marginTop: 16 }}>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={closeImportDialog}
                                disabled={importLoading}
                                data-testid="ai-template-import-cancel"
                            >
                                {t("ui.common.cancel", "Abbrechen")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleImportSubmit}
                                disabled={!importFile || importLoading}
                                data-testid="ai-template-import-submit"
                            >
                                {t("ui.ai_template.import_dialog.submit", "Import")}
                            </button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </div>
    );
}
