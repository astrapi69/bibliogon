import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useI18n } from "../../../hooks/useI18n";

// Aligned with the backend handler registry
// (app/import_plugins/handlers/__init__.py). ZIP support is scheduled
// for plugin-git-sync PGS-01 and will be re-added here the moment the
// plugin ships a ZIP handler. Advertising .zip before that point
// produces a "no handler" 415 from /api/import/detect, visible only
// after the user already uploaded the file.
const ACCEPTED_EXTENSIONS = [".bgb", ".md", ".markdown", ".txt"] as const;
const WARN_SIZE_MB = 50;
const MAX_SIZE_MB = 500;

function extensionOf(filename: string): string {
    const idx = filename.lastIndexOf(".");
    return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function UploadStep({
    onFileSelected,
}: {
    onFileSelected: (file: File) => void;
}) {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    const validate = (file: File): string | null => {
        const ext = extensionOf(file.name);
        if (!ACCEPTED_EXTENSIONS.includes(ext as (typeof ACCEPTED_EXTENSIONS)[number])) {
            return t(
                "ui.import_wizard.error_unsupported_format",
                "Unsupported file format. Accepts: {formats}",
            ).replace("{formats}", ACCEPTED_EXTENSIONS.join(", "));
        }
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            return t(
                "ui.import_wizard.error_file_too_large",
                "File too large (>{max} MB).",
            ).replace("{max}", String(MAX_SIZE_MB));
        }
        return null;
    };

    const handleFile = (file: File) => {
        setError(null);
        setWarning(null);
        const err = validate(file);
        if (err) {
            setError(err);
            return;
        }
        if (file.size > WARN_SIZE_MB * 1024 * 1024) {
            setWarning(
                t(
                    "ui.import_wizard.warn_large_file",
                    "Large file ({size}); detection may take a moment.",
                ).replace("{size}", humanSize(file.size)),
            );
        }
        onFileSelected(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    return (
        <div data-testid="upload-step">
            <div
                data-testid="upload-dropzone"
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        inputRef.current?.click();
                    }
                }}
                style={{
                    border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-strong)"}`,
                    borderRadius: 8,
                    padding: 48,
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "border-color 150ms, background 150ms",
                    background: dragOver ? "var(--accent-light)" : "transparent",
                }}
            >
                <Upload
                    size={48}
                    strokeWidth={1.25}
                    style={{ color: "var(--text-muted)", marginBottom: 12 }}
                />
                <p style={{ margin: 0, fontSize: "1rem", fontWeight: 500 }}>
                    {t(
                        "ui.import_wizard.step_1_drop_zone",
                        "Drop file here or click to browse",
                    )}
                </p>
                <p
                    style={{
                        margin: "8px 0 0 0",
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                    }}
                >
                    {t(
                        "ui.import_wizard.step_1_accepted_formats",
                        "Accepts: .bgb, .md, .markdown, .txt",
                    )}
                </p>
            </div>

            <input
                ref={inputRef}
                type="file"
                data-testid="upload-input"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                style={{ display: "none" }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                }}
            />

            {warning && (
                <p
                    role="status"
                    data-testid="upload-warning"
                    style={{
                        marginTop: 12,
                        color: "var(--accent)",
                        fontSize: "0.8125rem",
                    }}
                >
                    {warning}
                </p>
            )}
            {error && (
                <p
                    role="alert"
                    data-testid="upload-error"
                    style={{
                        marginTop: 12,
                        color: "var(--danger)",
                        fontSize: "0.8125rem",
                    }}
                >
                    {error}
                </p>
            )}
        </div>
    );
}
