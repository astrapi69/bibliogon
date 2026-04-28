import {useEffect, useRef, useState} from "react";
import {Image as ImageIcon, Upload, X} from "lucide-react";

import {ApiError, api} from "../api/client";
import type {CoverUploadResponse} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";

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
                style={{
                    ...styles.dropZone,
                    borderColor: dragging ? "var(--accent)" : "var(--border)",
                    background: dragging ? "var(--accent-light)" : "var(--bg-secondary)",
                    cursor: uploading ? "wait" : "pointer",
                    opacity: uploading ? 0.6 : 1,
                }}
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
                    style={{display: "none"}}
                    onChange={(e) => handleFiles(e.target.files)}
                />
            </div>

            {!coverUrl && (
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    style={{marginTop: 8}}
                >
                    <Upload size={14} />{" "}
                    {uploading
                        ? t("ui.cover.uploading", "Wird hochgeladen...")
                        : t("ui.cover.choose_file", "Datei wählen")}
                </button>
            )}

            <small style={{color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginTop: 4}}>
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
        <div style={{position: "relative", display: "inline-block"}}>
            <img
                src={url}
                alt="Cover"
                style={styles.preview}
                onLoad={(e) => {
                    const img = e.currentTarget;
                    onLoadInfo({width: img.naturalWidth, height: img.naturalHeight});
                }}
            />
            <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                disabled={disabled}
                title={t("ui.cover.remove", "Cover entfernen")}
                style={styles.removeBtn}
            >
                <X size={14} />
            </button>
            {info && (
                <div style={styles.dimensions}>
                    {info.width} x {info.height} px
                </div>
            )}
        </div>
    );
}

function EmptyState({dragging, uploading}: {dragging: boolean; uploading: boolean}) {
    const {t} = useI18n();
    return (
        <div style={styles.emptyState}>
            <ImageIcon size={42} color="var(--text-muted)" />
            <div style={{marginTop: 8, color: "var(--text-muted)", fontSize: "0.875rem"}}>
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
        <div
            style={{
                marginTop: 8,
                padding: "6px 10px",
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: 4,
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
            }}
        >
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

const styles: Record<string, React.CSSProperties> = {
    dropZone: {
        border: "2px dashed var(--border)",
        borderRadius: 8,
        padding: 16,
        minHeight: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s ease",
    },
    emptyState: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "16px 8px",
    },
    preview: {
        maxHeight: 300,
        maxWidth: "100%",
        borderRadius: 4,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        display: "block",
    },
    removeBtn: {
        position: "absolute",
        top: 6,
        right: 6,
        padding: "4px 6px",
        borderRadius: "50%",
        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
    },
    dimensions: {
        marginTop: 6,
        textAlign: "center",
        fontSize: "0.75rem",
        color: "var(--text-muted)",
    },
};
