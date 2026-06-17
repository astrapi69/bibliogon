/**
 * File source for the unified offline import dialog (#76, #353).
 *
 * The local-file flow extracted from the former single-purpose
 * `OfflineImportDialog`: drop/pick a file, detect its format in the browser
 * ({@link detectImportFormat}), and import it through {@link importFile} via
 * the `getStorage()` seam (zero `/api`). Markdown / Text / HTML offer a
 * "new book" vs "append to existing book" choice; a Medium ZIP is handed off
 * to its dedicated page; `.bgb` and JSON full-data backups run their
 * client-side importers. All `offline-import-*` test ids are preserved.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Feature } from "@astrapi69/feature-strategy-react";
import { FolderUp, Upload } from "lucide-react";

import { useI18n } from "../../hooks/useI18n";
import { notify } from "../../utils/notify";
import { FEATURES } from "../../features/featureConfig";
import { RadixSelect } from "../RadixSelect";
import { getStorage } from "../../storage";
import type { Book } from "../../api/client";
import { detectImportFormat, type ImportFormat } from "../../import/detectFormat";
import {
    importFile,
    OfflineNotSupportedError,
    UnknownFormatError,
    type ImportFileResult,
} from "../../import/importRouter";

export interface FileImportTabProps {
    open: boolean;
    onImported?: (result: ImportFileResult) => void;
    onClose: () => void;
    /** A file handed in by a drag-and-drop drop; auto-detected on open (#312). */
    initialFile?: File | null;
}

const CHAPTER_FORMATS: readonly ImportFormat[] = ["markdown", "text", "html"];

function formatLabelKey(format: ImportFormat): string {
    return `ui.offline_import.format_${format.replace("-", "_")}`;
}

export default function FileImportTab({
    open,
    onImported,
    onClose,
    initialFile,
}: FileImportTabProps) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [file, setFile] = useState<File | null>(null);
    const [format, setFormat] = useState<ImportFormat | null>(null);
    const [detecting, setDetecting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [target, setTarget] = useState<"new-book" | "existing-book">("new-book");
    const [books, setBooks] = useState<Book[]>([]);
    const [bookId, setBookId] = useState("");

    const reset = () => {
        setFile(null);
        setFormat(null);
        setDetecting(false);
        setImporting(false);
        setTarget("new-book");
        setBooks([]);
        setBookId("");
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleFile = async (picked: File) => {
        setFile(picked);
        setFormat(null);
        setDetecting(true);
        const detected = await detectImportFormat(picked);
        if (detected === "medium-zip") {
            // Medium archives have their own dedicated page with a
            // preview/select + progress + result flow (#132). Hand the file
            // off there instead of importing it inline.
            setDetecting(false);
            handleClose();
            navigate("/articles/import/medium", {
                state: { pendingMediumFile: picked },
            });
            return;
        }
        setFormat(detected);
        setDetecting(false);
        if (CHAPTER_FORMATS.includes(detected)) {
            const existing = await getStorage().books.list();
            setBooks(existing);
        }
    };

    // A drag-and-drop drop hands the file in via initialFile; auto-detect it
    // once when the dialog opens (the ref guards against React re-runs).
    const processedRef = useRef<File | null>(null);
    useEffect(() => {
        if (open && initialFile && processedRef.current !== initialFile) {
            processedRef.current = initialFile;
            void handleFile(initialFile);
        }
        if (!open) processedRef.current = null;
        // handleFile is recreated each render; the ref makes this idempotent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialFile]);

    const successMessage = (result: ImportFileResult): string => {
        if (result.kind === "chapter") {
            return result.result.createdBook
                ? t("ui.offline_import.success_book", "Buch importiert: {title}").replace(
                      "{title}",
                      result.result.bookTitle,
                  )
                : t(
                      "ui.offline_import.success_chapter_existing",
                      "Kapitel zu {book} hinzugefügt",
                  ).replace("{book}", result.result.bookTitle);
        }
        if (result.kind === "backup" || result.kind === "bgb-backup") {
            return t(
                "ui.offline_import.success_backup",
                "Backup importiert: {books} Bücher, {articles} Artikel",
            )
                .replace("{books}", String(result.result.imported.books))
                .replace("{articles}", String(result.result.imported.articles));
        }
        return t(
            "ui.offline_import.success_medium",
            "Medium-Import: {imported} importiert",
        ).replace("{imported}", String(result.result.imported_count));
    };

    const handleImport = async () => {
        if (!file || !format) return;
        setImporting(true);
        try {
            const result = await importFile(file, format, {
                target:
                    target === "existing-book" && bookId
                        ? { kind: "existing-book", bookId }
                        : { kind: "new-book" },
            });
            notify.success(successMessage(result));
            onImported?.(result);
            handleClose();
        } catch (err) {
            const message =
                err instanceof OfflineNotSupportedError
                    ? t(
                          "ui.offline_import.bgb_desktop_hint",
                          "bgb-Import benötigt die Desktop-App.",
                      )
                    : err instanceof UnknownFormatError
                      ? t(
                            "ui.offline_import.unknown_hint",
                            "Dieses Format kann offline nicht importiert werden.",
                        )
                      : err instanceof Error
                        ? err.message
                        : String(err);
            notify.error(
                t("ui.offline_import.error", "Import fehlgeschlagen: {error}").replace(
                    "{error}",
                    message,
                ),
            );
        } finally {
            setImporting(false);
        }
    };

    const isChapter = format !== null && CHAPTER_FORMATS.includes(format);
    const canImport =
        format !== null &&
        format !== "bgb" &&
        format !== "unknown" &&
        !importing &&
        !detecting &&
        (!isChapter || target === "new-book" || (target === "existing-book" && bookId !== ""));

    return (
        <div>
            <div className="p-5">
                {!file && (
                    <FilePicker
                        onPick={handleFile}
                        label={t("ui.offline_import.drop_zone", "Datei hier ablegen oder klicken")}
                        hint={t(
                            "ui.offline_import.accepted",
                            "Markdown, Text, HTML, JSON-Backup, Medium-Export (.zip), Backup (.bgb).",
                        )}
                    />
                )}

                {file && (
                    <div className="flex flex-col gap-3">
                        <div className="text-sm" data-testid="offline-import-detection">
                            <span className="text-[var(--text-muted)]">
                                {t("ui.offline_import.file_label", "Datei:")}{" "}
                            </span>
                            <span className="font-mono">{file.name}</span>
                        </div>

                        {detecting && (
                            <p className="m-0 text-sm text-[var(--text-muted)]">
                                {t("ui.offline_import.detecting", "Format wird erkannt …")}
                            </p>
                        )}

                        {format && !detecting && (
                            <div
                                className="text-sm"
                                data-testid={`offline-import-format-${format}`}
                            >
                                <span className="text-[var(--text-muted)]">
                                    {t(
                                        "ui.offline_import.detected_label",
                                        "Erkanntes Format:",
                                    )}{" "}
                                </span>
                                <span className="font-medium">
                                    {t(formatLabelKey(format), format)}
                                </span>
                            </div>
                        )}

                        {isChapter && (
                            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                                <legend className="mb-1 p-0 text-sm font-medium">
                                    {t("ui.offline_import.import_as", "Import als:")}
                                </legend>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="radio"
                                        name="offline-import-target"
                                        data-testid="offline-import-target-new"
                                        checked={target === "new-book"}
                                        onChange={() => setTarget("new-book")}
                                    />
                                    {t(
                                        "ui.offline_import.as_new_book",
                                        "Neues Buch (Dateiinhalt wird erstes Kapitel)",
                                    )}
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="radio"
                                        name="offline-import-target"
                                        data-testid="offline-import-target-existing"
                                        checked={target === "existing-book"}
                                        disabled={books.length === 0}
                                        onChange={() => setTarget("existing-book")}
                                    />
                                    {t(
                                        "ui.offline_import.as_existing_book",
                                        "Neues Kapitel in bestehendes Buch",
                                    )}
                                </label>
                                {target === "existing-book" && (
                                    <RadixSelect
                                        testId="offline-import-book-select"
                                        value={bookId}
                                        onValueChange={setBookId}
                                        placeholder={t(
                                            "ui.offline_import.choose_book_placeholder",
                                            "Buch wählen …",
                                        )}
                                        options={books.map((b) => ({
                                            value: b.id,
                                            label: b.title,
                                        }))}
                                    />
                                )}
                            </fieldset>
                        )}

                        {format === "bgb" && (
                            <Feature
                                id={FEATURES.BGB_IMPORT}
                                whenHidden={
                                    <DesktopHint
                                        text={t(
                                            "ui.offline_import.bgb_desktop_hint",
                                            "bgb-Import benötigt die Desktop-App.",
                                        )}
                                    />
                                }
                                whenDisabled={() => (
                                    <DesktopHint
                                        text={t(
                                            "ui.offline_import.bgb_desktop_hint",
                                            "bgb-Import benötigt die Desktop-App.",
                                        )}
                                    />
                                )}
                            >
                                <button
                                    className="btn btn-primary btn-sm self-start"
                                    data-testid="offline-import-bgb-confirm"
                                    onClick={handleImport}
                                >
                                    {t("ui.offline_import.import_btn", "Importieren")}
                                </button>
                            </Feature>
                        )}

                        {format === "unknown" && (
                            <p
                                className="m-0 text-sm text-[var(--danger)]"
                                data-testid="offline-import-unknown"
                                role="alert"
                            >
                                {t(
                                    "ui.offline_import.unknown_hint",
                                    "Dieses Format kann offline nicht importiert werden.",
                                )}
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
                <button
                    className="btn btn-secondary btn-sm"
                    data-testid="offline-import-cancel"
                    onClick={handleClose}
                >
                    {t("ui.offline_import.cancel_btn", "Abbrechen")}
                </button>
                {format !== "bgb" && (
                    <button
                        className="btn btn-primary btn-sm"
                        data-testid="offline-import-confirm"
                        disabled={!canImport}
                        onClick={handleImport}
                    >
                        {importing
                            ? t("ui.offline_import.importing", "Importiere …")
                            : t("ui.offline_import.import_btn", "Importieren")}
                    </button>
                )}
            </div>
        </div>
    );
}

function DesktopHint({ text }: { text: string }) {
    return (
        <p
            className="m-0 text-sm text-[var(--text-muted)]"
            data-testid="offline-import-bgb-hint"
            role="status"
        >
            {text}
        </p>
    );
}

function FilePicker({
    onPick,
    label,
    hint,
}: {
    onPick: (file: File) => void;
    label: string;
    hint: string;
}) {
    const [dragOver, setDragOver] = useState(false);
    let inputRef: HTMLInputElement | null = null;

    return (
        <>
            <div
                data-testid="offline-import-dropzone"
                role="button"
                tabIndex={0}
                onClick={() => inputRef?.click()}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        inputRef?.click();
                    }
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) onPick(dropped);
                }}
                className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                    dragOver
                        ? "border-[var(--accent)] bg-[var(--accent-light)]"
                        : "border-[var(--border-strong)]"
                }`}
            >
                <FolderUp size={40} strokeWidth={1.25} className="mb-3 text-[var(--text-muted)]" />
                <p className="m-0 text-base font-medium">{label}</p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                    <Upload size={12} className="mr-1 inline" />
                    {hint}
                </p>
            </div>
            <input
                ref={(el) => {
                    inputRef = el;
                }}
                type="file"
                data-testid="offline-import-input"
                accept=".md,.markdown,.txt,.html,.htm,.json,.zip,.bgb"
                className="hidden"
                onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked) onPick(picked);
                    e.target.value = "";
                }}
            />
        </>
    );
}
