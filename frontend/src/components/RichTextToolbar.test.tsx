/**
 * Tests for RichTextToolbar (PB-PHASE4 Session 4c-B-1 Commit 3).
 *
 * Strategy: render a host component that mounts a RichTextEditor
 * AND the RichTextToolbar with the same editor instance. Drive
 * the editor via its command API (mirroring keyboard behavior in
 * a way that's deterministic in happy-dom), then assert:
 *   - the button click invokes the expected toolbar action
 *   - the aria-pressed state reflects ``editor.isActive(...)``
 *
 * Covered: every D1 MVP button (Bold, Italic, Underline, H1-3,
 * BulletList, OrderedList, Align L/C/R) — 11 buttons total +
 * the null-editor render-nothing case.
 */

import React, {useState} from "react"
import {describe, it, expect, vi} from "vitest"
import {render, screen, fireEvent, waitFor, act} from "@testing-library/react"
import type {Editor} from "@tiptap/react"
import type {JSONContent} from "@tiptap/core"

import RichTextEditor from "./RichTextEditor"
import RichTextToolbar from "./RichTextToolbar"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

function makeDoc(text: string): JSONContent {
    return {
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: text ? [{type: "text", text}] : undefined,
            },
        ],
    }
}

/** Host: mounts RichTextEditor + RichTextToolbar against the same
 *  Editor instance. The test then drives via ``editorRef`` for
 *  deterministic happy-dom behavior. */
function Host({
    initialContent = makeDoc("Hello world"),
    onEditorRef,
}: {
    initialContent?: JSONContent
    onEditorRef?: (e: Editor) => void
}) {
    const [editor, setEditor] = useState<Editor | null>(null)
    return (
        <>
            <RichTextEditor
                content={initialContent}
                testidNamespace="rt"
                onEditorReady={(e) => {
                    setEditor(e)
                    onEditorRef?.(e)
                }}
            />
            <RichTextToolbar editor={editor} testidNamespace="tb" />
        </>
    )
}

describe("RichTextToolbar — null editor", () => {
    it("renders nothing when editor is null", () => {
        const {container} = render(
            <RichTextToolbar editor={null} testidNamespace="tb" />,
        )
        expect(screen.queryByTestId("tb-root")).toBeNull()
        // No DOM at all when null — useful sanity check.
        expect(container.firstChild).toBeNull()
    })
})

describe("RichTextToolbar — D1 MVP buttons render against a live editor", () => {
    it("renders the root + all 11 MVP buttons", async () => {
        render(<Host />)
        await waitFor(() => expect(screen.getByTestId("tb-root")).toBeTruthy())
        for (const id of [
            "tb-bold",
            "tb-italic",
            "tb-underline",
            "tb-h1",
            "tb-h2",
            "tb-h3",
            "tb-bullet-list",
            "tb-ordered-list",
            "tb-align-left",
            "tb-align-center",
            "tb-align-right",
        ]) {
            expect(screen.getByTestId(id)).toBeTruthy()
        }
    })

    it("clicking Bold toggles the bold mark on the current selection", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        // Select all so the toggle applies to the existing text.
        act(() => editorRef!.commands.selectAll())
        fireEvent.click(screen.getByTestId("tb-bold"))
        await waitFor(() => expect(editorRef!.isActive("bold")).toBe(true))
        // Click again toggles off.
        fireEvent.click(screen.getByTestId("tb-bold"))
        await waitFor(() => expect(editorRef!.isActive("bold")).toBe(false))
    })

    it("clicking Italic toggles the italic mark", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        act(() => editorRef!.commands.selectAll())
        fireEvent.click(screen.getByTestId("tb-italic"))
        await waitFor(() => expect(editorRef!.isActive("italic")).toBe(true))
    })

    it("clicking Underline toggles the underline mark (separate extension)", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        act(() => editorRef!.commands.selectAll())
        fireEvent.click(screen.getByTestId("tb-underline"))
        await waitFor(() => expect(editorRef!.isActive("underline")).toBe(true))
    })

    it("clicking H1 toggles a heading level 1", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        fireEvent.click(screen.getByTestId("tb-h1"))
        await waitFor(() =>
            expect(editorRef!.isActive("heading", {level: 1})).toBe(true),
        )
    })

    it("clicking H2 + H3 toggles the corresponding heading level", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        fireEvent.click(screen.getByTestId("tb-h2"))
        await waitFor(() =>
            expect(editorRef!.isActive("heading", {level: 2})).toBe(true),
        )
        fireEvent.click(screen.getByTestId("tb-h3"))
        await waitFor(() =>
            expect(editorRef!.isActive("heading", {level: 3})).toBe(true),
        )
    })

    it("clicking Bullet List toggles a bulletList node", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        fireEvent.click(screen.getByTestId("tb-bullet-list"))
        await waitFor(() =>
            expect(editorRef!.isActive("bulletList")).toBe(true),
        )
    })

    it("clicking Ordered List toggles an orderedList node", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        fireEvent.click(screen.getByTestId("tb-ordered-list"))
        await waitFor(() =>
            expect(editorRef!.isActive("orderedList")).toBe(true),
        )
    })

    it("clicking Align Center sets textAlign=center on the current block", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        fireEvent.click(screen.getByTestId("tb-align-center"))
        await waitFor(() =>
            expect(editorRef!.isActive({textAlign: "center"})).toBe(true),
        )
    })

    it("Align L / C / R are mutually exclusive (last-click wins)", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        fireEvent.click(screen.getByTestId("tb-align-center"))
        await waitFor(() =>
            expect(editorRef!.isActive({textAlign: "center"})).toBe(true),
        )
        fireEvent.click(screen.getByTestId("tb-align-right"))
        await waitFor(() =>
            expect(editorRef!.isActive({textAlign: "right"})).toBe(true),
        )
        // center is no longer active
        expect(editorRef!.isActive({textAlign: "center"})).toBe(false)
    })

    it("aria-pressed reflects active mark state (Bold)", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        const btn = screen.getByTestId("tb-bold")
        expect(btn.getAttribute("aria-pressed")).toBe("false")
        act(() => editorRef!.commands.selectAll())
        fireEvent.click(btn)
        await waitFor(() =>
            expect(btn.getAttribute("aria-pressed")).toBe("true"),
        )
    })

    it("aria-pressed reflects active heading level (H2)", async () => {
        let editorRef: Editor | null = null
        render(<Host onEditorRef={(e) => (editorRef = e)} />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        const btn = screen.getByTestId("tb-h2")
        expect(btn.getAttribute("aria-pressed")).toBe("false")
        fireEvent.click(btn)
        await waitFor(() =>
            expect(btn.getAttribute("aria-pressed")).toBe("true"),
        )
    })

    it("buttons are disabled when the editor is in read-only mode", async () => {
        let editorRef: Editor | null = null

        function ReadOnlyHost() {
            const [editor, setEditor] = useState<Editor | null>(null)
            return (
                <>
                    <RichTextEditor
                        content={makeDoc("Read only")}
                        editable={false}
                        testidNamespace="rt"
                        onEditorReady={(e) => {
                            setEditor(e)
                            editorRef = e
                        }}
                    />
                    <RichTextToolbar editor={editor} testidNamespace="tb" />
                </>
            )
        }

        render(<ReadOnlyHost />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        await waitFor(() => expect(screen.getByTestId("tb-root")).toBeTruthy())
        // All buttons are disabled.
        for (const id of [
            "tb-bold",
            "tb-italic",
            "tb-h1",
            "tb-bullet-list",
            "tb-align-center",
        ]) {
            const btn = screen.getByTestId(id) as HTMLButtonElement
            expect(btn.disabled).toBe(true)
        }
    })

    it("role=toolbar with an aria-label is set for accessibility", async () => {
        render(<Host />)
        await waitFor(() => expect(screen.getByTestId("tb-root")).toBeTruthy())
        const root = screen.getByTestId("tb-root")
        expect(root.getAttribute("role")).toBe("toolbar")
        expect(root.getAttribute("aria-label")).toBe("Text formatting")
    })
})

// PB-PHASE4 Session 4c-B-1 Finding G (G2): RichTextToolbar Font
// dropdown. Native <select> over Radix DropdownMenu per the
// lessons-learned rule on Radix-in-happy-dom brittleness; tests
// can drive it via fireEvent.change cleanly.
describe("RichTextToolbar — Font dropdown (Finding G2)", () => {
    it("renders the font dropdown with the Default sentinel + 5 OFL fonts", async () => {
        render(<Host />)
        await waitFor(() => expect(screen.getByTestId("tb-root")).toBeTruthy())
        const select = screen.getByTestId(
            "tb-font-family",
        ) as HTMLSelectElement
        expect(select).toBeTruthy()
        // 1 Default sentinel + 5 fonts (Atkinson Hyperlegible,
        // Andika, Comic Neue, Lexend, OpenDyslexic) = 6 options.
        expect(select.options.length).toBe(6)
        // First option is the Default sentinel.
        expect(select.options[0].value).toBe("__default__")
        // Atkinson Hyperlegible is the first real font option
        // (D11 backward-compat default).
        expect(select.options[1].value).toBe("Atkinson Hyperlegible")
    })

    it("default selection is the Default sentinel when no fontFamily mark is set", async () => {
        render(<Host />)
        await waitFor(() => expect(screen.getByTestId("tb-root")).toBeTruthy())
        const select = screen.getByTestId(
            "tb-font-family",
        ) as HTMLSelectElement
        expect(select.value).toBe("__default__")
    })

    it("changing the dropdown to Andika sets the fontFamily mark on the current selection", async () => {
        let editorRef: Editor | null = null
        render(
            <Host
                onEditorRef={(e) => {
                    editorRef = e
                }}
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())
        // Select the whole doc so the change applies broadly.
        act(() => {
            editorRef!.commands.selectAll()
        })
        const select = screen.getByTestId(
            "tb-font-family",
        ) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "Andika"}})
        // The contract the G4 PDF walker depends on: the JSON
        // carries a textStyle mark with fontFamily=Andika.
        const json = editorRef!.getJSON()
        expect(JSON.stringify(json)).toContain('"fontFamily":"Andika"')
    })

    it("changing the dropdown to the Default sentinel removes the fontFamily mark", async () => {
        let editorRef: Editor | null = null
        render(
            <Host
                onEditorRef={(e) => {
                    editorRef = e
                }}
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())
        // First apply a font.
        act(() => {
            editorRef!.commands.selectAll()
            editorRef!.commands.setFontFamily("Lexend")
        })
        expect(JSON.stringify(editorRef!.getJSON())).toContain(
            '"fontFamily":"Lexend"',
        )
        // Then revert via the dropdown.
        const select = screen.getByTestId(
            "tb-font-family",
        ) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "__default__"}})
        // Mark should be gone.
        expect(JSON.stringify(editorRef!.getJSON())).not.toContain(
            '"fontFamily"',
        )
    })

    // PB-PHASE4 Session 4c-B-1 smoke Bug 3 (2026-05-18):
    // picking a font WITHOUT a prior selection must still apply
    // the font to the ENTIRE document. Picture-book convention is
    // one page one consistent font; per-character variation isn't
    // meaningful. The dropdown's onChange handler now wraps the
    // (un)setFontFamily call in selectAll() to enforce that.
    it("Bug 3: picking a font with NO prior selection applies it to the entire document", async () => {
        let editorRef: Editor | null = null
        render(
            <Host
                initialContent={{
                    type: "doc",
                    content: [
                        {
                            type: "paragraph",
                            content: [
                                {type: "text", text: "first paragraph"},
                            ],
                        },
                        {
                            type: "paragraph",
                            content: [
                                {type: "text", text: "second paragraph"},
                            ],
                        },
                    ],
                }}
                onEditorRef={(e) => {
                    editorRef = e
                }}
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())
        // Place the caret at the very start of the doc — NO range
        // selection. Without the Bug 3 auto-select-all, setFontFamily
        // would land as a zero-width mark + apply only to text typed
        // after the caret. With Bug 3 the dropdown wraps in
        // selectAll() so both paragraphs get the mark.
        act(() => {
            editorRef!.commands.setTextSelection(0)
        })
        const select = screen.getByTestId(
            "tb-font-family",
        ) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "Andika"}})

        const json = JSON.stringify(editorRef!.getJSON())
        // Both text runs must carry the fontFamily=Andika mark.
        // Counting occurrences: 2 paragraphs × 1 text node each =
        // 2 textStyle marks with fontFamily=Andika.
        const matches = json.match(/"fontFamily":"Andika"/g) || []
        expect(matches.length).toBe(2)
    })

    it("Bug 3: picking the Default sentinel with NO prior selection clears the mark from the entire document", async () => {
        let editorRef: Editor | null = null
        render(
            <Host
                initialContent={{
                    type: "doc",
                    content: [
                        {
                            type: "paragraph",
                            content: [
                                {
                                    type: "text",
                                    text: "first",
                                    marks: [
                                        {
                                            type: "textStyle",
                                            attrs: {fontFamily: "Lexend"},
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            type: "paragraph",
                            content: [
                                {
                                    type: "text",
                                    text: "second",
                                    marks: [
                                        {
                                            type: "textStyle",
                                            attrs: {fontFamily: "Lexend"},
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                }}
                onEditorRef={(e) => {
                    editorRef = e
                }}
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())
        // Caret at position 0 — no range selection.
        act(() => {
            editorRef!.commands.setTextSelection(0)
        })
        const select = screen.getByTestId(
            "tb-font-family",
        ) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "__default__"}})

        const json = JSON.stringify(editorRef!.getJSON())
        // Marks gone from BOTH paragraphs (the entire document).
        expect(json).not.toContain('"fontFamily"')
    })

    it("dropdown reflects the active fontFamily mark when one is set", async () => {
        let editorRef: Editor | null = null
        render(
            <Host
                onEditorRef={(e) => {
                    editorRef = e
                }}
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())
        act(() => {
            editorRef!.commands.selectAll()
            editorRef!.commands.setFontFamily("Comic Neue")
        })
        const select = screen.getByTestId(
            "tb-font-family",
        ) as HTMLSelectElement
        // The select's value tracks the active mark via
        // getAttributes('textStyle').fontFamily.
        await waitFor(() => expect(select.value).toBe("Comic Neue"))
    })
})
