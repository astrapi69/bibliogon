import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Figure from "@pentestpad/tiptap-extension-figure";
import { Footnotes, FootnoteReference, Footnote } from "tiptap-footnotes";
import { SearchAndReplace } from "../extensions/searchAndReplace";
import OfficePaste from "@intevation/tiptap-extension-office-paste";
import Focus from "@tiptap/extension-focus";
import { InlineMathDollar, BlockMathDollar } from "../extensions/math";
import { StyleCheckExtension } from "../extensions/StyleCheckExtension";

/**
 * Build the full TipTap extension set the Bibliogon prose editor mounts.
 *
 * Pure config factory: it constructs (but does not instantiate) the
 * extension array used by ``Editor``'s ``useEditor`` call, so the array
 * stays a single source of truth without changing the hook ordering in
 * the component. The Story Bible @-mention extension is per-book and
 * built by the caller (it needs the i18n-translated popup labels), so it
 * is passed in already-constructed rather than built here.
 *
 * NOTE: this module is imported only by ``Editor.tsx`` and never executed
 * by the Vitest suite (the page-level tests mock ``../components/Editor``).
 * The ``@pentestpad/tiptap-extension-figure`` CJS build crashes under
 * Vitest's module interop; keeping this a function (instantiated only in
 * the browser/ESM path) preserves that boundary.
 *
 * @param placeholder - Placeholder prop forwarded from ``Editor``; the
 *   empty-document hint shown by the Placeholder extension. Falls back to
 *   the German default when unset.
 * @param mentionExtensions - Pre-built Story Bible mention extension(s),
 *   or an empty array when ``mentionBookId`` is not set.
 * @example
 * useEditor({ extensions: buildEditorExtensions(placeholder, mentions) })
 */
export function buildEditorExtensions(
    placeholder: string | undefined,
    mentionExtensions: AnyExtension[],
): AnyExtension[] {
    return [
        StarterKit.configure({ link: false, underline: false }),
        Figure.configure({
            allowBase64: true,
        }),
        Link.configure({
            openOnClick: false,
            HTMLAttributes: {
                class: "tiptap-link",
            },
        }),
        TextAlign.configure({
            types: ["heading", "paragraph"],
        }),
        Underline,
        Subscript,
        Superscript,
        Highlight.configure({ multicolor: true }),
        Typography,
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        TaskList,
        TaskItem.configure({ nested: true }),
        CharacterCount,
        TextStyle,
        Color,
        Footnotes,
        FootnoteReference,
        Footnote,
        InlineMathDollar.configure({
            katexOptions: { throwOnError: false },
        }),
        BlockMathDollar.configure({
            katexOptions: { throwOnError: false },
        }),
        SearchAndReplace.configure({
            disableRegex: true,
        }),
        Placeholder.configure({
            placeholder: placeholder || "Beginne zu schreiben...",
        }),
        OfficePaste,
        Focus.configure({
            className: "has-focus",
            mode: "deepest",
        }),
        StyleCheckExtension,
        ...mentionExtensions,
    ];
}
