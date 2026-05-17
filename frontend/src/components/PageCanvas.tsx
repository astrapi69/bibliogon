import React, {useEffect, useRef, useState} from "react"
import {Image as ImageIcon, Upload, RefreshCw} from "lucide-react"
import {api, type Page, type PageLayout, type PageUpdate} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import styles from "./PageCanvas.module.css"

interface Props {
    page: Page
    bookId: string
    onUpdate: (updates: PageUpdate) => Promise<void> | void
}

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/gif"

function imageUrlFor(bookId: string, assetId: string): string {
    return `/api/books/${bookId}/assets/${assetId}/file`
}

// PB-PHASE4 Session 4 Commit 1: per-layout CSS-Module class. The
// CSS defines grid-template-areas per layout; the JSX stays the
// same (image + text region wrappers) and the styling makes the
// spatial difference visible. Switch-cascade in JSX deliberately
// avoided per coding-standards.md "no if/elif cascades for type".
const LAYOUT_CLASS: Record<PageLayout, string> = {
    speech_bubble: styles.canvasLayoutSpeechBubble,
    image_top_text_bottom: styles.canvasLayoutImageTopTextBottom,
    image_left_text_right: styles.canvasLayoutImageLeftTextRight,
    image_full_text_overlay: styles.canvasLayoutImageFullTextOverlay,
    text_only: styles.canvasLayoutTextOnly,
}

export default function PageCanvas({page, bookId, onUpdate}: Props) {
    const {t} = useI18n()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const [textDraft, setTextDraft] = useState(page.text_content ?? "")

    useEffect(() => {
        setTextDraft(page.text_content ?? "")
        setUploadError(null)
    }, [page.id, page.text_content])

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        setUploadError(null)
        try {
            const asset = await api.assets.upload(bookId, file, "figure")
            await onUpdate({image_asset_id: asset.id})
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : String(err))
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    const handleTextBlur = async () => {
        const trimmed = textDraft
        const original = page.text_content ?? ""
        if (trimmed === original) return
        await onUpdate({text_content: trimmed.length === 0 ? null : trimmed})
    }

    const hasImage = Boolean(page.image_asset_id)
    const layoutClass = LAYOUT_CLASS[page.layout as PageLayout] ?? LAYOUT_CLASS.image_top_text_bottom
    const isSpeechBubble = page.layout === "speech_bubble"
    const isTextOnly = page.layout === "text_only"

    return (
        <div className={styles.canvasWrapper} data-testid="page-canvas-wrapper">
            <div
                data-testid="page-canvas-root"
                data-page-id={page.id}
                data-layout={page.layout}
                className={`${styles.canvas} ${layoutClass}`}
            >
                {!isTextOnly && (
                    <div
                        data-testid="page-canvas-image-area"
                        data-region="image"
                        className={`${styles.region} ${styles.regionImage}`}
                    >
                        {hasImage ? (
                            <img
                                key={page.image_asset_id ?? ""}
                                src={imageUrlFor(bookId, page.image_asset_id!)}
                                alt=""
                                className={styles.image}
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
                )}
                <div
                    data-testid={
                        isSpeechBubble
                            ? "page-canvas-speech-bubble"
                            : "page-canvas-region-text"
                    }
                    data-region="text"
                    className={`${styles.region} ${styles.regionText}`}
                >
                    <textarea
                        id={`page-canvas-text-${page.id}`}
                        className={styles.textInput}
                        value={textDraft}
                        onChange={(e) => setTextDraft(e.target.value)}
                        onBlur={handleTextBlur}
                        placeholder={t(
                            "ui.page_editor.text_placeholder",
                            "Write the page text here...",
                        )}
                        data-testid="page-canvas-text-input"
                    />
                </div>
            </div>
            {uploadError && (
                <div
                    className={styles.uploadError}
                    role="alert"
                    data-testid="page-canvas-upload-error"
                >
                    {uploadError}
                </div>
            )}
        </div>
    )
}
