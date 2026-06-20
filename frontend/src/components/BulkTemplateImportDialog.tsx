import {useState} from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog"
import {X} from "lucide-react"
import {useI18n} from "../hooks/useI18n"
import {Toggle} from "./settings/Toggle"
import {notify} from "../utils/platform/notify"
import {api, ApiError, type BulkAiTemplateImportResult} from "../api/client"
import TemplateImportDropZone, {
    TemplateImportFilePreview,
} from "./TemplateImportDropZone"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 6/10. Reusable
// bulk-template import modal used by both dashboard bulk action
// flows. Takes a ZIP of .biblio.yaml files; each entry is
// reconciled to its target record by reference.id server-side.
// Per-entry failures surface in the response and the modal
// summarises them via the notify wrapper.

export type BulkImportKind = "article" | "book"

interface Props {
    open: boolean
    onClose: () => void
    kind: BulkImportKind
    /** Fires once the bulk import completes with at least one
     *  applied entry; parent uses it to clear selection /
     *  refresh the list. Errors do NOT trigger this. */
    onApplied?: (result: BulkAiTemplateImportResult) => void
}

export default function BulkTemplateImportDialog({
    open,
    onClose,
    kind,
    onApplied,
}: Props) {
    const {t} = useI18n()
    const [file, setFile] = useState<File | null>(null)
    const [force, setForce] = useState(false)
    const [busy, setBusy] = useState(false)

    const close = () => {
        if (busy) return
        setFile(null)
        setForce(false)
        onClose()
    }

    const handleSubmit = async () => {
        if (!file) return
        setBusy(true)
        try {
            const result =
                kind === "article"
                    ? await api.articles.bulkAiTemplate.import(file, force)
                    : await api.books.bulkAiTemplate.import(file, force)
            const imported = result.imported.length
            const failed = result.failed.length

            if (failed > 0 && imported === 0) {
                notify.error(
                    t(
                        "ui.ai_template.bulk_import.toast.all_failed",
                        "Bulk import: all {failed} entries failed",
                    ).replace("{failed}", String(failed)),
                )
            } else if (failed > 0) {
                notify.warning(
                    t(
                        "ui.ai_template.bulk_import.toast.partial",
                        "Bulk import: {imported} applied, {failed} failed",
                    )
                        .replace("{imported}", String(imported))
                        .replace("{failed}", String(failed)),
                )
            } else {
                notify.success(
                    t(
                        "ui.ai_template.bulk_import.toast.success",
                        "Bulk import: {imported} entr(y/ies) applied",
                    ).replace("{imported}", String(imported)),
                )
            }
            onApplied?.(result)
            setFile(null)
            setForce(false)
            onClose()
        } catch (err) {
            const detail =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.ai_template.bulk_import.toast.error",
                          "Bulk import failed",
                      )
            notify.error(detail, err)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) close()
            }}
        >
            <DialogContent
                size="wide"
                data-testid="bulk-template-import-dialog"
                onEscapeKeyDown={close}
            >
                    <DialogHeader>
                        <DialogTitle>
                            {t(
                                "ui.ai_template.bulk_import.title",
                                "Bulk import filled templates",
                            )}
                        </DialogTitle>
                        <DialogClose asChild>
                            <button
                                type="button"
                                className="btn-icon"
                                onClick={close}
                                aria-label={t("ui.common.close", "Schließen")}
                            >
                                <X size={16}/>
                            </button>
                        </DialogClose>
                    </DialogHeader>
                    <DialogDescription>
                        {t(
                            "ui.ai_template.bulk_import.description",
                            "Drop a .zip of filled .biblio.yaml files. Each entry is matched to its target record by reference.id; up to 50 entries per batch.",
                        )}
                    </DialogDescription>
                    <div style={{marginTop: 12}}>
                        <TemplateImportDropZone
                            mode="bulk"
                            onFile={setFile}
                            loading={busy}
                        />
                        {file && <TemplateImportFilePreview file={file}/>}
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
                            checked={force}
                            onChange={setForce}
                            testId="bulk-template-import-force"
                            label={t(
                                "ui.ai_template.bulk_import.force",
                                "Overwrite existing values",
                            )}
                            description={t(
                                "ui.ai_template.bulk_import.force_hint",
                                "Without this, populated fields on each target stay unchanged.",
                            )}
                        />
                    </div>
                    <DialogFooter sticky>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={close}
                            disabled={busy}
                            data-testid="bulk-template-import-cancel"
                        >
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={!file || busy}
                            data-testid="bulk-template-import-submit"
                        >
                            {t("ui.ai_template.bulk_import.submit", "Import")}
                        </button>
                    </DialogFooter>
                </DialogContent>
        </Dialog>
    )
}
