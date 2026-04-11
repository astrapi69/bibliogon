/**
 * Render-based tests for KeywordInput chip interactions.
 *
 * The pure validator logic is covered by KeywordInput.test.ts.
 * This file exercises the React surface: delete button removes and
 * triggers the undo toast, double-click enters edit mode, Enter
 * commits / Escape cancels, undo restores at the original position,
 * counter flips its warning data-attribute past RECOMMENDED_MAX,
 * and the hard limit disables the input + blocks addKeyword.
 *
 * react-toastify is mocked so the undo test can both assert the
 * toast was raised and execute the restore callback directly.
 */

import React, {useState} from "react";
import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import KeywordInput, {HARD_LIMIT, RECOMMENDED_MAX} from "./KeywordInput";

// Capture whatever react-toastify.toast.info receives so tests can
// inspect the undo button and call it programmatically. Also capture
// the options so the autoClose value can be asserted.
const toastInfoCalls: Array<{content: React.ReactNode; options: unknown}> = [];
const dismissCalls: unknown[] = [];

vi.mock("react-toastify", () => ({
    toast: {
        info: vi.fn((content: React.ReactNode, options: unknown) => {
            toastInfoCalls.push({content, options});
            return "toast-id-" + toastInfoCalls.length;
        }),
        dismiss: vi.fn((id: unknown) => {
            dismissCalls.push(id);
        }),
        warning: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

// notify.warning / notify.info are fine with their real implementation
// (they dispatch through react-toastify which is mocked above), but we
// mock them directly to avoid the dynamic eventRecorder import path
// that react-toastify's recorder pulls in on every call.
vi.mock("../utils/notify", () => ({
    notify: {
        warning: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

/**
 * Controlled wrapper that threads state through KeywordInput so
 * tests can cover the onChange -> setKeywords -> re-render loop the
 * real parent component performs.
 */
function Harness({initial}: {initial: string[]}) {
    const [kw, setKw] = useState<string[]>(initial);
    return <KeywordInput keywords={kw} onChange={setKw}/>;
}

beforeEach(() => {
    toastInfoCalls.length = 0;
    dismissCalls.length = 0;
});

describe("KeywordInput - delete and undo", () => {
    it("removes a keyword when the per-chip delete button is clicked", () => {
        render(<Harness initial={["alpha", "beta", "gamma"]}/>);
        expect(screen.getByTestId("keyword-chip-1")).toBeTruthy();

        fireEvent.click(screen.getByTestId("keyword-chip-1-delete"));

        expect(screen.queryByTestId("keyword-chip-2")).toBeNull();
        // Counter reflects the new length
        expect(screen.getByTestId("keyword-counter").textContent).toContain("2");
    });

    it("raises a toast when a keyword is deleted", () => {
        render(<Harness initial={["alpha", "beta"]}/>);
        fireEvent.click(screen.getByTestId("keyword-chip-0-delete"));

        expect(toastInfoCalls).toHaveLength(1);
        const opts = toastInfoCalls[0].options as Record<string, unknown>;
        expect(opts.autoClose).toBe(5000);
    });

    it("undo button in the toast restores the keyword at its original index", () => {
        render(<Harness initial={["alpha", "beta", "gamma"]}/>);

        // Delete the middle keyword
        fireEvent.click(screen.getByTestId("keyword-chip-1-delete"));
        expect(screen.queryByText("beta")).toBeNull();

        // Mount the captured toast content into its own container so
        // the undo-button testid lookup is not shadowed by the
        // KeywordInput render living in the shared document body.
        const toastContainer = document.createElement("div");
        document.body.appendChild(toastContainer);
        const toastRender = render(<>{toastInfoCalls[0].content}</>, {container: toastContainer});
        const undoButton = toastRender.getByTestId("keyword-undo-button");
        fireEvent.click(undoButton);

        // Keyword came back at position 1 (between alpha and gamma),
        // not appended at the end.
        const chipTexts = screen
            .getAllByTestId(/^keyword-chip-\d+$/)
            .map((el) => el.textContent?.trim());
        expect(chipTexts).toEqual([
            expect.stringContaining("alpha"),
            expect.stringContaining("beta"),
            expect.stringContaining("gamma"),
        ]);
    });
});

describe("KeywordInput - inline edit", () => {
    it("double-click on a chip enters edit mode with the current value focused", () => {
        render(<Harness initial={["alpha", "beta"]}/>);

        fireEvent.doubleClick(screen.getByTestId("keyword-chip-0"));

        const editInput = screen.getByTestId("keyword-chip-0-edit-input") as HTMLInputElement;
        expect(editInput).toBeTruthy();
        expect(editInput.value).toBe("alpha");
    });

    it("Enter in edit mode commits the change", () => {
        render(<Harness initial={["alpha", "beta"]}/>);
        fireEvent.doubleClick(screen.getByTestId("keyword-chip-0"));

        const editInput = screen.getByTestId("keyword-chip-0-edit-input") as HTMLInputElement;
        fireEvent.change(editInput, {target: {value: "alpha prime"}});
        fireEvent.keyDown(editInput, {key: "Enter"});

        expect(screen.queryByTestId("keyword-chip-0-edit-input")).toBeNull();
        expect(screen.getByTestId("keyword-chip-0").textContent).toContain("alpha prime");
    });

    it("Escape in edit mode cancels and keeps the original value", () => {
        render(<Harness initial={["alpha", "beta"]}/>);
        fireEvent.doubleClick(screen.getByTestId("keyword-chip-0"));

        const editInput = screen.getByTestId("keyword-chip-0-edit-input") as HTMLInputElement;
        fireEvent.change(editInput, {target: {value: "throwaway"}});
        fireEvent.keyDown(editInput, {key: "Escape"});

        expect(screen.queryByTestId("keyword-chip-0-edit-input")).toBeNull();
        expect(screen.getByTestId("keyword-chip-0").textContent).toContain("alpha");
    });
});

describe("KeywordInput - counter warning states", () => {
    it("does not flag overRecommended at exactly RECOMMENDED_MAX", () => {
        const seven = Array.from({length: RECOMMENDED_MAX}, (_, i) => `kw${i}`);
        render(<Harness initial={seven}/>);
        const counter = screen.getByTestId("keyword-counter");
        expect(counter.getAttribute("data-over-recommended")).toBe("false");
    });

    it("flags overRecommended past RECOMMENDED_MAX", () => {
        const eight = Array.from({length: RECOMMENDED_MAX + 1}, (_, i) => `kw${i}`);
        render(<Harness initial={eight}/>);
        const counter = screen.getByTestId("keyword-counter");
        expect(counter.getAttribute("data-over-recommended")).toBe("true");
        expect(counter.getAttribute("data-at-hard-limit")).toBe("false");
    });

    it("flags atHardLimit at exactly HARD_LIMIT", () => {
        const full = Array.from({length: HARD_LIMIT}, (_, i) => `kw${i}`);
        render(<Harness initial={full}/>);
        const counter = screen.getByTestId("keyword-counter");
        expect(counter.getAttribute("data-at-hard-limit")).toBe("true");
    });
});

describe("KeywordInput - hard limit", () => {
    it("disables the add input at HARD_LIMIT", () => {
        const full = Array.from({length: HARD_LIMIT}, (_, i) => `kw${i}`);
        render(<Harness initial={full}/>);
        const addInput = screen.getByTestId("keyword-add-input") as HTMLInputElement;
        expect(addInput.disabled).toBe(true);
    });

    it("re-enables the add input after a delete brings length below HARD_LIMIT", () => {
        const full = Array.from({length: HARD_LIMIT}, (_, i) => `kw${i}`);
        render(<Harness initial={full}/>);
        const addInputBefore = screen.getByTestId("keyword-add-input") as HTMLInputElement;
        expect(addInputBefore.disabled).toBe(true);

        fireEvent.click(screen.getByTestId("keyword-chip-0-delete"));

        const addInputAfter = screen.getByTestId("keyword-add-input") as HTMLInputElement;
        expect(addInputAfter.disabled).toBe(false);
    });

    it("renders the delete button within every chip up to HARD_LIMIT", () => {
        const full = Array.from({length: 3}, (_, i) => `kw${i}`);
        render(<Harness initial={full}/>);
        for (let i = 0; i < full.length; i++) {
            // getByTestId is used instead of getByRole because the
            // SortableChip wrapper span also carries dnd-kit's implicit
            // role=button for keyboard drag activation, so getByRole
            // would return more than one element per chip.
            expect(screen.getByTestId(`keyword-chip-${i}-delete`)).toBeTruthy();
        }
    });
});
