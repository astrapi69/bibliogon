/**
 * CommentBulkActionBar tests pin the count rendering + delete-menu
 * threshold (count < 2 disables) + clear button.
 *
 * Per the "Radix DropdownMenu + happy-dom is brittle" rule we do
 * NOT assert on the menu CONTENT inside the portal — that's the
 * E2E spec's job. We pin the TRIGGER state + the prop-threading
 * contract here.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import CommentBulkActionBar from "./CommentBulkActionBar";

const t = (_k: string, fallback?: string) => fallback || _k;

describe("CommentBulkActionBar", () => {
    it("renders the selected count", () => {
        render(
            <CommentBulkActionBar
                count={5}
                onBulkDelete={() => {}}
                onBulkDeletePermanent={() => {}}
                onClear={() => {}}
                t={t}
            />,
        );
        expect(screen.getByTestId("comment-bulk-count").textContent).toContain("5");
    });

    it("disables delete trigger at count 1", () => {
        render(
            <CommentBulkActionBar
                count={1}
                onBulkDelete={() => {}}
                onBulkDeletePermanent={() => {}}
                onClear={() => {}}
                t={t}
            />,
        );
        const trigger = screen.getByTestId(
            "comment-bulk-delete-menu",
        ) as HTMLButtonElement;
        expect(trigger.disabled).toBe(true);
    });

    it("enables delete trigger at count >= 2", () => {
        render(
            <CommentBulkActionBar
                count={2}
                onBulkDelete={() => {}}
                onBulkDeletePermanent={() => {}}
                onClear={() => {}}
                t={t}
            />,
        );
        const trigger = screen.getByTestId(
            "comment-bulk-delete-menu",
        ) as HTMLButtonElement;
        expect(trigger.disabled).toBe(false);
    });

    it("Clear button fires onClear", () => {
        const spy = vi.fn();
        render(
            <CommentBulkActionBar
                count={3}
                onBulkDelete={() => {}}
                onBulkDeletePermanent={() => {}}
                onClear={spy}
                t={t}
            />,
        );
        fireEvent.click(screen.getByTestId("comment-bulk-clear"));
        expect(spy).toHaveBeenCalled();
    });

    it("region has the accessible label", () => {
        render(
            <CommentBulkActionBar
                count={2}
                onBulkDelete={() => {}}
                onBulkDeletePermanent={() => {}}
                onClear={() => {}}
                t={t}
            />,
        );
        const region = screen.getByTestId("comment-bulk-action-bar");
        expect(region.getAttribute("aria-label")).toBeTruthy();
    });
});
