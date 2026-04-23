import { useRef, useState } from "react";
import { Folder, Upload } from "lucide-react";
import { useI18n } from "../../../hooks/useI18n";

// Aligned with the backend handler registry
// (app/import_plugins/handlers/__init__.py). ZIP support is scheduled
// for plugin-git-sync PGS-01 and will be re-added here the moment the
// plugin ships a ZIP handler. Advertising .zip before that point
// produces a "no handler" 415 from /api/import/detect, visible only
// after the user already uploaded the file.
const ACCEPTED_EXTENSIONS = [".bgb", ".md", ".markdown", ".txt"] as const;
const FOLDER_MD_EXTENSIONS = [".md", ".markdown"] as const;
const FOLDER_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;
const WARN_SIZE_MB = 50;
const MAX_SIZE_MB = 500;
const MAX_FOLDER_FILES = 2000;

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

function relativePathOf(file: File): string {
    // Browsers expose folder-relative paths only on the webkitRelativePath
    // property; when a user picks individual files it is an empty string.
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return rel && rel.length > 0 ? rel : file.name;
}

function isFolderRelevant(filename: string): boolean {
    const ext = extensionOf(filename);
    return (
        (FOLDER_MD_EXTENSIONS as readonly string[]).includes(ext) ||
        (FOLDER_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
    );
}

export interface UploadSelection {
    files: File[];
    paths?: string[];
}

export function UploadStep({
    onInputSelected,
}: {
    onInputSelected: (selection: UploadSelection) => void;
}) {
    const { t } = useI18n();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const folderInputRef = useRef<HTMLInputElement | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    const validateSingle = (file: File): string | null => {
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

    const handleSingleFile = (file: File) => {
        setError(null);
        setWarning(null);
        const err = validateSingle(file);
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
        onInputSelected({ files: [file] });
    };

    const handleFolder = (rawFiles: FileList) => {
        setError(null);
        setWarning(null);
        const picked = Array.from(rawFiles).filter((f) =>
            isFolderRelevant(f.name),
        );
        if (picked.length === 0) {
            setError(
                t(
                    "ui.import_wizard.error_folder_empty",
                    "Folder has no .md/.markdown files.",
                ),
            );
            return;
        }
        if (picked.length > MAX_FOLDER_FILES) {
            setError(
                t(
                    "ui.import_wizard.error_folder_too_many",
                    "Too many files in folder ({count}); maximum {max}.",
                )
                    .replace("{count}", String(picked.length))
                    .replace("{max}", String(MAX_FOLDER_FILES)),
            );
            return;
        }
        const total = picked.reduce((sum, f) => sum + f.size, 0);
        if (total > MAX_SIZE_MB * 1024 * 1024) {
            setError(
                t(
                    "ui.import_wizard.error_file_too_large",
                    "File too large (>{max} MB).",
                ).replace("{max}", String(MAX_SIZE_MB)),
            );
            return;
        }
        if (total > WARN_SIZE_MB * 1024 * 1024) {
            setWarning(
                t(
                    "ui.import_wizard.warn_large_file",
                    "Large folder ({size}); upload may take a moment.",
                ).replace("{size}", humanSize(total)),
            );
        }
        const paths = picked.map(relativePathOf);
        onInputSelected({ files: picked, paths });
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;
        if (files.length === 1) {
            handleSingleFile(files[0]);
        } else {
            // Dropping multiple files without directory structure:
            // treat as folder upload using plain filenames as paths.
            handleFolder(files);
        }
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
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
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

            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: 12,
                }}
            >
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    data-testid="upload-folder-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        folderInputRef.current?.click();
                    }}
                >
                    <Folder size={14} style={{ marginRight: 6 }} />
                    {t(
                        "ui.import_wizard.step_1_pick_folder",
                        "Or pick a folder of Markdown files",
                    )}
                </button>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                data-testid="upload-input"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                style={{ display: "none" }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleSingleFile(file);
                    e.target.value = "";
                }}
            />

            <input
                ref={folderInputRef}
                type="file"
                data-testid="upload-folder-input"
                multiple
                style={{ display: "none" }}
                // webkitdirectory is a browser-specific boolean attribute
                // not covered by the standard HTMLInputElement React types.
                // Set via dangerouslySetInnerHTML-free prop injection.
                {...{ webkitdirectory: "true", directory: "" }}
                onChange={(e) => {
                    if (e.target.files) handleFolder(e.target.files);
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
