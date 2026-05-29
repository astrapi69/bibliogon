import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import EditableTitle from "./EditableTitle";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

const PREFIX = "test-title";

describe("EditableTitle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders the title text + pencil button in display mode", () => {
        render(
            <EditableTitle
                value="My Title"
                onSave={vi.fn()}
                testIdPrefix={PREFIX}
            />,
        );
        expect(screen.getByTestId(`${PREFIX}-text`)).toHaveTextContent(
            "My Title",
        );
        expect(screen.getByTestId(`${PREFIX}-edit`)).toBeInTheDocument();
        // No input until the pencil is clicked.
        expect(
            screen.queryByTestId(`${PREFIX}-input`),
        ).not.toBeInTheDocument();
    });

    it("clicking the pencil toggles into edit mode", () => {
        render(
            <EditableTitle
                value="My Title"
                onSave={vi.fn()}
                testIdPrefix={PREFIX}
            />,
        );
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        const input = screen.getByTestId(`${PREFIX}-input`) as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe("My Title");
    });

    it("Enter commits the trimmed new title via onSave", () => {
        const onSave = vi.fn();
        render(
            <EditableTitle
                value="My Title"
                onSave={onSave}
                testIdPrefix={PREFIX}
            />,
        );
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        const input = screen.getByTestId(`${PREFIX}-input`);
        fireEvent.change(input, {target: {value: "  Renamed  "}});
        fireEvent.keyDown(input, {key: "Enter"});
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith("Renamed");
        // Back to display mode.
        expect(
            screen.queryByTestId(`${PREFIX}-input`),
        ).not.toBeInTheDocument();
    });

    it("blur commits the new title via onSave", () => {
        const onSave = vi.fn();
        render(
            <EditableTitle
                value="My Title"
                onSave={onSave}
                testIdPrefix={PREFIX}
            />,
        );
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        const input = screen.getByTestId(`${PREFIX}-input`);
        fireEvent.change(input, {target: {value: "Blurred"}});
        fireEvent.blur(input);
        expect(onSave).toHaveBeenCalledWith("Blurred");
    });

    it("Escape cancels: onSave not called, reverts to original", () => {
        const onSave = vi.fn();
        render(
            <EditableTitle
                value="My Title"
                onSave={onSave}
                testIdPrefix={PREFIX}
            />,
        );
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        const input = screen.getByTestId(`${PREFIX}-input`);
        fireEvent.change(input, {target: {value: "Discarded"}});
        fireEvent.keyDown(input, {key: "Escape"});
        expect(onSave).not.toHaveBeenCalled();
        // Reverted display still shows the original.
        expect(screen.getByTestId(`${PREFIX}-text`)).toHaveTextContent(
            "My Title",
        );
        // Re-opening shows the original, not the discarded draft.
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        expect(
            (screen.getByTestId(`${PREFIX}-input`) as HTMLInputElement).value,
        ).toBe("My Title");
    });

    it("rejects an empty title (commit reverts without saving)", () => {
        const onSave = vi.fn();
        render(
            <EditableTitle
                value="My Title"
                onSave={onSave}
                testIdPrefix={PREFIX}
            />,
        );
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        const input = screen.getByTestId(`${PREFIX}-input`);
        fireEvent.change(input, {target: {value: "   "}});
        fireEvent.keyDown(input, {key: "Enter"});
        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByTestId(`${PREFIX}-text`)).toHaveTextContent(
            "My Title",
        );
    });

    it("rejects an unchanged title (no redundant save)", () => {
        const onSave = vi.fn();
        render(
            <EditableTitle
                value="My Title"
                onSave={onSave}
                testIdPrefix={PREFIX}
            />,
        );
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        const input = screen.getByTestId(`${PREFIX}-input`);
        fireEvent.keyDown(input, {key: "Enter"});
        expect(onSave).not.toHaveBeenCalled();
    });

    it("falls back to the placeholder when value is empty", () => {
        render(
            <EditableTitle
                value=""
                onSave={vi.fn()}
                testIdPrefix={PREFIX}
                placeholder="Untitled"
            />,
        );
        expect(screen.getByTestId(`${PREFIX}-text`)).toHaveTextContent(
            "Untitled",
        );
    });

    // --- C2: published-work warning gate ---

    it("published: pencil opens the warning instead of editing", () => {
        const onSave = vi.fn();
        render(
            <EditableTitle
                value="My Title"
                onSave={onSave}
                testIdPrefix={PREFIX}
                isPublished
            />,
        );
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        expect(screen.getByTestId(`${PREFIX}-warning`)).toBeInTheDocument();
        // Not in edit mode yet.
        expect(
            screen.queryByTestId(`${PREFIX}-input`),
        ).not.toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });

    it("unpublished: pencil edits directly, no warning", () => {
        render(
            <EditableTitle
                value="My Title"
                onSave={vi.fn()}
                testIdPrefix={PREFIX}
                isPublished={false}
            />,
        );
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        expect(
            screen.queryByTestId(`${PREFIX}-warning`),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId(`${PREFIX}-input`)).toBeInTheDocument();
    });

    it("published: acknowledging the warning enters edit mode", () => {
        render(
            <EditableTitle
                value="My Title"
                onSave={vi.fn()}
                testIdPrefix={PREFIX}
                isPublished
            />,
        );
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        fireEvent.click(screen.getByTestId(`${PREFIX}-warning-ack`));
        expect(
            screen.queryByTestId(`${PREFIX}-warning`),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId(`${PREFIX}-input`)).toBeInTheDocument();
    });

    it("published: cancelling the warning returns to display mode", () => {
        const onSave = vi.fn();
        render(
            <EditableTitle
                value="My Title"
                onSave={onSave}
                testIdPrefix={PREFIX}
                isPublished
            />,
        );
        fireEvent.click(screen.getByTestId(`${PREFIX}-edit`));
        fireEvent.click(screen.getByTestId(`${PREFIX}-warning-cancel`));
        expect(
            screen.queryByTestId(`${PREFIX}-warning`),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId(`${PREFIX}-input`),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId(`${PREFIX}-text`)).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });
});
