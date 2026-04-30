import {useEffect, useRef, useState} from "react";
import {Image as ImageIcon, Upload, X} from "lucide-react";

import {ApiError, api} from "../api/client";
import type {CoverUploadResponse} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import styles from "./CoverUpload.module.css";

interface Props {
    bookId: string;
    coverImage: string | null;
    onChange: (newCoverImage: string | null) => void;
}

// KDP recommends 1600x2560 -> aspect ratio 1.6 (height / width).
const KDP_TARGET_ASPECT = 1.6;
const ASPECT_TOLERANCE = 0.05;

const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(",");

interface CoverInfo {
    width: number;
    height: number;
}

export default function CoverUpload({bookId, coverImage, onChange}: Props) {
    const {t} = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [info, setInfo] = useState<CoverInfo | null>(null);

    // Reset cached dimensions when the cover changes from outside (e.g. parent
    // book switch). The next image load handler will repopulate them.
    useEffect(() => {
        setInfo(null);
    }, [coverImage]);

    const coverFilename = coverImage ? coverImage.split("/").pop() : null;
    const coverUrl = coverFilename
        ? `/api/books/${bookId}/assets/file/${coverFilename}`
        : null;

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const file = files[0];
        if (!isAcceptedFile(file)) {
            notify.error(
                t("ui.cover.error_format", "Nur .jpg, .jpeg, .png oder .webp erlaubt"),
            );
            return;
        }
        setUploading(true);
        try {
            const result: CoverUploadResponse = await api.covers.upload(bookId, file);
            onChange(result.cover_image);
            setInfo({width: result.width, height: result.height});
            notify.success(t("ui.cover.upload_success", "Cover hochgeladen"));
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : String(err);
            notify.error(
                t("ui.cover.upload_failed", "Cover-Upload fehlgeschlagen") + ": " + detail,
                err,
            );
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const handleRemove = async () => {
        setUploading(true);
        try {
            await api.covers.delete(bookId);
            onChange(null);
            setInfo(null);
            notify.success(t("ui.cover.remove_success", "Cover entfernt"));
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : String(err);
            notify.error(
                t("ui.cover.remove_failed", "Cover konnte nicht entfernt werden") + ": " + detail,
                err,
            );
        } finally {
            setUploading(false);
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!uploading) setDragging(true);
    };
    const onDragLeave = () => setDragging(false);
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        if (uploading) return;
        handleFiles(e.dataTransfer.files);
    };

    return (
        <div className="field">
            <label className="label">{t("ui.metadata.cover_image", "Cover")}</label>

            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={[
                    styles.dropZone,
                    dragging ? styles.dropZoneDragging : "",
                    uploading ? styles.dropZoneUploading : "",
                ].filter(Boolean).join(" ")}
                onClick={() => !uploading && !coverUrl && inputRef.current?.click()}
            >
                {coverUrl ? (
                    <CoverPreview
                        url={coverUrl}
                        info={info}
                        onLoadInfo={setInfo}
                        onRemove={handleRemove}
                        disabled={uploading}
                    />
                ) : (
                    <EmptyState dragging={dragging} uploading={uploading} />
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT_ATTR}
                    className={styles.hiddenInput}
                    onChange={(e) => handleFiles(e.target.files)}
                />
            </div>

            {!coverUrl && (
                <button
                    type="button"
                    className={`btn btn-secondary btn-sm ${styles.chooseFileBtn}`}
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                >
                    <Upload size={14} />{" "}
                    {uploading
                        ? t("ui.cover.uploading", "Wird hochgeladen...")
                        : t("ui.cover.choose_file", "Datei wählen")}
                </button>
            )}

            <small className={styles.helpText}>
                {t(
                    "ui.cover.help",
                    "JPG, PNG oder WebP, maximal 10 MB. KDP empfiehlt 1600x2560 Pixel.",
                )}
            </small>

            {info && <KdpHint info={info} />}
        </div>
    );
}

function CoverPreview({
    url,
    info,
    onLoadInfo,
    onRemove,
    disabled,
}: {
    url: string;
    info: CoverInfo | null;
    onLoadInfo: (info: CoverInfo) => void;
    onRemove: () => void;
    disabled: boolean;
}) {
    const {t} = useI18n();
    return (
        <div className={styles.previewWrap}>
            <img
                src={url}
                alt="Cover"
                className={styles.preview}
                onLoad={(e) => {
                    const img = e.currentTarget;
                    onLoadInfo({width: img.naturalWidth, height: img.naturalHeight});
                }}
            />
            <button
                type="button"
                className={`btn btn-danger btn-sm ${styles.removeBtn}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                disabled={disabled}
                title={t("ui.cover.remove", "Cover entfernen")}
            >
                <X size={14} />
            </button>
            {info && (
                <div className={styles.dimensions}>
                    {info.width} x {info.height} px
                </div>
            )}
        </div>
    );
}

function EmptyState({dragging, uploading}: {dragging: boolean; uploading: boolean}) {
    const {t} = useI18n();
    return (
        <div className={styles.emptyState}>
            <ImageIcon size={42} color="var(--text-muted)" />
            <div className={styles.emptyHint}>
                {uploading
                    ? t("ui.cover.uploading", "Wird hochgeladen...")
                    : dragging
                        ? t("ui.cover.drop_here", "Hier ablegen")
                        : t("ui.cover.drop_hint", "Bild hierher ziehen oder klicken")}
            </div>
        </div>
    );
}

function KdpHint({info}: {info: CoverInfo}) {
    const {t} = useI18n();
    const aspect = info.width > 0 ? info.height / info.width : 0;
    const off = Math.abs(aspect - KDP_TARGET_ASPECT) > ASPECT_TOLERANCE;
    if (!off) return null;
    return (
        <div className={styles.kdpWarning}>
            {t(
                "ui.cover.kdp_warning",
                "Empfohlen für KDP: 1600x2560 Pixel (aktuell: {w}x{h})",
            )
                .replace("{w}", String(info.width))
                .replace("{h}", String(info.height))}
        </div>
    );
}

function isAcceptedFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

