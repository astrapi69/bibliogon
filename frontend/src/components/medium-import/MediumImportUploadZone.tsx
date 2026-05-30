/**
 * Drag-and-drop + file-picker zone for the Medium-import ZIP.
 *
 * Controlled component: parent owns the selected File. The zone
 * notifies upward via onFileSelected(file | null) on add and clear.
 *
 * Validation: only .zip is accepted. A 200MB hard limit rejects the
 * file with an error; 50MB triggers a soft warning the user can ignore.
 * Backend currently has no body-size cap (BACKEND-UPLOAD-SIZE-LIMIT-01).
 *
 * Accessibility: the zone is a focusable button. Enter / Space open
 * the file picker. The hidden file input keeps native a11y semantics.
 */
import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Upload, X } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import styles from "./MediumImportUploadZone.module.css";

const SOFT_WARN_BYTES = 50 * 1024 * 1024;
const HARD_REJECT_BYTES = 200 * 1024 * 1024;

interface MediumImportUploadZoneProps {
    file: File | null;
    onFileSelected: (file: File | null) => void;
    disabled?: boolean;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediumImportUploadZone({
    file,
    onFileSelected,
    disabled = false,
}: MediumImportUploadZoneProps) {
    const { t } = useI18n();
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const validate = useCallback(
        (candidate: File): boolean => {
            setError(null);
            setWarning(null);
            if (!candidate.name.toLowerCase().endsWith(".zip")) {
                setError(
                    t(
                        "ui.medium_import.upload.invalid_extension",
                        "Bitte eine .zip-Datei auswählen.",
                    ),
                );
                return false;
            }
            if (candidate.size > HARD_REJECT_BYTES) {
                setError(
                    t(
                        "ui.medium_import.upload.too_large",
                        "Datei zu groß. Maximum 200 MB.",
                    ),
                );
                return false;
            }
            if (candidate.size > SOFT_WARN_BYTES) {
                setWarning(
                    t(
                        "ui.medium_import.upload.large_warning",
                        "Sehr großes Archiv (>50 MB). Der Upload kann etwas dauern.",
                    ),
                );
            }
            return true;
        },
        [t],
    );

    const handleFile = useCallback(
        (candidate: File) => {
            if (validate(candidate)) {
                onFileSelected(candidate);
            }
        },
        [validate, onFileSelected],
    );

    const handleDrop = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragOver(false);
            if (disabled) return;
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) handleFile(dropped);
        },
        [disabled, handleFile],
    );

    const handleDragOver = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            if (disabled) return;
            setDragOver(true);
        },
        [disabled],
    );

    const openPicker = useCallback(() => {
        if (disabled) return;
        inputRef.current?.click();
    }, [disabled]);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLDivElement>) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
            }
        },
        [disabled, openPicker],
    );

    const handleClear = useCallback(() => {
        setError(null);
        setWarning(null);
        if (inputRef.current) inputRef.current.value = "";
        onFileSelected(null);
    }, [onFileSelected]);

    const zoneClasses = [
        styles.zone,
        dragOver ? styles.dragOver : "",
        disabled ? styles.disabled : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div data-testid="medium-import-upload-zone-wrapper">
            {file ? (
                <div className={styles.selected} data-testid="medium-import-upload-selected">
                    <div className={styles.selectedInfo}>
                        <div className={styles.filename} title={file.name}>
                            {file.name}
                        </div>
                        <div className={styles.filemeta}>{formatSize(file.size)}</div>
                    </div>
                    <button
                        type="button"
                        className={`btn-icon ${styles.clearBtn}`}
                        onClick={handleClear}
                        disabled={disabled}
                        data-testid="medium-import-upload-clear"
                        aria-label={t(
                            "ui.medium_import.upload.clear_aria",
                            "Auswahl entfernen",
                        )}
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <div
                    className={zoneClasses}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    onClick={openPicker}
                    onDragOver={handleDragOver}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onKeyDown={handleKeyDown}
                    aria-label={t(
                        "ui.medium_import.upload.dropzone_aria",
                        "Medium-ZIP per Drag&Drop ablegen oder klicken zum Auswählen",
                    )}
                    aria-disabled={disabled}
                    data-testid="medium-import-upload-zone"
                >
                    <Upload size={28} className={styles.icon} aria-hidden="true" />
                    <p className={styles.primary}>
                        {t(
                            "ui.medium_import.upload.dropzone_primary",
                            "Medium-Archiv (.zip) hier ablegen",
                        )}
                    </p>
                    <p className={styles.secondary}>
                        {t(
                            "ui.medium_import.upload.dropzone_secondary",
                            "oder klicken zum Auswählen",
                        )}
                    </p>
                </div>
            )}
            <input
                ref={inputRef}
                type="file"
                accept=".zip,application/zip"
                style={{ display: "none" }}
                data-testid="medium-import-upload-input"
                onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked) handleFile(picked);
                }}
            />
            {warning && (
                <p role="status" className={styles.warning} data-testid="medium-import-upload-warning">
                    {warning}
                </p>
            )}
            {error && (
                <p role="alert" className={styles.error} data-testid="medium-import-upload-error">
                    {error}
                </p>
            )}
        </div>
    );
}
