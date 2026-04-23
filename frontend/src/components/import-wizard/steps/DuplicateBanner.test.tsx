import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DuplicateBanner } from "./DuplicateBanner";
import type { DuplicateInfo } from "../../../api/import";

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) =>
            fallback.replace(/\{title\}/g, "EXISTING").replace(/\{date\}/g, "-"),
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const confirmMock = vi.fn();
vi.mock("../../AppDialog", () => ({
    useDialog: () => ({
        confirm: (...args: unknown[]) => confirmMock(...args),
    }),
}));

function render_(duplicate: DuplicateInfo, action: "create" | "overwrite" = "create") {
    const onActionChange = vi.fn();
    const utils = render(
        <DuplicateBanner
            duplicate={duplicate}
            currentAction={action}
            onActionChange={onActionChange}
        />,
    );
    return { ...utils, onActionChange };
}

describe("DuplicateBanner", () => {
    beforeEach(() => {
        confirmMock.mockReset();
    });

    it("renders nothing when duplicate.found is false", () => {
        const { container } = render_({ found: false });
        expect(container).toBeEmptyDOMElement();
    });

    it("renders the banner with the existing title when found", () => {
        render_({
            found: true,
            existing_book_id: "id1",
            existing_book_title: "Existing Book",
            imported_at: "2026-04-01T10:00:00Z",
        });
        expect(screen.getByTestId("duplicate-banner")).toBeInTheDocument();
    });

    it("Cancel button triggers action=cancel", () => {
        const { onActionChange } = render_({
            found: true,
            existing_book_id: "id1",
            existing_book_title: "X",
        });
        fireEvent.click(screen.getByTestId("duplicate-cancel"));
        expect(onActionChange).toHaveBeenCalledWith("cancel");
    });

    it("Create-as-new-copy button triggers action=create", () => {
        const { onActionChange } = render_({
            found: true,
            existing_book_id: "id1",
            existing_book_title: "X",
        });
        fireEvent.click(screen.getByTestId("duplicate-copy"));
        expect(onActionChange).toHaveBeenCalledWith("create");
    });

    it("Overwrite button requires confirm dialog before emitting overwrite", async () => {
        confirmMock.mockResolvedValue(true);
        const { onActionChange } = render_({
            found: true,
            existing_book_id: "id1",
            existing_book_title: "X",
        });
        fireEvent.click(screen.getByTestId("duplicate-overwrite"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        await waitFor(() =>
            expect(onActionChange).toHaveBeenCalledWith("overwrite"),
        );
    });

    it("Overwrite confirm cancellation does NOT emit overwrite", async () => {
        confirmMock.mockResolvedValue(false);
        const { onActionChange } = render_({
            found: true,
            existing_book_id: "id1",
            existing_book_title: "X",
        });
        fireEvent.click(screen.getByTestId("duplicate-overwrite"));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(onActionChange).not.toHaveBeenCalled();
    });

    it("aria-pressed reflects the active action", () => {
        render_(
            {
                found: true,
                existing_book_id: "id1",
                existing_book_title: "X",
            },
            "overwrite",
        );
        expect(screen.getByTestId("duplicate-overwrite")).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByTestId("duplicate-copy")).toHaveAttribute(
            "aria-pressed",
            "false",
        );
    });
});
