import React from "react"
import {Image as ImageIcon, Upload, RefreshCw} from "lucide-react"
import {imageUrlFor} from "../../utils/imageUrl"
import {useI18n} from "../../hooks/useI18n"
import styles from "../PageCanvas.module.css"

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/gif"

interface Props {
    bookId: string
    hasSecondaryImage: boolean
    secondaryImageAssetId: string | null
    imageInlineStyle: React.CSSProperties
    secondaryFileInputRef: React.RefObject<HTMLInputElement | null>
    uploadingSecondary: boolean
    handleSecondaryFileChange: (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => Promise<void>
}

/**
 * Phase 2 C2 (2026-05-28): SECONDARY image region for multi-image
 * layouts. Mounted only when the active layout is in
 * MULTI_IMAGE_LAYOUTS. Mirrors the primary image region — same
 * placeholder / upload-button / replace-button affordance, just
 * bound to layout_config[layout].secondary_image_asset_id via
 * writeSecondaryImageAssetId.
 *
 * PB-PHASE4 god-file split: JSX moved verbatim from PageCanvas; the
 * rendered DOM (classes, inline styles, testids, element order) is
 * byte-identical.
 */
export default function SecondaryImageRegion({
    bookId,
    hasSecondaryImage,
    secondaryImageAssetId,
    imageInlineStyle,
    secondaryFileInputRef,
    uploadingSecondary,
    handleSecondaryFileChange,
}: Props) {
    const {t} = useI18n()
    return (
        <div
            data-testid="page-canvas-image-area-secondary"
            data-region="image-secondary"
            className={`${styles.region} ${styles.regionImageSecondary}`}
        >
            {hasSecondaryImage ? (
                <img
                    key={secondaryImageAssetId ?? ""}
                    src={imageUrlFor(
                        bookId,
                        secondaryImageAssetId!,
                    )}
                    alt=""
                    className={styles.image}
                    style={imageInlineStyle}
                    data-testid="page-canvas-image-secondary"
                />
            ) : (
                <div
                    className={styles.imagePlaceholder}
                    data-testid="page-canvas-image-secondary-placeholder"
                >
                    <ImageIcon size={40} aria-hidden />
                    <span>
                        {t(
                            "ui.page_editor.no_secondary_image",
                            "No secondary image yet",
                        )}
                    </span>
                </div>
            )}
            <button
                type="button"
                className={styles.imageReplaceBtn}
                onClick={() =>
                    secondaryFileInputRef.current?.click()
                }
                disabled={uploadingSecondary}
                data-testid="page-canvas-image-secondary-replace"
                title={
                    hasSecondaryImage
                        ? t(
                              "ui.page_editor.replace_secondary_image",
                              "Replace secondary image",
                          )
                        : t(
                              "ui.page_editor.upload_secondary_image",
                              "Upload secondary image",
                          )
                }
                aria-label={
                    hasSecondaryImage
                        ? t(
                              "ui.page_editor.replace_secondary_image",
                              "Replace secondary image",
                          )
                        : t(
                              "ui.page_editor.upload_secondary_image",
                              "Upload secondary image",
                          )
                }
            >
                {uploadingSecondary ? (
                    <span className={styles.imageReplaceLabel}>
                        {t(
                            "ui.page_editor.uploading",
                            "Uploading...",
                        )}
                    </span>
                ) : hasSecondaryImage ? (
                    <RefreshCw size={14} />
                ) : (
                    <Upload size={14} />
                )}
            </button>
            <input
                ref={secondaryFileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={handleSecondaryFileChange}
                className={styles.fileInput}
                data-testid="page-canvas-file-input-secondary"
            />
        </div>
    )
}
