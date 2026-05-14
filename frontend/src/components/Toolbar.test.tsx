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
