import React, {useEffect, useRef, useState} from "react"
import {Image as ImageIcon, Upload, RefreshCw} from "lucide-react"
import {api, type Page, type PageUpdate} from "../api/client"
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

export default function PageCanvas({page, bookId, onUpdate}: Props) {
    const {t} = useI18n()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const [textDraft, setTextDraft] = useState(page.text_content ?? "")

    // Keep the textarea in sync when the active page changes.
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

    return (
        <div
            data-testid="page-canvas-root"
            data-page-id={page.id}
            className={styles.canvas}
        >
            <div className={styles.imageArea} data-testid="page-canvas-image-area">
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
            </div>
            <div className={styles.imageActions}>
                <button
                    type="button"
                    className={styles.uploadBtn}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    data-testid="page-canvas-upload-btn"
                >
                    {hasImage ? (
                        <>
                            <RefreshCw size={14} />
                            <span>
                                {uploading
                                    ? t("ui.page_editor.uploading", "Uploading...")
                                    : t("ui.page_editor.replace_image", "Replace image")}
                            </span>
                        </>
                    ) : (
                        <>
                            <Upload size={14} />
                            <span>
                                {uploading
                                    ? t("ui.page_editor.uploading", "Uploading...")
                                    : t("ui.page_editor.upload_image", "Upload image")}
                            </span>
                        </>
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
            {uploadError && (
                <div
                    className={styles.uploadError}
                    role="alert"
                    data-testid="page-canvas-upload-error"
                >
                    {uploadError}
                </div>
            )}
            <div className={styles.textArea}>
                <label
                    htmlFor={`page-canvas-text-${page.id}`}
                    className={styles.textLabel}
                >
                    {t("ui.page_editor.text_label", "Page text")}
                </label>
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
                    rows={6}
                    data-testid="page-canvas-text-input"
                />
            </div>
        </div>
    )
}
