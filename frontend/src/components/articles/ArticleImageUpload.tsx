import { useRef, useState } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";

import { ApiError, api } from "../../api/client";
import { getStorage } from "../../storage";
import { useI18n } from "../../hooks/useI18n";
import { useArticleImageUrl } from "../../hooks/article/useArticleImageUrl";
import { notify } from "../../utils/notify";

/** UX-FU-02: featured-image upload for the ArticleEditor sidebar.
 *
 * Mirrors {@link CoverUpload} but for articles. Drag-and-drop or
 * click-to-pick uploads, then ``onChange(url, assetId)`` updates the
 * article's featured image.
 *
 * - **api mode:** uploads to the article-scoped endpoint; the served URL
 *   becomes ``featured_image_url`` (``assetId`` null).
 * - **dexie mode (offline):** stores the bytes in the Dexie ``articleAssets``
 *   table (#157) and sets ``featured_image_asset_id`` (``url`` null), so the
 *   thumbnail survives offline. The preview resolves across modes via
 *   {@link useArticleImageUrl}.
 *
 * Removal deletes the asset (server file in api mode, Dexie blob offline)
 * and clears both fields.
 */
interface Props {
    articleId: string;
    /** Current ``featured_image_url`` value. May be empty,
     *  remote (https://...), or article-served
     *  (/api/articles/{id}/assets/file/{filename}). */
    value: string | null;
    /** Current ``featured_image_asset_id`` (dexie-only blob ref, #157). */
    assetId?: string | null;
    onChange: (url: string | null, assetId: string | null) => void;
}

const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(",");

function isAcceptedFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** True when the URL points at this article's served asset. */
function isLocalAsset(articleId: string, url: string | null): boolean {
    if (!url) return false;
    return url.startsWith(`/api/articles/${articleId}/assets/file/`);
}

export default function ArticleImageUpload({ articleId, value, assetId, onChange }: Props) {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    // Resolves the preview src across modes: served/CDN URL online, a blob:
    // URL from the Dexie articleAssets table offline (#157).
    const previewSrc = useArticleImageUrl(articleId, value, assetId ?? null);

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const file = files[0];
        if (!isAcceptedFile(file)) {
            notify.error(
                t(
                    "ui.articles.featured_image_format_error",
                    "Nur .jpg, .jpeg, .png, .webp oder .gif erlaubt",
                ),
            );
            return;
        }
        setUploading(true);
        try {
            if (getStorage().mode === "dexie") {
                // Offline: store the bytes in Dexie and reference them by id.
                const newAssetId = await getStorage().articleAssets.store(
                    articleId,
                    file,
                    file.name,
                    file.type,
                );
                onChange(null, newAssetId);
            } else {
                const asset = await api.articleAssets.upload(articleId, file);
                onChange(api.articleAssets.urlFor(articleId, asset.filename), null);
            }
            notify.success(t("ui.articles.featured_image_uploaded", "Bild hochgeladen"));
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : String(err);
            notify.error(
                t("ui.articles.featured_image_upload_failed", "Upload fehlgeschlagen") +
                    ": " +
                    detail,
                err,
            );
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const handleRemove = async () => {
        // Offline: drop the cached Dexie blob(s) for this article (#157).
        if (getStorage().mode === "dexie") {
            try {
                await getStorage().articleAssets.deleteByArticle(articleId);
            } catch {
                // Soft-fail: clear the field regardless so the user is not stuck.
            }
            onChange(null, null);
            return;
        }
        // Only delete from disk if the URL is one we own. Remote URLs
        // are out of scope - clear the field but don't try to call
        // a DELETE that has no matching asset row.
        if (isLocalAsset(articleId, value)) {
            try {
                const filename = value!.split("/").pop()!;
                const list = await api.articleAssets.list(articleId);
                const asset = list.find((a) => a.filename === filename);
                if (asset) {
                    await api.articleAssets.delete(articleId, asset.id);
                }
            } catch (err) {
                // Soft-fail removal of the file - clear the field anyway
                // so the user is not stuck with a broken state.
                if (err instanceof ApiError) {
                    notify.error(
                        t(
                            "ui.articles.featured_image_remove_failed",
                            "Bild entfernen fehlgeschlagen",
                        ),
                        err,
                    );
                }
            }
        }
        onChange(null, null);
    };

    return (
        <div data-testid="article-featured-image-upload">
            {previewSrc ? (
                <div
                    style={{
                        position: "relative",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        overflow: "hidden",
                        background: "var(--bg-secondary)",
                    }}
                >
                    <img
                        data-testid="article-featured-image-preview"
                        src={previewSrc}
                        alt={t("ui.articles.featured_image_alt", "Beitragsbild")}
                        style={{
                            display: "block",
                            width: "100%",
                            height: "auto",
                            maxHeight: 180,
                            objectFit: "cover",
                        }}
                    />
                    <button
                        type="button"
                        data-testid="article-featured-image-remove"
                        onClick={() => void handleRemove()}
                        title={t("ui.articles.featured_image_remove", "Entfernen")}
                        style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: 4,
                            cursor: "pointer",
                            color: "var(--danger)",
                        }}
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <div
                    data-testid="article-featured-image-dropzone"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        void handleFiles(e.dataTransfer.files);
                    }}
                    style={{
                        border: dragging ? "2px dashed var(--accent)" : "1px dashed var(--border)",
                        borderRadius: 4,
                        padding: "16px 8px",
                        textAlign: "center",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        fontSize: "0.8125rem",
                        transition: "border-color 100ms",
                    }}
                >
                    {uploading ? (
                        <span>
                            <Upload size={14} style={{ marginRight: 6 }} />
                            {t("ui.articles.featured_image_uploading", "Lädt hoch...")}
                        </span>
                    ) : (
                        <span>
                            <ImageIcon size={14} style={{ marginRight: 6 }} />
                            {t(
                                "ui.articles.featured_image_dropzone",
                                "Bild ablegen oder klicken zum Auswählen",
                            )}
                        </span>
                    )}
                </div>
            )}
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTR}
                style={{ display: "none" }}
                onChange={(e) => void handleFiles(e.target.files)}
                data-testid="article-featured-image-file-input"
            />
        </div>
    );
}
