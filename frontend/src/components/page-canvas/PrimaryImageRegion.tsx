import React from "react"
import {Image as ImageIcon, Upload, RefreshCw} from "lucide-react"
import {type Page} from "../../api/client"
import {imageUrlFor} from "../../utils/imageUrl"
import {useI18n} from "../../hooks/useI18n"
import styles from "../PageCanvas.module.css"

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/gif"

interface Props {
    page: Page
    bookId: string
    hasImage: boolean
    regionImageInlineStyle: React.CSSProperties
    imageInlineStyle: React.CSSProperties
    fileInputRef: React.RefObject<HTMLInputElement | null>
    uploading: boolean
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
}

/**
 * PB-PHASE4 god-file split: the primary image region extracted from
 * PageCanvas. JSX moved verbatim; the rendered DOM (classes, inline
 * styles, testids, element order) is byte-identical.
 */
export default function PrimaryImageRegion({
    page,
    bookId,
    hasImage,
    regionImageInlineStyle,
    imageInlineStyle,
    fileInputRef,
    uploading,
    handleFileChange,
}: Props) {
    const {t} = useI18n()
    return (
        <div
            data-testid="page-canvas-image-area"
            data-region="image"
            className={`${styles.region} ${styles.regionImage}`}
            style={regionImageInlineStyle}
        >
            {hasImage ? (
                <img
                    key={page.image_asset_id ?? ""}
                    src={imageUrlFor(bookId, page.image_asset_id!)}
                    alt=""
                    className={styles.image}
                    style={imageInlineStyle}
                    data-testid="page-canvas-image"
                />
            ) : (
                <div
                    className={styles.imagePlaceholder}
                    data-testid="page-canvas-image-placeholder"
                >
                    <ImageIcon size={40} aria-hidden />
                    <span>
                        {t("ui.page_editor.no_image", "No image yet")}
                    </span>
                </div>
            )}
            {/* Session 4c D2: on-image hover overlay for the
             *  upload/replace action. Notion-style top-right
             *  toolbar. Visible on hover (mouseenter on
             *  .regionImage) + on focus-within so keyboard
             *  users can tab into the action. Replaces the
             *  bottom-bar .imageActions row entirely. */}
            <button
                type="button"
                className={styles.imageReplaceBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                data-testid="page-canvas-image-replace"
                title={
                    hasImage
                        ? t(
                              "ui.page_editor.replace_image",
                              "Replace image",
                          )
                        : t(
                              "ui.page_editor.upload_image",
                              "Upload image",
                          )
                }
                aria-label={
                    hasImage
                        ? t(
                              "ui.page_editor.replace_image",
                              "Replace image",
                          )
                        : t(
                              "ui.page_editor.upload_image",
                              "Upload image",
                          )
                }
            >
                {uploading ? (
                    <span className={styles.imageReplaceLabel}>
                        {t("ui.page_editor.uploading", "Uploading...")}
                    </span>
                ) : hasImage ? (
                    <RefreshCw size={14} />
                ) : (
                    <Upload size={14} />
                )}
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={handleFileChange}
                className={styles.fileInput}
                data-testid="page-canvas-file-input"
            />
        </div>
    )
}
