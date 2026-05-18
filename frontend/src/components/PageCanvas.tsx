import React, {useCallback, useEffect, useRef, useState} from "react"
import type {JSONContent} from "@tiptap/core"
import type {Editor} from "@tiptap/react"
import {Image as ImageIcon, Upload, RefreshCw} from "lucide-react"
import {api, type Page, type PageLayout, type PageUpdate} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import {useDebouncedCallback} from "../hooks/useDebouncedCallback"
import RichTextEditor from "./RichTextEditor"
import styles from "./PageCanvas.module.css"

/**
 * PB-PHASE4 Session 4c-B-1 Commit 2: per-layout discriminator.
 *
 * D2 storage decision: TipTap JSON for these three layouts (large
 * text regions where rich formatting actually matters); plain
 * string for speech_bubble + image_full_text_overlay (Tier-Property
 * surfaces handle text styling via the layout_config, NOT inline).
 */
const TIPTAP_LAYOUTS: ReadonlySet<PageLayout> = new Set([
    "image_top_text_bottom",
    "image_left_text_right",
    "text_only",
])

function isTipTapLayout(layout: PageLayout): boolean {
    return TIPTAP_LAYOUTS.has(layout)
}

/**
 * Parse ``page.text_content`` (stringified) into a TipTap JSON
 * doc per the D4 migration strategy: legacy plain-text rows get
 * wrapped into a minimal TipTap doc on first read. No Alembic
 * migration; backward-compat lives here.
 */
function parseTextContentToJson(
    textContent: string | null | undefined,
): JSONContent | null {
    if (!textContent) return null
    // Heuristic: TipTap JSON always starts with ``{`` (it's an
    // object literal). Anything else is legacy plain text.
    const trimmed = textContent.trimStart()
    if (trimmed.startsWith("{")) {
        try {
            const parsed = JSON.parse(textContent)
            if (
                parsed &&
                typeof parsed === "object" &&
                parsed.type === "doc"
            ) {
                return parsed as JSONContent
            }
            // Fall through to wrap: parsed but doesn't look like
            // a TipTap doc — rare edge case (e.g. somebody hand-
            // wrote ``{"foo": "bar"}`` into the field).
        } catch {
            // Fall through to wrap: invalid JSON.
        }
    }
    // Wrap as a minimal TipTap doc.
    return {
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: [{type: "text", text: textContent}],
            },
        ],
    }
}

function serializeJsonToText(json: JSONContent | null): string | null {
    if (!json) return null
    return JSON.stringify(json)
}

interface Props {
    page: Page
    bookId: string
    onUpdate: (updates: PageUpdate) => Promise<void> | void
    /** PB-PHASE4 Session 4c-B-1 Commit 3: D6-C properties-pane
     *  Toolbar placement. PageCanvas mounts the TipTap editor
     *  inline (in the page-region); the Toolbar mounts SEPARATELY
     *  in PageEditor's properties pane. To wire the two, PageCanvas
     *  hands the editor instance UP via this callback. ``null``
     *  signals "active layout is a Tier-Property layout — no
     *  editor instance available" (so the parent unmounts the
     *  Toolbar). Caller MUST treat the editor as scoped to the
     *  current page; on page-switch the parent clears its own
     *  reference + re-receives the new page's editor. */
    onEditorReady?: (editor: Editor | null) => void
}

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/gif"

function imageUrlFor(bookId: string, assetId: string): string {
    return `/api/books/${bookId}/assets/${assetId}/file`
}

/** PB-PHASE4 Session 4c Commit 4: derive the speech-bubble's
 *  position + background-opacity inline style from
 *  page.layout_config. Default (NULL config) is bottom-right + full
 *  opacity, matching Session 4 D2a's behavior. */
function speechBubbleInlineStyle(
    config: Record<string, unknown> | null,
): React.CSSProperties {
    // Session 4 D2a default: fallback is bottom-center when no user
    // preset has been picked. The 5 user-pickable presets (TL/TR/BL/
    // BR/CENTER) override this default once persisted.
    const anchor =
        typeof config?.anchor_position === "string"
            ? config.anchor_position
            : "bottom-center"
    const rawOpacity =
        typeof config?.opacity === "number" ? config.opacity : 1
    const opacity = Math.max(0.3, Math.min(1, rawOpacity))
    const bg = `rgba(255, 255, 255, ${opacity})`
    // Session 4c refinement: bubble-size slider. Default 40% matches
    // the Session 4 D2a width; clamped to [20, 60].
    const rawSize =
        typeof config?.size === "number" ? config.size : 40
    const sizePct = Math.max(20, Math.min(60, rawSize))
    const width = `${sizePct}%`
    const reset = {top: "auto", right: "auto", bottom: "auto", left: "auto"} as const
    switch (anchor) {
        case "top-left":
            return {...reset, top: 16, left: 16, transform: "none", background: bg, width}
        case "top-right":
            return {...reset, top: 16, right: 16, transform: "none", background: bg, width}
        case "bottom-left":
            return {...reset, bottom: 16, left: 16, transform: "none", background: bg, width}
        case "bottom-right":
            return {...reset, bottom: 16, right: 16, transform: "none", background: bg, width}
        case "center":
            return {
                ...reset,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: bg,
                width,
            }
        case "bottom-center":
        default:
            return {
                ...reset,
                bottom: 16,
                left: "50%",
                transform: "translateX(-50%)",
                background: bg,
                width,
            }
    }
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

export default function PageCanvas({page, bookId, onUpdate, onEditorReady}: Props) {
    const {t} = useI18n()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const [textDraft, setTextDraft] = useState(page.text_content ?? "")
    // PB-PHASE4 Session 4c-B-1 Commit 2: per-layout TipTap state.
    // TIPTAP_LAYOUTS render through RichTextEditor; their content
    // is a parsed JSONContent (legacy plain text auto-wraps on
    // read per D4 backward-compat). The non-TipTap layouts keep
    // using textDraft above.
    const [textJson, setTextJson] = useState<JSONContent | null>(() =>
        parseTextContentToJson(page.text_content),
    )

    useEffect(() => {
        setTextDraft(page.text_content ?? "")
        setTextJson(parseTextContentToJson(page.text_content))
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

    /**
     * PB-PHASE4 Session 4c-B-1 Commit 2: persist TipTap JSON.
     *
     * Fires on every TipTap onChange tick (every keystroke).
     * Debounced 800 ms so the API isn't hammered — matches the
     * existing chapter-editor autosave cadence (Editor.tsx).
     * The serialized JSON string lands in ``page.text_content``;
     * the per-layout discriminator on read (parseTextContentToJson)
     * decodes it back on the next mount / page-switch.
     *
     * Empty doc (no content nodes) is normalised to ``null`` so
     * the empty-page case matches the legacy textarea behavior.
     *
     * No-op guard: if the serialized value equals what's already
     * in ``page.text_content``, skip the API call entirely. Catches
     * the mount-time onChange that TipTap's React adapter fires
     * during the editor's initial transaction (observed in
     * happy-dom during 4c-B-1 Commit 2 test development) — and
     * any other "user typed → backspaced → exactly back to the
     * persisted state" edge.
     */
    const persistTextJson = useCallback(
        async (next: JSONContent | null): Promise<void> => {
            // Detect "doc with no text" and persist as null so an
            // emptied-out page reads back as empty on next mount.
            const serialized = (() => {
                if (!next) return null
                const docHasText = JSON.stringify(next).includes('"text"')
                if (!docHasText) return null
                return serializeJsonToText(next)
            })()
            if (serialized === page.text_content) return
            await onUpdate({text_content: serialized})
        },
        [onUpdate, page.text_content],
    )

    const persistTextJsonDebounced = useDebouncedCallback(
        persistTextJson,
        800,
    )

    const handleRichTextChange = useCallback(
        (next: JSONContent) => {
            setTextJson(next)
            persistTextJsonDebounced(next)
        },
        [persistTextJsonDebounced],
    )

    /**
     * PB-PHASE4 Session 4c-B-1 Commit 3: signal "no editor"
     * to the parent when the active layout is a Tier-Property
     * layout (so the properties-pane Toolbar unmounts). For
     * TipTap layouts, the RichTextEditor below fires
     * onEditorReady with the actual instance directly to the
     * parent through the prop pass-through.
     */
    useEffect(() => {
        if (!onEditorReady) return
        if (!isTipTapLayout(page.layout as PageLayout)) {
            onEditorReady(null)
        }
    }, [page.layout, onEditorReady])

    const hasImage = Boolean(page.image_asset_id)
    const layoutClass = LAYOUT_CLASS[page.layout as PageLayout] ?? LAYOUT_CLASS.image_top_text_bottom
    const isSpeechBubble = page.layout === "speech_bubble"
    const isTextOnly = page.layout === "text_only"
    const speechBubbleStyle = isSpeechBubble
        ? speechBubbleInlineStyle(page.layout_config)
        : undefined

    // Session 4c Commit 5: image_top_text_bottom +
    // image_left_text_right + image_full_text_overlay configs.
    const layoutConfig = page.layout_config ?? {}
    const imagePosition =
        typeof layoutConfig.image_position === "string" &&
        ["left", "center", "right"].includes(layoutConfig.image_position as string)
            ? (layoutConfig.image_position as "left" | "center" | "right")
            : "center"
    const imageFit =
        typeof layoutConfig.image_fit === "string" &&
        ["contain", "cover"].includes(layoutConfig.image_fit as string)
            ? (layoutConfig.image_fit as "contain" | "cover")
            : page.layout === "speech_bubble"
              ? "cover"
              : "contain"
    const splitRatio =
        typeof layoutConfig.split_ratio === "number"
            ? Math.max(50, Math.min(70, layoutConfig.split_ratio as number))
            : 60
    const textPosition =
        typeof layoutConfig.text_position === "string" &&
        ["top", "middle", "bottom"].includes(layoutConfig.text_position as string)
            ? (layoutConfig.text_position as "top" | "middle" | "bottom")
            : "bottom"
    const textBackdropOpacity =
        typeof layoutConfig.text_backdrop_opacity === "number"
            ? Math.max(0.3, Math.min(0.8, layoutConfig.text_backdrop_opacity as number))
            : 0.45

    // Compute the inline style for non-speech-bubble layouts.
    const canvasInlineStyle: React.CSSProperties = {}
    if (page.layout === "image_left_text_right") {
        canvasInlineStyle.gridTemplateColumns = `${splitRatio}% ${100 - splitRatio}%`
    }
    const regionImageInlineStyle: React.CSSProperties = {}
    if (page.layout === "image_top_text_bottom") {
        if (imagePosition === "left") regionImageInlineStyle.justifyContent = "flex-start"
        else if (imagePosition === "right") regionImageInlineStyle.justifyContent = "flex-end"
        else regionImageInlineStyle.justifyContent = "center"
    }
    const imageInlineStyle: React.CSSProperties = {}
    if (page.layout === "image_top_text_bottom" || page.layout === "image_left_text_right") {
        imageInlineStyle.objectFit = imageFit
    }
    const overlayTextStyle: React.CSSProperties = {}
    if (page.layout === "image_full_text_overlay") {
        overlayTextStyle.background = `rgba(0, 0, 0, ${textBackdropOpacity})`
        // Use individual properties (not `inset` shorthand) so the
        // serialized inline style is testable in jsdom.
        overlayTextStyle.left = 0
        overlayTextStyle.right = 0
        if (textPosition === "top") {
            overlayTextStyle.top = 0
            overlayTextStyle.bottom = "auto"
        } else if (textPosition === "middle") {
            overlayTextStyle.top = "50%"
            overlayTextStyle.bottom = "auto"
            overlayTextStyle.transform = "translateY(-50%)"
            overlayTextStyle.maxHeight = "70%"
        } else {
            overlayTextStyle.top = "auto"
            overlayTextStyle.bottom = 0
        }
    }

    return (
        <div className={styles.canvasWrapper} data-testid="page-canvas-wrapper">
            <div
                data-testid="page-canvas-root"
                data-page-id={page.id}
                data-layout={page.layout}
                data-image-position={
                    page.layout === "image_top_text_bottom" ? imagePosition : undefined
                }
                data-image-fit={
                    page.layout === "image_top_text_bottom" ||
                    page.layout === "image_left_text_right"
                        ? imageFit
                        : undefined
                }
                data-split-ratio={
                    page.layout === "image_left_text_right" ? splitRatio : undefined
                }
                data-text-position={
                    page.layout === "image_full_text_overlay" ? textPosition : undefined
                }
                className={`${styles.canvas} ${layoutClass}`}
                style={canvasInlineStyle}
            >
                {!isTextOnly && (
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
                )}
                <div
                    data-testid={
                        isSpeechBubble
                            ? "page-canvas-speech-bubble"
                            : "page-canvas-region-text"
                    }
                    data-region="text"
                    data-anchor={
                        isSpeechBubble
                            ? ((page.layout_config?.anchor_position as string) ??
                              "bottom-center")
                            : undefined
                    }
                    className={`${styles.region} ${styles.regionText}`}
                    style={
                        isSpeechBubble
                            ? speechBubbleStyle
                            : page.layout === "image_full_text_overlay"
                              ? overlayTextStyle
                              : undefined
                    }
                >
                    {isTipTapLayout(page.layout as PageLayout) ? (
                        <RichTextEditor
                            content={textJson}
                            onChange={handleRichTextChange}
                            onEditorReady={onEditorReady}
                            placeholder={t(
                                "ui.page_editor.text_placeholder",
                                "Write the page text here...",
                            )}
                            testidNamespace={`page-canvas-richtext-${page.id}`}
                            className={styles.textInput}
                        />
                    ) : (
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
                    )}
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
