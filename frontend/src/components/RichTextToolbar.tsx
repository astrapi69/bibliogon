/**
 * RichTextToolbar — formatting controls for the picture-book
 * RichTextEditor (PB-PHASE4 Session 4c-B-1 Commit 3).
 *
 * D6-C placement (per the 4c-B Pre-Inspection): mounts in the
 * PageEditor properties pane (right panel, below LayoutConfig).
 * The TipTap ``Editor`` instance is plumbed UP from PageCanvas
 * via the ``onEditorReady`` callback chain — this component just
 * receives the instance and wires buttons to its command API.
 *
 * MVP buttons (D1 extension set):
 *  - Bold, Italic, Underline
 *  - Heading levels 1-3
 *  - Bullet list, Ordered list
 *  - Align left / center / right
 *
 * NOT included (deferred to follow-ups OR handled elsewhere):
 *  - Color picker — needs a small swatch UI; lands with the
 *    Tier-Property TypographyEditor in 4c-B-2 since color is
 *    a Tier-Property concern too (shared discipline).
 *  - Code, Blockquote, Tables, Tasks — overkill for short
 *    picture-book text.
 *  - History (undo/redo) — TipTap StarterKit provides
 *    keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z); a UI
 *    affordance can land in a future tier.
 *
 * When ``editor`` is null (e.g. active page is a Tier-Property
 * layout, OR no active page at all), the toolbar renders
 * nothing. PageEditor decides WHETHER to mount this component
 * based on the active page's layout.
 */

import type {Editor} from "@tiptap/react"
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold,
    Heading1,
    Heading2,
    Heading3,
    Italic,
    List,
    ListOrdered,
    Underline,
} from "lucide-react"
import {useEffect, useState} from "react"
import {useI18n} from "../hooks/useI18n"
import styles from "./RichTextToolbar.module.css"

interface Props {
    /** The TipTap ``Editor`` instance. ``null`` (no active TipTap
     *  layout / no active page) → component renders nothing. */
    editor: Editor | null
    /** Testid namespace. Each button gets ``${ns}-{action}``. */
    testidNamespace?: string
}

export default function RichTextToolbar({
    editor,
    testidNamespace = "rich-text-toolbar",
}: Props) {
    const {t} = useI18n()
    // Force a re-render on every editor transaction so the
    // ``isActive`` reads below reflect the current selection
    // state. Without this subscription, the toolbar's
    // aria-pressed states freeze at whatever they were on the
    // last React re-render trigger.
    const [, forceUpdate] = useState({})
    useEffect(() => {
        if (!editor) return
        const handler = () => forceUpdate({})
        editor.on("transaction", handler)
        editor.on("selectionUpdate", handler)
        return () => {
            editor.off("transaction", handler)
            editor.off("selectionUpdate", handler)
        }
    }, [editor])

    if (!editor) return null

    const disabled = !editor.isEditable
    const isActive = (
        name: string,
        attrs?: Record<string, unknown>,
    ): boolean => {
        try {
            return attrs ? editor.isActive(name, attrs) : editor.isActive(name)
        } catch {
            return false
        }
    }

    return (
        <div
            data-testid={`${testidNamespace}-root`}
            className={styles.toolbar}
            role="toolbar"
            aria-label={t("ui.page_editor.toolbar.label", "Text formatting")}
        >
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                disabled={disabled}
                aria-pressed={isActive("bold")}
                data-testid={`${testidNamespace}-bold`}
                title={t("ui.page_editor.toolbar.bold", "Bold")}
                className={`${styles.btn} ${isActive("bold") ? styles.btnActive : ""}`}
            >
                <Bold size={14} />
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                disabled={disabled}
                aria-pressed={isActive("italic")}
                data-testid={`${testidNamespace}-italic`}
                title={t("ui.page_editor.toolbar.italic", "Italic")}
                className={`${styles.btn} ${isActive("italic") ? styles.btnActive : ""}`}
            >
                <Italic size={14} />
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                disabled={disabled}
                aria-pressed={isActive("underline")}
                data-testid={`${testidNamespace}-underline`}
                title={t("ui.page_editor.toolbar.underline", "Underline")}
                className={`${styles.btn} ${isActive("underline") ? styles.btnActive : ""}`}
            >
                <Underline size={14} />
            </button>

            <span className={styles.divider} aria-hidden="true" />

            <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({level: 1}).run()}
                disabled={disabled}
                aria-pressed={isActive("heading", {level: 1})}
                data-testid={`${testidNamespace}-h1`}
                title={t("ui.page_editor.toolbar.h1", "Heading 1")}
                className={`${styles.btn} ${isActive("heading", {level: 1}) ? styles.btnActive : ""}`}
            >
                <Heading1 size={14} />
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({level: 2}).run()}
                disabled={disabled}
                aria-pressed={isActive("heading", {level: 2})}
                data-testid={`${testidNamespace}-h2`}
                title={t("ui.page_editor.toolbar.h2", "Heading 2")}
                className={`${styles.btn} ${isActive("heading", {level: 2}) ? styles.btnActive : ""}`}
            >
                <Heading2 size={14} />
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleHeading({level: 3}).run()}
                disabled={disabled}
                aria-pressed={isActive("heading", {level: 3})}
                data-testid={`${testidNamespace}-h3`}
                title={t("ui.page_editor.toolbar.h3", "Heading 3")}
                className={`${styles.btn} ${isActive("heading", {level: 3}) ? styles.btnActive : ""}`}
            >
                <Heading3 size={14} />
            </button>

            <span className={styles.divider} aria-hidden="true" />

            <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                disabled={disabled}
                aria-pressed={isActive("bulletList")}
                data-testid={`${testidNamespace}-bullet-list`}
                title={t("ui.page_editor.toolbar.bullet_list", "Bullet list")}
                className={`${styles.btn} ${isActive("bulletList") ? styles.btnActive : ""}`}
            >
                <List size={14} />
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                disabled={disabled}
                aria-pressed={isActive("orderedList")}
                data-testid={`${testidNamespace}-ordered-list`}
                title={t("ui.page_editor.toolbar.ordered_list", "Ordered list")}
                className={`${styles.btn} ${isActive("orderedList") ? styles.btnActive : ""}`}
            >
                <ListOrdered size={14} />
            </button>

            <span className={styles.divider} aria-hidden="true" />

            <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign("left").run()}
                disabled={disabled}
                aria-pressed={isActive({textAlign: "left"} as never)}
                data-testid={`${testidNamespace}-align-left`}
                title={t("ui.page_editor.toolbar.align_left", "Align left")}
                className={`${styles.btn} ${editor.isActive({textAlign: "left"}) ? styles.btnActive : ""}`}
            >
                <AlignLeft size={14} />
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign("center").run()}
                disabled={disabled}
                aria-pressed={editor.isActive({textAlign: "center"})}
                data-testid={`${testidNamespace}-align-center`}
                title={t("ui.page_editor.toolbar.align_center", "Align center")}
                className={`${styles.btn} ${editor.isActive({textAlign: "center"}) ? styles.btnActive : ""}`}
            >
                <AlignCenter size={14} />
            </button>
            <button
                type="button"
                onClick={() => editor.chain().focus().setTextAlign("right").run()}
                disabled={disabled}
                aria-pressed={editor.isActive({textAlign: "right"})}
                data-testid={`${testidNamespace}-align-right`}
                title={t("ui.page_editor.toolbar.align_right", "Align right")}
                className={`${styles.btn} ${editor.isActive({textAlign: "right"}) ? styles.btnActive : ""}`}
            >
                <AlignRight size={14} />
            </button>
        </div>
    )
}
