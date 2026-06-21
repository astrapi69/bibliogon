import {useCallback, useRef, useState} from "react"
import {Upload, FileText, AlertTriangle} from "lucide-react"
import {useI18n} from "../../hooks/useI18n"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 2/10.
//
// Drag-and-drop + file-picker zone for the "Import filled template"
// workflow. Single-mode accepts ``.biblio.yaml``; bulk-mode accepts
// ``.zip``. Invalid extensions surface an inline error and the parent
// never sees the file - the dialog stays open so the user can try
// again without losing context.

export type ImportMode = "single" | "bulk"

interface Props {
    mode: ImportMode
    onFile: (file: File) => void
    loading?: boolean
    /** Optional label override; defaults vary by mode. */
    label?: string
    /** Force toggle is owned by the parent because the same toggle
     *  drives both single + bulk imports; this component just
     *  surfaces the file. */
}

function isValidName(name: string, mode: ImportMode): boolean {
    const lower = name.toLowerCase()
    if (mode === "bulk") return lower.endsWith(".zip")
    return lower.endsWith(".biblio.yaml") || lower.endsWith(".biblio.yml")
}

export default function TemplateImportDropZone({
    mode,
    onFile,
    loading = false,
    label,
}: Props) {
    const {t} = useI18n()
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [dragging, setDragging] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleFile = useCallback(
        (file: File | undefined) => {
            if (!file) return
            if (!isValidName(file.name, mode)) {
                setError(
                    mode === "bulk"
                        ? t(
                              "ui.ai_template.dropzone.error_bulk",
                              "Please drop a .zip file produced by 'Bulk export templates'.",
                          )
                        : t(
                              "ui.ai_template.dropzone.error_single",
                              "Please drop a .biblio.yaml file.",
                          ),
                )
                return
            }
            setError(null)
            onFile(file)
        },
        [mode, onFile, t],
    )

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        if (!dragging) setDragging(true)
    }

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
    }

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0]
        handleFile(file)
    }

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        handleFile(file)
        // Reset the input so re-dropping the same file fires onChange.
        e.target.value = ""
    }

    const acceptAttr = mode === "bulk" ? ".zip" : ".biblio.yaml,.yml,.yaml"
    const defaultLabel =
        mode === "bulk"
            ? t(
                  "ui.ai_template.dropzone.label_bulk",
                  "Drop a .zip of templates here, or click to choose a file",
              )
            : t(
                  "ui.ai_template.dropzone.label_single",
                  "Drop a .biblio.yaml here, or click to choose a file",
              )

    return (
        <div
            data-testid="template-import-dropzone"
            data-mode={mode}
            data-dragging={dragging || undefined}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => !loading && inputRef.current?.click()}
            onKeyDown={(e) => {
                if (loading) return
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    inputRef.current?.click()
                }
            }}
            role="button"
            tabIndex={0}
            style={{
                cursor: loading ? "wait" : "pointer",
                border: `2px dashed ${dragging ? "var(--accent, #2563eb)" : "var(--border, #d1d5db)"}`,
                borderRadius: 8,
                padding: 24,
                textAlign: "center",
                background: dragging ? "var(--surface-2, #f1f5f9)" : "transparent",
                transition: "border 0.15s, background 0.15s",
                opacity: loading ? 0.6 : 1,
            }}
            aria-label={label ?? defaultLabel}
        >
            <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: 8}}>
                <Upload size={28} aria-hidden="true"/>
                <div style={{fontWeight: 500}}>{label ?? defaultLabel}</div>
                <div style={{fontSize: "0.75rem", color: "var(--text-muted, #6b7280)", fontFamily: "monospace"}}>
                    {mode === "bulk" ? ".zip" : ".biblio.yaml"}
                </div>
                {error && (
                    <div
                        data-testid="template-import-dropzone-error"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 6,
                            padding: "6px 10px",
                            background: "var(--danger-bg, #fef2f2)",
                            color: "var(--danger, #b91c1c)",
                            borderRadius: 4,
                            fontSize: "0.875rem",
                        }}
                    >
                        <AlertTriangle size={14} aria-hidden="true"/>
                        <span>{error}</span>
                    </div>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept={acceptAttr}
                onChange={onInputChange}
                data-testid="template-import-dropzone-input"
                style={{display: "none"}}
            />
        </div>
    )
}

// Re-export for unit tests that want to check the extension
// validator in isolation.
export const _isValidName = isValidName

// Small icon-only file-name preview that callers can render after the
// dropzone produces a file. Keeps the dropzone uncluttered.
export function TemplateImportFilePreview({file}: {file: File}) {
    return (
        <div
            data-testid="template-import-file-preview"
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
                padding: "8px 12px",
                background: "var(--surface-2, #f1f5f9)",
                borderRadius: 6,
                fontSize: "0.875rem",
            }}
        >
            <FileText size={14} aria-hidden="true"/>
            <span style={{fontFamily: "monospace"}}>{file.name}</span>
            <span style={{marginLeft: "auto", color: "var(--text-muted, #6b7280)"}}>
                {(file.size / 1024).toFixed(1)} KB
            </span>
        </div>
    )
}
