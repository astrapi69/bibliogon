/**
 * RichTextEditor — TipTap wrapper for non-chapter rich-text
 * contexts (picture-book pages, future article-comment editing, etc.).
 *
 * Background (PB-PHASE4 Session 4c-B-1 Pre-Inspection):
 * the existing ``Editor.tsx`` mounts ~20 TipTap extensions and
 * carries chapter-system coupling (draft cache keyed on chapterId,
 * autosave to ``/api/chapters/{id}/content``, AI-review wired to
 * book context, plugin gates that assume "article" | "book-chapter").
 * Reusing Editor.tsx for picture-book pages would either inherit
 * those couplings or require deep prop-parameterization.
 *
 * Per the Recurring-Component Unification Rule (closed-set vs
 * open-set discovery; codified 2026-05-19 at f06ae35): a SECOND
 * surface needing rich-text editing on a non-chapter context
 * triggers extraction. This component is the extraction — a
 * lightweight wrapper that:
 *
 * - mounts TipTap with a minimal MVP extension set (D1 decision:
 *   StarterKit + TextAlign + Underline + TextStyle + Color)
 * - takes / emits ``JSONContent`` (Editor.tsx's storage shape)
 * - exposes the ``Editor`` instance to the parent via
 *   ``onEditorReady`` so a separate Toolbar component can wire
 *   up to it (D3 / D6 decision: properties-pane Toolbar lives
 *   OUTSIDE the editor mount, parent owns placement)
 * - supports ``editable: false`` for read-only render
 *
 * Owns NO debounce / persistence / draft-cache logic. The parent
 * (PageCanvas in 4c-B-1 Commit 2) owns those concerns scoped to
 * the page context (NOT the chapter context Editor.tsx hardcodes).
 */

import {useEditor, EditorContent, type Editor} from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import TextAlign from "@tiptap/extension-text-align"
import Underline from "@tiptap/extension-underline"
import TextStyle from "@tiptap/extension-text-style"
import Color from "@tiptap/extension-color"
import type {JSONContent} from "@tiptap/core"
import {useEffect, useRef} from "react"

interface Props {
    /** The current TipTap document. ``null`` renders an empty
     *  editor. ``undefined`` is treated as ``null``. */
    content: JSONContent | null
    /** Fires on every content change with the new JSON doc.
     *  Caller owns debounce + persistence. */
    onChange?: (next: JSONContent) => void
    /** When ``false``, the editor is read-only (display only).
     *  Defaults to ``true``. */
    editable?: boolean
    /** When provided, receives the ``Editor`` instance once
     *  TipTap has initialised. Pattern: parent stores the
     *  instance in a ref and feeds it to a separate Toolbar
     *  component for D6-C properties-pane placement. */
    onEditorReady?: (editor: Editor) => void
    /** Placeholder text for the empty-state. Plain string.
     *  TipTap's Placeholder extension is intentionally NOT
     *  included in the D1 MVP — picture-book pages have a
     *  short fallback shape; the parent renders the placeholder
     *  if needed. */
    placeholder?: string
    /** Testid namespace. Renders the root container with
     *  ``${testidNamespace}-root`` and the content with
     *  ``${testidNamespace}-content``. */
    testidNamespace: string
    /** Optional className for the root container. Lets callers
     *  apply layout-specific styles (e.g. the picture-book
     *  text region's fixed dimensions). */
    className?: string
}

export default function RichTextEditor({
    content,
    onChange,
    editable = true,
    onEditorReady,
    placeholder: _placeholder,
    testidNamespace,
    className,
}: Props) {
    // The D1 MVP extension set. Order matches Editor.tsx's
    // convention (StarterKit first, then individual extensions).
    // Color requires TextStyle as a dependency per TipTap docs;
    // both included.
    const editor = useEditor({
        extensions: [
            StarterKit,
            TextAlign.configure({types: ["heading", "paragraph"]}),
            Underline,
            TextStyle,
            Color,
        ],
        content: content ?? "",
        editable,
        onUpdate: ({editor: e}) => {
            if (onChange) onChange(e.getJSON())
        },
    })

    // Hand the instance up to the parent so it can wire a remote
    // Toolbar (D6-C placement). Fires once after initial mount
    // and on subsequent editor identity changes (rare; useEditor
    // returns a stable instance per mount).
    useEffect(() => {
        if (editor && onEditorReady) onEditorReady(editor)
    }, [editor, onEditorReady])

    // Sync external content changes (e.g. parent switches the
    // active page) into the editor. Cheap shallow JSON compare
    // avoids setContent on every render (each setContent is a
    // ProseMirror transaction with non-zero cost).
    //
    // Skip the FIRST run: useEditor already initialised the
    // editor with the prop's content (the ``content`` field in
    // the useEditor config above). The first useEffect tick
    // would otherwise call setContent redundantly + can cause
    // ProseMirror to emit an update event in happy-dom even
    // with emitUpdate=false (observed during 4c-B-1 Commit 2
    // PageCanvas test development). The hadFirstSync ref is
    // the canonical fix.
    const hadFirstSync = useRef(false)
    useEffect(() => {
        if (!editor) return
        if (!hadFirstSync.current) {
            hadFirstSync.current = true
            return
        }
        const current = editor.getJSON()
        const next = content ?? ""
        if (JSON.stringify(current) !== JSON.stringify(next)) {
            // Positional ``emitUpdate=false`` second arg — don't
            // fire onChange in response to a programmatic
            // content swap. Otherwise the parent's onChange
            // would echo back into the content prop and loop.
            editor.commands.setContent(next, false)
        }
    }, [editor, content])

    // Sync external editable prop changes (e.g. parent toggles
    // a "preview mode" / "edit mode").
    useEffect(() => {
        if (editor) editor.setEditable(editable)
    }, [editor, editable])

    if (!editor) return null

    return (
        <div data-testid={`${testidNamespace}-root`} className={className}>
            <EditorContent editor={editor} data-testid={`${testidNamespace}-content`} />
        </div>
    )
}
