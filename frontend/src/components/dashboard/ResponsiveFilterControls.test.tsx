/**
 * Vitest coverage for ResponsiveFilterControls (issue #273, 3b).
 *
 * Pins the shared AD/BD filter-controls cluster:
 * - the inline desktop bar is rendered (inside the hide-mobile wrapper);
 * - the mobile "Filter" trigger button is rendered (show-mobile-only);
 * - clicking the trigger injects open=true into the cloned sheet, so
 *   each surface's sheet opens without wiring its own open-state.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({ t: (_k: string, fallback: string) => fallback, lang: "de" }),
}));

import ResponsiveFilterControls from "./ResponsiveFilterControls";

function FakeSheet({ open }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
    return <div data-testid="fake-sheet">{open ? "open" : "closed"}</div>;
}

describe("ResponsiveFilterControls", () => {
    it("renders the desktop bar and the mobile trigger", () => {
        render(
            <ResponsiveFilterControls
                triggerLabel="Filter"
                bar={<div data-testid="bar">bar</div>}
                sheet={<FakeSheet />}
            />,
        );
        expect(screen.getByTestId("bar")).toBeTruthy();
        expect(screen.getByTestId("filter-sheet-trigger")).toBeTruthy();
    });

    it("clicking the trigger injects open=true into the cloned sheet", () => {
        render(
            <ResponsiveFilterControls
                triggerLabel="Filter"
                bar={<div data-testid="bar">bar</div>}
                sheet={<FakeSheet />}
            />,
        );
        expect(screen.getByTestId("fake-sheet").textContent).toBe("closed");
        fireEvent.click(screen.getByTestId("filter-sheet-trigger"));
        expect(screen.getByTestId("fake-sheet").textContent).toBe("open");
    });
});
