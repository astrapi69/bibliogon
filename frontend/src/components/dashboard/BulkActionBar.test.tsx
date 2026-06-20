/**
 * BulkActionBar tests pin the shell contract:
 * - countLabel renders via countTestId
 * - region carries the supplied ariaLabel via barTestId
 * - children slot renders between count and Clear button
 * - Clear button fires onClear via clearTestId
 * - Custom testid namespacing works (Tier1Section-style RCU contract)
 *
 * Per the "Radix DropdownMenu + happy-dom is brittle" LL: we do NOT
 * test dropdown CONTENT here — sites with dropdowns own their own
 * trigger-state tests in their existing per-adapter test files
 * (ArticleBulkActionBar.test, BookBulkActionBar.test,
 * CommentBulkActionBar.test).
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import BulkActionBar from "../BulkActionBar";

describe("BulkActionBar", () => {
    it("renders countLabel under countTestId", () => {
        render(
            <BulkActionBar
                count={5}
                countLabel="5 selected"
                ariaLabel="Bulk"
                clearLabel="Clear"
                onClear={() => {}}
                barTestId="test-bar"
                countTestId="test-count"
                clearTestId="test-clear"
            >
                <div data-testid="test-actions">actions</div>
            </BulkActionBar>,
        );
        expect(screen.getByTestId("test-count").textContent).toBe("5 selected");
    });

    it("region carries the supplied ariaLabel", () => {
        render(
            <BulkActionBar
                count={3}
                countLabel="3 selected"
                ariaLabel="My Bulk Region"
                clearLabel="Clear"
                onClear={() => {}}
                barTestId="test-bar"
                countTestId="test-count"
                clearTestId="test-clear"
            >
                <div>actions</div>
            </BulkActionBar>,
        );
        const region = screen.getByTestId("test-bar");
        expect(region.getAttribute("aria-label")).toBe("My Bulk Region");
        expect(region.getAttribute("role")).toBe("region");
    });

    it("renders children between count badge and Clear button", () => {
        render(
            <BulkActionBar
                count={2}
                countLabel="2 selected"
                ariaLabel="Bulk"
                clearLabel="Clear"
                onClear={() => {}}
                barTestId="test-bar"
                countTestId="test-count"
                clearTestId="test-clear"
            >
                <div data-testid="test-action-cluster">Action!</div>
            </BulkActionBar>,
        );
        expect(
            screen.getByTestId("test-action-cluster").textContent,
        ).toBe("Action!");
    });

    it("Clear button under clearTestId fires onClear with the supplied label", () => {
        const spy = vi.fn();
        render(
            <BulkActionBar
                count={3}
                countLabel="3 selected"
                ariaLabel="Bulk"
                clearLabel="Auswahl aufheben"
                onClear={spy}
                barTestId="test-bar"
                countTestId="test-count"
                clearTestId="test-clear"
            >
                <div>actions</div>
            </BulkActionBar>,
        );
        const clearButton = screen.getByTestId("test-clear");
        expect(clearButton.textContent).toBe("Auswahl aufheben");
        fireEvent.click(clearButton);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it("supports custom testid namespacing per RCU n-site contract", () => {
        // Mirror the namespace pattern used by ArticleBulkActionBar:
        // barTestId="article-bulk-action-bar", countTestId="article-bulk-count",
        // clearTestId="article-bulk-clear".
        render(
            <BulkActionBar
                count={1}
                countLabel="1 selected"
                ariaLabel="Bulk"
                clearLabel="Clear"
                onClear={() => {}}
                barTestId="article-bulk-action-bar"
                countTestId="article-bulk-count"
                clearTestId="article-bulk-clear"
            >
                <div>actions</div>
            </BulkActionBar>,
        );
        expect(
            screen.getByTestId("article-bulk-action-bar"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("article-bulk-count"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("article-bulk-clear"),
        ).toBeInTheDocument();
    });
});
