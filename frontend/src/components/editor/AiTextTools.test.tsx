import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import AiTextTools from "./AiTextTools";
import { FeatureTestProvider } from "../../features/FeatureTestProvider";
import { aiCorrectGrammar, aiTranslate } from "../../ai/aiTextTools";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (key: string, fallback?: string) => fallback ?? key,
        lang: "de",
        setLang: () => {},
    }),
}));

// Storage mode is the render gate (Dexie-only); flip per test.
const storageMode = { mode: "dexie" as "dexie" | "api" };
vi.mock("../../storage/useStorageMode", () => ({ useStorageMode: () => storageMode }));

vi.mock("../../ai/aiTextTools", () => ({
    aiCorrectGrammar: vi.fn(async () => ({ text: "Corrected text.", tokens: 1 })),
    aiTranslate: vi.fn(async () => ({ text: "Translated text.", tokens: 1 })),
}));

vi.mock("../../ai/llmClient", () => ({ classifyAiClientError: () => "unknown" }));

const { notifyMock, copyMock } = vi.hoisted(() => ({
    notifyMock: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
    copyMock: vi.fn(async () => true),
}));
vi.mock("../../utils/platform/notify", () => ({ notify: notifyMock }));
vi.mock("../../utils/platform/clipboard", () => ({ copyToClipboard: copyMock }));

// Native-select stand-in for the Radix language picker (avoids Radix portal
// timing in happy-dom; the language flow is the same).
vi.mock("../shared/RadixSelect", () => ({
    RadixSelect: ({
        testId,
        value,
        onValueChange,
        options,
    }: {
        testId: string;
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
    }) => (
        <select
            data-testid={testId}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));

const mockGrammar = vi.mocked(aiCorrectGrammar);
const mockTranslate = vi.mocked(aiTranslate);

/** Minimal TipTap editor double covering the selection + apply commands the
 *  component touches. */
function makeEditor(selectionText: string, fullText: string) {
    const hasSelection = selectionText.length > 0;
    const run = vi.fn();
    const insertContentAt = vi.fn(() => ({ run }));
    const setContent = vi.fn(() => ({ run }));
    const focus = vi.fn(() => ({ insertContentAt, setContent }));
    const chain = vi.fn(() => ({ focus }));
    const editor = {
        state: {
            selection: { from: hasSelection ? 2 : 5, to: hasSelection ? 7 : 5 },
            doc: { textBetween: () => selectionText },
        },
        getText: () => fullText,
        chain,
    };
    return { editor, insertContentAt, setContent };
}

function renderTools(opts: {
    editor: unknown;
    hasAiKey?: boolean;
    mode?: "dexie" | "api";
}) {
    storageMode.mode = opts.mode ?? "dexie";
    return render(
        <FeatureTestProvider mode="dexie" hasAiKey={opts.hasAiKey ?? true}>
            {opts.editor ? (
                <AiTextTools editor={opts.editor as never} />
            ) : (
                (null as unknown as ReactNode)
            )}
        </FeatureTestProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    storageMode.mode = "dexie";
});

describe("AiTextTools render gate", () => {
    it("renders nothing outside Dexie (offline) mode", () => {
        const { editor } = makeEditor("hello", "hello world");
        renderTools({ editor, mode: "api" });
        expect(screen.queryByTestId("editor-ai-tools")).toBeNull();
    });

    it("hides in markdown mode", () => {
        const { editor } = makeEditor("hello", "hello world");
        render(
            <FeatureTestProvider mode="dexie" hasAiKey>
                <AiTextTools editor={editor as never} markdownMode />
            </FeatureTestProvider>,
        );
        expect(screen.queryByTestId("editor-ai-tools")).toBeNull();
    });
});

describe("AiTextTools grammar", () => {
    it("disables the grammar button with a reason when no AI key is configured", () => {
        const { editor } = makeEditor("hello", "hello world");
        renderTools({ editor, hasAiKey: false });
        const btn = screen.getByTestId("editor-ai-grammar") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute("title")).toContain("API-Schlüssel");
    });

    it("enables the grammar button when an AI key is configured", () => {
        const { editor } = makeEditor("hello", "hello world");
        renderTools({ editor, hasAiKey: true });
        const btn = screen.getByTestId("editor-ai-grammar") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
    });

    it("corrects the selection and shows the result", async () => {
        const { editor } = makeEditor("i has went", "i has went to the store");
        renderTools({ editor });
        fireEvent.click(screen.getByTestId("editor-ai-grammar"));
        await waitFor(() => expect(screen.getByTestId("editor-ai-result")).toBeTruthy());
        expect(mockGrammar).toHaveBeenCalledWith("i has went");
        expect(screen.getByTestId("editor-ai-result").textContent).toContain("Corrected text.");
    });

    it("applies the corrected text back into the selection", async () => {
        const { editor, insertContentAt } = makeEditor("i has went", "i has went more");
        renderTools({ editor });
        fireEvent.click(screen.getByTestId("editor-ai-grammar"));
        await waitFor(() => expect(screen.getByTestId("editor-ai-apply")).toBeTruthy());
        fireEvent.click(screen.getByTestId("editor-ai-apply"));
        expect(insertContentAt).toHaveBeenCalledWith(
            { from: 2, to: 7 },
            "<p>Corrected text.</p>",
        );
        expect(notifyMock.success).toHaveBeenCalled();
    });

    it("does nothing and informs the user when there is no text", () => {
        const { editor } = makeEditor("", "");
        renderTools({ editor });
        fireEvent.click(screen.getByTestId("editor-ai-grammar"));
        expect(mockGrammar).not.toHaveBeenCalled();
        expect(notifyMock.info).toHaveBeenCalled();
    });
});

describe("AiTextTools translate", () => {
    it("disables the translate button with a reason when no AI key is configured", () => {
        const { editor } = makeEditor("hallo", "hallo welt");
        renderTools({ editor, hasAiKey: false });
        const btn = screen.getByTestId("editor-ai-translate") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute("title")).toContain("API-Schlüssel");
    });

    it("opens a language picker before translating", () => {
        const { editor } = makeEditor("hallo", "hallo welt");
        renderTools({ editor });
        fireEvent.click(screen.getByTestId("editor-ai-translate"));
        expect(screen.getByTestId("editor-ai-lang")).toBeTruthy();
        expect(screen.getByTestId("editor-ai-run")).toBeTruthy();
        // Translation has not run yet.
        expect(mockTranslate).not.toHaveBeenCalled();
    });

    it("translates the selection into the chosen language and shows the result", async () => {
        const { editor } = makeEditor("Guten Morgen", "Guten Morgen Welt");
        renderTools({ editor });
        fireEvent.click(screen.getByTestId("editor-ai-translate"));
        fireEvent.click(screen.getByTestId("editor-ai-run"));
        await waitFor(() => expect(screen.getByTestId("editor-ai-result")).toBeTruthy());
        // Default target language is English.
        expect(mockTranslate).toHaveBeenCalledWith("Guten Morgen", "English");
        expect(screen.getByTestId("editor-ai-result").textContent).toContain("Translated text.");
    });

    it("shows a select-text hint (and offers copy) when nothing is selected", async () => {
        const { editor } = makeEditor("", "Guten Morgen Welt");
        renderTools({ editor });
        fireEvent.click(screen.getByTestId("editor-ai-translate"));
        // With no selection the full text is used, so translation still runs.
        fireEvent.click(screen.getByTestId("editor-ai-run"));
        await waitFor(() => expect(screen.getByTestId("editor-ai-result")).toBeTruthy());
        expect(screen.queryByTestId("editor-ai-apply")).toBeNull();
        expect(screen.getByTestId("editor-ai-no-selection")).toBeTruthy();
        fireEvent.click(screen.getByTestId("editor-ai-copy"));
        await waitFor(() => expect(copyMock).toHaveBeenCalledWith("Translated text."));
    });
});
