import { useCallback, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";

/**
 * Live word + character count for the TipTap editor.
 *
 * The count is computed directly from ``editor.state.doc.textContent``
 * (NOT the CharacterCount extension's ``storage.words()``, which
 * returned stale values under React StrictMode + Playwright + Vite -
 * see issue #12). The caller drives it from the existing ``onUpdate``
 * config callback by calling the returned ``syncCounts`` - that path
 * already runs for the autosave debounce, so piggy-backing the count
 * there avoids a second editor listener entirely.
 *
 * ``syncCounts`` is backed by a ref so the identity stays stable and
 * the ``useEditor`` ``onUpdate`` closure (captured once at editor
 * construction) always reaches the current implementation. The caller
 * still owns the on-mount seed effect because the ``editor`` instance
 * is created after this hook runs.
 */
export function useEditorWordCount(): {
    wordCount: number;
    charCount: number;
    syncCounts: (editor: TiptapEditor) => void;
} {
    const [wordCount, setWordCount] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const syncCountsImpl = useRef<(ed: TiptapEditor) => void>(() => {});
    syncCountsImpl.current = (ed: TiptapEditor) => {
        const text = ed.state.doc.textContent;
        const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
        setWordCount(words);
        setCharCount(text.length);
    };
    const syncCounts = useCallback((ed: TiptapEditor) => {
        syncCountsImpl.current(ed);
    }, []);
    return { wordCount, charCount, syncCounts };
}
