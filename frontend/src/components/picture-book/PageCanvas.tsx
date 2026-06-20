import React, {useCallback, useEffect, useState} from "react"
import type {JSONContent} from "@tiptap/core"
import type {Editor} from "@tiptap/react"
import {type Page, type PageLayout, type PageUpdate} from "../../api/client"
import {
    readLayoutNamespace,
    readSecondaryImageAssetId,
} from "../../utils/editor/layoutConfig"
import CollageCanvas from "./CollageCanvas"
import {useDebouncedCallback} from "../../hooks/useDebouncedCallback"
import {usePageImageUpload} from "../../hooks/usePageImageUpload"
import {
    extractPlainText,
    isTipTapLayout,
    parseTextContentToJson,
    serializeJsonToText,
} from "../../lib/utils/pageTextContent"
import {
    isMultiImageLayout,
    speechBubbleInlineStyle,
} from "../../lib/utils/pageLayoutStyles"
import {computePageCanvasStyles} from "../page-canvas/pageCanvasStyles"
import PrimaryImageRegion from "../page-canvas/PrimaryImageRegion"
import TextRegion from "../page-canvas/TextRegion"
import SecondaryImageRegion from "../page-canvas/SecondaryImageRegion"
import styles from "../PageCanvas.module.css"

/**
 * Re-exported from ``lib/utils/pageTextContent`` so existing
 * consumers (PageEditor + the PageCanvas test) keep importing these
 * from ``./PageCanvas`` unchanged after the Batch 1 god-file split.
 */
export {extractPlainText, isTipTapLayout}

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
    // Comic-book layout. PageCanvas is the picture-book canvas; it
    // never renders a comic_book page (those go through
    // ComicPanelGrid). Fallback to image_top_text_bottom styling so
    // the Record stays exhaustive without introducing an unused CSS
    // class. Reached only via the ``LAYOUT_CLASS[page.layout] ?? …``
    // safety net, never in practice.
    comic_panel_grid: styles.canvasLayoutImageTopTextBottom,
    // Picture-Book Layout Expansion Phase 1 C2 (2026-05-28).
    // Dedicated CSS module classes; geometry per the mirror /
    // full-bleed-no-text plan in the Pre-Inspection report.
    image_bottom_text_top: styles.canvasLayoutImageBottomTextTop,
    image_right_text_left: styles.canvasLayoutImageRightTextLeft,
    image_full_no_text: styles.canvasLayoutImageFullNoText,
    // Picture-Book Layout Expansion Phase 2 C2..C5 (2026-05-28).
    // All 4 Phase 2 layouts swap in their dedicated CSS module
    // classes; the placeholder fallback for image_border_text_center
    // (a single-image layout, NOT in MULTI_IMAGE_LAYOUTS) lands in
    // C5 with the centered-text-panel-over-image visual.
    two_images_text_center: styles.canvasLayoutTwoImagesTextCenter,
    split_horizontal: styles.canvasLayoutSplitHorizontal,
    split_vertical: styles.canvasLayoutSplitVertical,
    image_border_text_center: styles.canvasLayoutImageBorderTextCenter,
    // Phase 3 C1 (2026-05-28). Collage dispatches to its own
    // ``CollageCanvas`` component before this Record's class is
    // applied — see the early return below. Fallback to the same
    // ``image_top_text_bottom`` class as a defensive default,
    // matching the comic_panel_grid pattern.
    collage: styles.canvasLayoutImageTopTextBottom,
}

export default function PageCanvas({page, bookId, onUpdate, onEditorReady}: Props) {
    const {
        fileInputRef,
        uploading,
        uploadError,
        setUploadError,
        handleFileChange,
        uploadPrimaryFile,
        secondaryFileInputRef,
        uploadingSecondary,
        uploadSecondaryError,
        handleSecondaryFileChange,
    } = usePageImageUpload({page, bookId, onUpdate})
    // PB-PHASE4 Session 4c-B-1 fix C: defensive plain-text
    // extraction. Switching a page from a TipTap layout to a
    // Tier-Property layout preserves text_content (per v0.34.0
    // Fix A which only purges layout_config). The textarea then
    // renders whatever string is there; without this defense,
    // a JSON-shaped string from the prior TipTap edits would
    // display literally. extractPlainText handles both legacy
    // plain text AND JSON-shaped strings transparently.
    const [textDraft, setTextDraft] = useState(() =>
        extractPlainText(page.text_content),
    )
    // PB-PHASE4 Session 4c-B-1 Commit 2: per-layout TipTap state.
    // TIPTAP_LAYOUTS render through RichTextEditor; their content
    // is a parsed JSONContent (legacy plain text auto-wraps on
    // read per D4 backward-compat). The non-TipTap layouts keep
    // using textDraft above.
    const [textJson, setTextJson] = useState<JSONContent | null>(() =>
        parseTextContentToJson(page.text_content),
    )

    useEffect(() => {
        setTextDraft(extractPlainText(page.text_content))
        setTextJson(parseTextContentToJson(page.text_content))
        setUploadError(null)
    }, [page.id, page.text_content, setUploadError])

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
    // Phase 2 C2 (2026-05-28): multi-image layouts read the SECONDARY
    // image asset id from layout_config[layout].secondary_image_asset_id
    // via the M1 helper. isMultiImage gates the secondary image region
    // rendering; hasSecondaryImage gates the on-region affordance
    // (placeholder vs <img> + replace button).
    const isMultiImage = isMultiImageLayout(page.layout as PageLayout)
    const secondaryImageAssetId = readSecondaryImageAssetId(
        page.layout_config,
        page.layout as PageLayout,
    )
    const hasSecondaryImage = Boolean(secondaryImageAssetId)
    const layoutClass = LAYOUT_CLASS[page.layout as PageLayout] ?? LAYOUT_CLASS.image_top_text_bottom
    const isSpeechBubble = page.layout === "speech_bubble"
    const isTextOnly = page.layout === "text_only"
    // Phase 1 C2 (2026-05-28): full-bleed image with no text
    // region. Mirror of ``isTextOnly`` (which suppresses the
    // image region). Per Q5: silently ignore ``text_content``
    // when this layout is active — the value stays in storage
    // and re-surfaces on the next layout switch back to a
    // text-bearing layout.
    const isImageFullNoText = page.layout === "image_full_no_text"
    // Fix B (4c-B sub-item): extract the active layout's namespace
    // before reading per-key fields. Legacy-flat configs return the
    // whole dict (transparent backward-compat). Namespaced configs
    // return the layout's own bucket; sibling-layout namespaces are
    // invisible to this layout's renderer.
    const layoutNamespace = readLayoutNamespace(
        page.layout_config,
        page.layout as PageLayout,
    )
    const speechBubbleStyle = isSpeechBubble
        ? speechBubbleInlineStyle(layoutNamespace)
        : undefined

    const {
        imagePosition,
        imageFit,
        splitRatio,
        textPosition,
        canvasInlineStyle,
        regionImageInlineStyle,
        imageInlineStyle,
        imageLayoutTierStyle,
        borderTextStyle,
        overlayTextStyle,
    } = computePageCanvasStyles(page, layoutNamespace)

    // Phase 3 C1 (2026-05-28). Collage layout dispatches to its
    // dedicated component. The dispatch lives in the JSX return
    // (not as an early-return at the function top) so ALL hooks
    // above still fire on every render — even when the active
    // layout is collage — keeping the hook order stable per
    // React's Rules of Hooks. The grid-based default canvas
    // (everything else in the return below) shares no state with
    // CollageCanvas, so the inert hook calls are harmless.
    //
    // Phase 3 C2 (2026-05-28): forward ``onUpdate`` so the
    // collage's image drag-to-position handlers can persist.
    if (page.layout === "collage") {
        return (
            <CollageCanvas
                page={page}
                bookId={bookId}
                onUpdate={onUpdate}
            />
        )
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
                    <PrimaryImageRegion
                        page={page}
                        bookId={bookId}
                        hasImage={hasImage}
                        regionImageInlineStyle={regionImageInlineStyle}
                        imageInlineStyle={imageInlineStyle}
                        fileInputRef={fileInputRef}
                        uploading={uploading}
                        handleFileChange={handleFileChange}
                        onDropImage={uploadPrimaryFile}
                    />
                )}
                {!isImageFullNoText && (
                    <TextRegion
                        page={page}
                        bookId={bookId}
                        isSpeechBubble={isSpeechBubble}
                        speechBubbleStyle={speechBubbleStyle}
                        overlayTextStyle={overlayTextStyle}
                        borderTextStyle={borderTextStyle}
                        imageLayoutTierStyle={imageLayoutTierStyle}
                        layoutNamespace={layoutNamespace}
                        textJson={textJson}
                        handleRichTextChange={handleRichTextChange}
                        onEditorReady={onEditorReady}
                        textDraft={textDraft}
                        setTextDraft={setTextDraft}
                        handleTextBlur={handleTextBlur}
                    />
                )}
                {isMultiImage && (
                    <SecondaryImageRegion
                        bookId={bookId}
                        hasSecondaryImage={hasSecondaryImage}
                        secondaryImageAssetId={secondaryImageAssetId}
                        imageInlineStyle={imageInlineStyle}
                        secondaryFileInputRef={secondaryFileInputRef}
                        uploadingSecondary={uploadingSecondary}
                        handleSecondaryFileChange={handleSecondaryFileChange}
                    />
                )}
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
            {uploadSecondaryError && (
                <div
                    className={styles.uploadError}
                    role="alert"
                    data-testid="page-canvas-upload-secondary-error"
                >
                    {uploadSecondaryError}
                </div>
            )}
        </div>
    )
}
