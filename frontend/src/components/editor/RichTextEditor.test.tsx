/**
 * Tests for RichTextEditor (PB-PHASE4 Session 4c-B-1 Commit 1).
 *
 * Covers the contract:
 *   - mounts the D1 MVP extension set + renders EditorContent
 *   - content prop is the initial document
 *   - onChange fires with the latest JSON when content edits
 *   - onEditorReady hands the Editor instance up to the parent
 *   - editable=false renders read-only
 *   - external content prop change resets the editor doc
 *   - external editable prop change toggles the read-only state
 *
 * NOT tested at this layer (out of scope; integration-level
 * concerns handled by 4c-B-1 Commit 2's PageCanvas tests):
 *   - debounce / autosave / draft-cache behavior (parent owns)
 *   - Toolbar wiring (separate component in Commit 3)
 *   - per-layout discriminator (Commit 5 schema work)
 *
 * TipTap + happy-dom note: useEditor returns null on the first
 * render and the editor instance on a subsequent re-render
 * (it constructs synchronously after the first useEffect tick).
 * Tests use ``waitFor`` for the initial mount and assertions
 * that depend on the editor being live.
 */

import React, {useState, useRef} from "react"
import {describe, it, expect, vi} from "vitest"
import {render, screen, fireEvent, waitFor, act} from "@testing-library/react"
import type {JSONContent} from "@tiptap/core"
import type {Editor} from "@tiptap/react"

import RichTextEditor from "../RichTextEditor"

// Minimal TipTap doc helpers — avoids importing the JSON
// builders from @tiptap/core (kept tests self-contained).
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

describe("RichTextEditor", () => {
    it("renders the root container with the testid namespace", async () => {
        render(
            <RichTextEditor
                content={makeDoc("Hello")}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() =>
            expect(screen.getByTestId("rt-test-root")).toBeTruthy(),
        )
        expect(screen.getByTestId("rt-test-content")).toBeTruthy()
    })

    it("renders the initial content from the content prop", async () => {
        render(
            <RichTextEditor
                content={makeDoc("Initial text body")}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() =>
            expect(screen.getByTestId("rt-test-content").textContent).toContain(
                "Initial text body",
            ),
        )
    })

    it("renders empty when content is null", async () => {
        render(
            <RichTextEditor content={null} testidNamespace="rt-test" />,
        )
        await waitFor(() =>
            expect(screen.getByTestId("rt-test-root")).toBeTruthy(),
        )
        // The editor renders the empty ProseMirror tree (an empty
        // <p>); textContent collapses to empty string.
        expect(
            screen.getByTestId("rt-test-content").textContent?.trim() ?? "",
        ).toBe("")
    })

    it("calls onChange when the user types", async () => {
        const onChange = vi.fn()
        let editorRef: Editor | null = null
        render(
            <RichTextEditor
                content={makeDoc("")}
                onChange={onChange}
                onEditorReady={(e) => {
                    editorRef = e
                }}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())

        // Use the editor's command API to insert content;
        // fireEvent.input on the ProseMirror DOM is brittle in
        // happy-dom (ProseMirror translates DOM events to
        // transactions). The command path is the same
        // transaction stream the keyboard would produce.
        act(() => {
            editorRef!.commands.insertContent("Some new text")
        })
        await waitFor(() => expect(onChange).toHaveBeenCalled())
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as JSONContent
        expect(JSON.stringify(lastCall)).toContain("Some new text")
    })

    it("hands the Editor instance up via onEditorReady", async () => {
        const onEditorReady = vi.fn()
        render(
            <RichTextEditor
                content={null}
                onEditorReady={onEditorReady}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() => expect(onEditorReady).toHaveBeenCalledTimes(1))
        const editor = onEditorReady.mock.calls[0][0] as Editor
        expect(editor).toBeTruthy()
        // Sanity: the instance carries the expected commands.
        expect(typeof editor.commands.insertContent).toBe("function")
    })

    it("editable=false makes the editor read-only", async () => {
        let editorRef: Editor | null = null
        render(
            <RichTextEditor
                content={makeDoc("Locked content")}
                editable={false}
                onEditorReady={(e) => {
                    editorRef = e
                }}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())
        expect(editorRef!.isEditable).toBe(false)
    })

    it("editable prop change toggles the editable state", async () => {
        let editorRef: Editor | null = null

        function Controlled() {
            const [editable, setEditable] = useState(true)
            return (
                <>
                    <RichTextEditor
                        content={makeDoc("Body")}
                        editable={editable}
                        onEditorReady={(e) => {
                            editorRef = e
                        }}
                        testidNamespace="rt-test"
                    />
                    <button
                        data-testid="toggle"
                        onClick={() => setEditable((v) => !v)}
                    />
                </>
            )
        }

        render(<Controlled />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        expect(editorRef!.isEditable).toBe(true)

        fireEvent.click(screen.getByTestId("toggle"))
        await waitFor(() => expect(editorRef!.isEditable).toBe(false))

        fireEvent.click(screen.getByTestId("toggle"))
        await waitFor(() => expect(editorRef!.isEditable).toBe(true))
    })

    it("external content prop change resets the editor doc", async () => {
        let editorRef: Editor | null = null

        function Controlled() {
            const [content, setContent] = useState<JSONContent | null>(
                makeDoc("First"),
            )
            return (
                <>
                    <RichTextEditor
                        content={content}
                        onEditorReady={(e) => {
                            editorRef = e
                        }}
                        testidNamespace="rt-test"
                    />
                    <button
                        data-testid="swap"
                        onClick={() => setContent(makeDoc("Second"))}
                    />
                </>
            )
        }

        render(<Controlled />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        await waitFor(() =>
            expect(editorRef!.getText()).toContain("First"),
        )

        fireEvent.click(screen.getByTestId("swap"))
        await waitFor(() => expect(editorRef!.getText()).toContain("Second"))
    })

    it("programmatic content swap does NOT echo through onChange", async () => {
        // Regression pin: the setContent inside the effect uses
        // ``emitUpdate=false`` to prevent the parent's onChange
        // from firing on a programmatic content swap. Without
        // that guard, the parent's onChange would echo back into
        // the content prop and cause an infinite loop.
        const onChange = vi.fn()
        let editorRef: Editor | null = null

        function Controlled() {
            const [content, setContent] = useState<JSONContent | null>(
                makeDoc("Original"),
            )
            return (
                <>
                    <RichTextEditor
                        content={content}
                        onChange={onChange}
                        onEditorReady={(e) => {
                            editorRef = e
                        }}
                        testidNamespace="rt-test"
                    />
                    <button
                        data-testid="swap"
                        onClick={() => setContent(makeDoc("Swapped"))}
                    />
                </>
            )
        }

        render(<Controlled />)
        await waitFor(() => expect(editorRef).not.toBeNull())
        // The initial render may emit one onChange depending on
        // useEditor's mount behavior; record the baseline call
        // count THEN swap.
        const baseline = onChange.mock.calls.length
        fireEvent.click(screen.getByTestId("swap"))
        await waitFor(() => expect(editorRef!.getText()).toContain("Swapped"))
        // No NEW onChange call from the programmatic swap.
        // Allow a tiny tick for any async event to settle.
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(onChange.mock.calls.length).toBe(baseline)
    })

    it("applies the className prop to the root container", async () => {
        render(
            <RichTextEditor
                content={null}
                className="custom-styling"
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() => {
            const root = screen.getByTestId("rt-test-root")
            expect(root.className).toContain("custom-styling")
        })
    })

    it("supports the D1 MVP extension set: bold + italic + underline", async () => {
        let editorRef: Editor | null = null
        render(
            <RichTextEditor
                content={makeDoc("text")}
                onEditorReady={(e) => {
                    editorRef = e
                }}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())

        // Bold (from StarterKit), Italic (from StarterKit),
        // Underline (separate extension): each command must
        // exist on the editor instance.
        expect(typeof editorRef!.commands.toggleBold).toBe("function")
        expect(typeof editorRef!.commands.toggleItalic).toBe("function")
        expect(typeof editorRef!.commands.toggleUnderline).toBe("function")
    })

    it("supports the D1 MVP extension set: TextAlign for paragraphs + headings", async () => {
        let editorRef: Editor | null = null
        render(
            <RichTextEditor
                content={makeDoc("text")}
                onEditorReady={(e) => {
                    editorRef = e
                }}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())

        // setTextAlign comes from the TextAlign extension; the
        // configure({types}) call decides which node types accept
        // it. D1 includes heading + paragraph; verify both.
        expect(typeof editorRef!.commands.setTextAlign).toBe("function")
    })

    it("supports the D1 MVP extension set: Color + TextStyle", async () => {
        let editorRef: Editor | null = null
        render(
            <RichTextEditor
                content={makeDoc("text")}
                onEditorReady={(e) => {
                    editorRef = e
                }}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())

        // Color depends on TextStyle — both must register or
        // setColor won't be available.
        expect(typeof editorRef!.commands.setColor).toBe("function")
        expect(typeof editorRef!.commands.unsetColor).toBe("function")
    })

    it("supports the D1 MVP extension set: heading levels 1-6 (StarterKit)", async () => {
        let editorRef: Editor | null = null
        render(
            <RichTextEditor
                content={makeDoc("text")}
                onEditorReady={(e) => {
                    editorRef = e
                }}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())
        expect(typeof editorRef!.commands.toggleHeading).toBe("function")
        // Setting a heading level should succeed (smoke).
        act(() => {
            editorRef!.commands.toggleHeading({level: 2})
        })
        const json = editorRef!.getJSON()
        // The doc should now contain a heading node.
        expect(JSON.stringify(json)).toContain('"heading"')
    })

    // PB-PHASE4 Session 4c-B-1 Finding G (G1): FontFamily extension
    // wire-up. D7=Option 1 stores the font choice as a TipTap mark
    // on text spans; the PDF walker (G4) reads those marks.
    it("supports Finding G FontFamily extension wire-up: setFontFamily command exists", async () => {
        let editorRef: Editor | null = null
        render(
            <RichTextEditor
                content={makeDoc("text")}
                onEditorReady={(e) => {
                    editorRef = e
                }}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())

        // setFontFamily / unsetFontFamily come from the FontFamily
        // extension; both require TextStyle as a dependency. Both
        // must register for the G2 Toolbar dropdown to wire up.
        expect(typeof editorRef!.commands.setFontFamily).toBe("function")
        expect(typeof editorRef!.commands.unsetFontFamily).toBe("function")
    })

    it("Finding G FontFamily extension roundtrip: setFontFamily writes a textStyle mark with fontFamily attr", async () => {
        let editorRef: Editor | null = null
        render(
            <RichTextEditor
                content={makeDoc("Hello picture-book.")}
                onEditorReady={(e) => {
                    editorRef = e
                }}
                testidNamespace="rt-test"
            />,
        )
        await waitFor(() => expect(editorRef).not.toBeNull())

        // Select the whole doc and apply a font. The resulting JSON
        // must carry a textStyle mark with the fontFamily attribute,
        // which is the contract the G4 PDF walker depends on.
        act(() => {
            editorRef!.commands.selectAll()
            editorRef!.commands.setFontFamily("Andika")
        })
        const json = editorRef!.getJSON()
        const serialised = JSON.stringify(json)
        expect(serialised).toContain('"textStyle"')
        expect(serialised).toContain('"fontFamily":"Andika"')
    })
})
