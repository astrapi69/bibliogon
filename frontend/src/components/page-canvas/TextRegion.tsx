import React from "react"
import type {JSONContent} from "@tiptap/core"
import type {Editor} from "@tiptap/react"
import {type Page, type PageLayout} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import RichTextEditor from "../editor/RichTextEditor"
import {isTipTapLayout} from "../../lib/utils/pageTextContent"
import {readBubbleConfig} from "../../lib/utils/pageLayoutStyles"
import styles from "../PageCanvas.module.css"

interface Props {
    page: Page
    bookId: string
    isSpeechBubble: boolean
    speechBubbleStyle: React.CSSProperties | undefined
    overlayTextStyle: React.CSSProperties
    borderTextStyle: React.CSSProperties
    imageLayoutTierStyle: React.CSSProperties
    layoutNamespace: Record<string, unknown> | null
    textJson: JSONContent | null
    handleRichTextChange: (next: JSONContent) => void
    onEditorReady?: (editor: Editor | null) => void
    textDraft: string
    setTextDraft: React.Dispatch<React.SetStateAction<string>>
    handleTextBlur: () => Promise<void>
}

/**
 * PB-PHASE4 god-file split: the text region extracted from
 * PageCanvas. JSX moved verbatim; the rendered DOM (classes, inline
 * styles, testids, element order) is byte-identical. The style
 * ternary stays inline so the resolved per-layout style object is
 * computed exactly as before.
 */
export default function TextRegion({
    page,
    bookId,
    isSpeechBubble,
    speechBubbleStyle,
    overlayTextStyle,
    borderTextStyle,
    imageLayoutTierStyle,
    layoutNamespace,
    textJson,
    handleRichTextChange,
    onEditorReady,
    textDraft,
    setTextDraft,
    handleTextBlur,
}: Props) {
    const {t} = useI18n()
    return (
        <div
            data-testid={
                isSpeechBubble
                    ? "page-canvas-speech-bubble"
                    : "page-canvas-region-text"
            }
            data-region="text"
            data-anchor={
                isSpeechBubble
                    ? ((readBubbleConfig(
                          layoutNamespace,
                      ).anchor_position as string) ?? "bottom-center")
                    : undefined
            }
            className={`${styles.region} ${styles.regionText}`}
            style={
                isSpeechBubble
                    ? speechBubbleStyle
                    : page.layout === "image_full_text_overlay"
                      ? overlayTextStyle
                      : page.layout === "image_border_text_center"
                        ? borderTextStyle
                        : page.layout === "image_top_text_bottom" ||
                            page.layout === "image_left_text_right" ||
                            page.layout === "image_bottom_text_top" ||
                            page.layout === "image_right_text_left"
                          ? imageLayoutTierStyle
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
                    mentionBookId={bookId}
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
    )
}
