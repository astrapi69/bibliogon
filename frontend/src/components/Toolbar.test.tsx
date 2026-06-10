/**
 * Toolbar tests — v0.32.0 F3 Copy split-button smoke.
 *
 * First Vitest file for the Toolbar component. Focused on the
 * new Copy split-button:
 *
 *  - The Copy button + chevron render in WYSIWYG mode
 *  - Both are hidden in Markdown-edit mode (the textarea already
 *    surfaces the Markdown source; the user can select-all + copy)
 *  - Clicking the primary Copy button triggers
 *    ``copyToClipboard`` with the Markdown output (including the
 *    documentTitle prepend when provided)
 *  - A clipboard failure surfaces an error toast
 *
 * The chevron-dropdown's two items are exercised end-to-end by the
 * matching Playwright spec at e2e/smoke/copy-toolbar.spec.ts —
 * Radix DropdownMenu inside happy-dom is brittle (same call-out as
 * the F2c ArticleEditor test).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Editor as TiptapEditor } from "@tiptap/react";

import Toolbar from "./Toolbar";

// --- Mocks -----------------------------------------------------------------

const copyToClipboardMock = vi.fn<(text: string) => Promise<boolean>>(
    async () => true,
);
const notifySuccess = vi.fn();
const notifyError = vi.fn();

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}));

vi.mock("../utils/clipboard", () => ({
    copyToClipboard: (text: string) => copyToClipboardMock(text),
}));

vi.mock("../utils/notify", () => ({
    notify: {
        success: (...args: unknown[]) => notifySuccess(...args),
        error: (...args: unknown[]) => notifyError(...args),
        info: vi.fn(),
        warning: vi.fn(),
        bulkAction: vi.fn(),
    },
}));

const promptMock = vi.fn<
    (
        title: string,
        message: string,
        placeholder?: string,
        defaultValue?: string,
    ) => Promise<string | null>
>(async () => "E=mc^2");

vi.mock("./AppDialog", () => ({
    useDialog: () => ({
        prompt: (...args: [string, string, string?, string?]) =>
            promptMock(...args),
        confirm: vi.fn(async () => true),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

// --- Helpers ---------------------------------------------------------------

function makeEditor(doc: object): TiptapEditor {
    // Minimal stub: only the methods Toolbar calls directly. Most
    // of the toolbar's format buttons go through ``.chain()`` etc.,
    // but our Copy-button test only consumes ``getJSON()`` and the
    // ``isActive`` / ``can`` probes used to compute button state.
    return {
        getJSON: () => doc,
        isActive: () => false,
        can: () => ({ chain: () => ({ focus: () => ({ undo: () => ({ run: () => false }), redo: () => ({ run: () => false }) }) }) }),
        chain: () => ({ focus: () => ({}) }),
    } as unknown as TiptapEditor;
}

const sampleDoc = {
    type: "doc",
    content: [
        {
            type: "paragraph",
            content: [{ type: "text", text: "Hello world." }],
        },
    ],
};

const requiredProps = {
    markdownMode: false,
    onToggleMarkdown: () => {},
};

beforeEach(() => {
    copyToClipboardMock.mockClear();
    copyToClipboardMock.mockImplementation(async () => true);
    notifySuccess.mockClear();
    notifyError.mockClear();
    promptMock.mockClear();
    promptMock.mockImplementation(async () => "E=mc^2");
});

// --- Tests -----------------------------------------------------------------

describe("Toolbar Copy split-button (F3)", () => {
    it("renders the Copy button + chevron in WYSIWYG mode", () => {
        render(<Toolbar editor={makeEditor(sampleDoc)} {...requiredProps} />);
        expect(screen.getByTestId("toolbar-copy-markdown")).toBeTruthy();
        expect(screen.getByTestId("toolbar-copy-chevron")).toBeTruthy();
        expect(screen.getByTestId("toolbar-copy-group")).toBeTruthy();
    });

    it("hides the Copy group in Markdown-edit mode", () => {
        render(
            <Toolbar
                editor={makeEditor(sampleDoc)}
                {...requiredProps}
                markdownMode={true}
            />,
        );
        expect(screen.queryByTestId("toolbar-copy-group")).toBeNull();
        expect(screen.queryByTestId("toolbar-copy-markdown")).toBeNull();
    });

    it("primary Copy button writes the Markdown-rendered body to the clipboard", async () => {
        render(<Toolbar editor={makeEditor(sampleDoc)} {...requiredProps} />);
        fireEvent.click(screen.getByTestId("toolbar-copy-markdown"));
        await waitFor(() => {
            expect(copyToClipboardMock).toHaveBeenCalledTimes(1);
        });
        expect(copyToClipboardMock.mock.calls[0][0]).toBe("Hello world.");
    });

    it("primary Copy button prepends documentTitle when provided", async () => {
        render(
            <Toolbar
                editor={makeEditor(sampleDoc)}
                {...requiredProps}
                documentTitle="My Article"
            />,
        );
        fireEvent.click(screen.getByTestId("toolbar-copy-markdown"));
        await waitFor(() => {
            expect(copyToClipboardMock).toHaveBeenCalled();
        });
        expect(copyToClipboardMock.mock.calls[0][0]).toBe(
            "# My Article\n\nHello world.",
        );
    });

    it("primary Copy button prepends title + subtitle when both are provided", async () => {
        render(
            <Toolbar
                editor={makeEditor(sampleDoc)}
                {...requiredProps}
                documentTitle="My Article"
                documentSubtitle="A subtitle"
            />,
        );
        fireEvent.click(screen.getByTestId("toolbar-copy-markdown"));
        await waitFor(() => {
            expect(copyToClipboardMock).toHaveBeenCalled();
        });
        expect(copyToClipboardMock.mock.calls[0][0]).toBe(
            "# My Article\n\n*A subtitle*\n\nHello world.",
        );
    });

    it("fires the success toast after a successful copy", async () => {
        render(<Toolbar editor={makeEditor(sampleDoc)} {...requiredProps} />);
        fireEvent.click(screen.getByTestId("toolbar-copy-markdown"));
        await waitFor(() => {
            expect(notifySuccess).toHaveBeenCalledTimes(1);
        });
        // First-arg sanity: should reference Markdown (not plain text)
        // since the primary button's default mode is Markdown.
        expect(notifySuccess.mock.calls[0][0]).toMatch(/Markdown/i);
    });

    it("fires the error toast when the clipboard API rejects", async () => {
        copyToClipboardMock.mockResolvedValueOnce(false);
        render(<Toolbar editor={makeEditor(sampleDoc)} {...requiredProps} />);
        fireEvent.click(screen.getByTestId("toolbar-copy-markdown"));
        await waitFor(() => {
            expect(notifyError).toHaveBeenCalledTimes(1);
        });
        expect(notifySuccess).not.toHaveBeenCalled();
    });
});

describe("Toolbar composition mode toggle (COMPOSITION-DISTRACTION-FREE-MODE-01)", () => {
    it("renders the composition button when onToggleComposition is provided", () => {
        render(
            <Toolbar
                editor={makeEditor(sampleDoc)}
                {...requiredProps}
                onToggleComposition={() => {}}
            />,
        );
        expect(screen.getByTestId("toolbar-composition")).toBeTruthy();
    });

    it("does not render the composition button without the handler", () => {
        render(<Toolbar editor={makeEditor(sampleDoc)} {...requiredProps} />);
        expect(screen.queryByTestId("toolbar-composition")).toBeNull();
    });

    it("hides the composition button in Markdown-edit mode", () => {
        render(
            <Toolbar
                editor={makeEditor(sampleDoc)}
                {...requiredProps}
                markdownMode={true}
                onToggleComposition={() => {}}
            />,
        );
        expect(screen.queryByTestId("toolbar-composition")).toBeNull();
    });

    it("fires onToggleComposition on click", () => {
        const onToggle = vi.fn();
        render(
            <Toolbar
                editor={makeEditor(sampleDoc)}
                {...requiredProps}
                onToggleComposition={onToggle}
            />,
        );
        fireEvent.click(screen.getByTestId("toolbar-composition"));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("reflects active state via aria-pressed", () => {
        render(
            <Toolbar
                editor={makeEditor(sampleDoc)}
                {...requiredProps}
                compositionMode={true}
                onToggleComposition={() => {}}
            />,
        );
        expect(
            screen.getByTestId("toolbar-composition").getAttribute("aria-pressed"),
        ).toBe("true");
    });
});

// --- Math formula buttons (TipTap v3 atom-node insert/edit via prompt) ------

interface MathCall {
    cmd: string;
    arg: unknown;
}

function makeMathEditor(opts: { active?: boolean; latex?: string } = {}): {
    editor: TiptapEditor;
    calls: MathCall[];
} {
    const calls: MathCall[] = [];
    const chain: Record<string, unknown> = {};
    const record = (cmd: string) => (arg: unknown) => {
        calls.push({ cmd, arg });
        return chain;
    };
    chain.focus = () => chain;
    chain.insertInlineMath = record("insertInlineMath");
    chain.updateInlineMath = record("updateInlineMath");
    chain.insertBlockMath = record("insertBlockMath");
    chain.updateBlockMath = record("updateBlockMath");
    chain.run = () => true;
    const editor = {
        getJSON: () => sampleDoc,
        isActive: () => opts.active ?? false,
        getAttributes: () => ({ latex: opts.latex ?? "" }),
        chain: () => chain,
        can: () => ({
            chain: () => ({
                focus: () => ({
                    undo: () => ({ run: () => false }),
                    redo: () => ({ run: () => false }),
                }),
            }),
        }),
    } as unknown as TiptapEditor;
    return { editor, calls };
}

describe("Toolbar math formula buttons (TipTap v3)", () => {
    it("clicking Formel prompts for LaTeX and inserts an inline math node", async () => {
        const { editor, calls } = makeMathEditor();
        render(<Toolbar editor={editor} {...requiredProps} />);
        fireEvent.click(screen.getByTestId("toolbar-formula"));
        await waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
        await waitFor(() =>
            expect(calls.find((c) => c.cmd === "insertInlineMath")).toBeTruthy(),
        );
        expect(calls.find((c) => c.cmd === "insertInlineMath")?.arg).toEqual({
            latex: "E=mc^2",
        });
    });

    it("clicking Block-Formel inserts a block math node", async () => {
        const { editor, calls } = makeMathEditor();
        render(<Toolbar editor={editor} {...requiredProps} />);
        fireEvent.click(screen.getByTestId("toolbar-formula-block"));
        await waitFor(() =>
            expect(calls.find((c) => c.cmd === "insertBlockMath")).toBeTruthy(),
        );
        expect(calls.find((c) => c.cmd === "insertBlockMath")?.arg).toEqual({
            latex: "E=mc^2",
        });
    });

    it("inserts nothing when the prompt is cancelled (null)", async () => {
        promptMock.mockResolvedValueOnce(null);
        const { editor, calls } = makeMathEditor();
        render(<Toolbar editor={editor} {...requiredProps} />);
        fireEvent.click(screen.getByTestId("toolbar-formula"));
        await waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
        expect(calls).toHaveLength(0);
    });

    it("inserts nothing when the prompt returns blank", async () => {
        promptMock.mockResolvedValueOnce("   ");
        const { editor, calls } = makeMathEditor();
        render(<Toolbar editor={editor} {...requiredProps} />);
        fireEvent.click(screen.getByTestId("toolbar-formula"));
        await waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
        expect(calls).toHaveLength(0);
    });

    it("updates the selected math node in place (prefilled with its latex)", async () => {
        promptMock.mockResolvedValueOnce("a^2+b^2");
        const { editor, calls } = makeMathEditor({ active: true, latex: "x" });
        render(<Toolbar editor={editor} {...requiredProps} />);
        fireEvent.click(screen.getByTestId("toolbar-formula"));
        await waitFor(() =>
            expect(calls.find((c) => c.cmd === "updateInlineMath")).toBeTruthy(),
        );
        // The current latex is passed as the prompt's default value.
        expect(promptMock.mock.calls[0][3]).toBe("x");
        expect(calls.find((c) => c.cmd === "updateInlineMath")?.arg).toEqual({
            latex: "a^2+b^2",
        });
        // It must NOT insert a second node.
        expect(calls.find((c) => c.cmd === "insertInlineMath")).toBeUndefined();
    });
});
