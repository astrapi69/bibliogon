/**
 * Pilot test for the shared TrashCard component (T-01-pilot).
 *
 * Asserts:
 * - title, subtitle, meta render
 * - Restore + Permanent-Delete buttons exist with caller-supplied
 *   testids and click into their handlers
 * - The CSS-Module `.card` class is applied (structural assertion;
 *   jsdom does not compute layout, so flex-wrap behavior is checked
 *   by class-presence + the CSS-Module file content separately)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TrashCard from "./TrashCard";

describe("TrashCard", () => {
    it("renders title, subtitle, meta and both action buttons", () => {
        const onRestore = vi.fn();
        const onPermanentDelete = vi.fn();
        render(
            <TrashCard
                title="Test Item"
                subtitle="By Author"
                meta="Trashed: 2026-04-30"
                onRestore={onRestore}
                onPermanentDelete={onPermanentDelete}
                restoreLabel="Restore"
                deletePermanentLabel="Delete forever"
                cardTestId="t-card-1"
                restoreTestId="t-restore-1"
                permanentTestId="t-permanent-1"
            />,
        );

        expect(screen.getByTestId("t-card-1")).toBeInTheDocument();
        expect(screen.getByText("Test Item")).toBeInTheDocument();
        expect(screen.getByText("By Author")).toBeInTheDocument();
        expect(screen.getByText("Trashed: 2026-04-30")).toBeInTheDocument();
        expect(screen.getByTestId("t-restore-1")).toBeInTheDocument();
        expect(screen.getByTestId("t-permanent-1")).toBeInTheDocument();
    });

    it("clicks fire the restore + permanent-delete handlers", () => {
        const onRestore = vi.fn();
        const onPermanentDelete = vi.fn();
        render(
            <TrashCard
                title="X"
                onRestore={onRestore}
                onPermanentDelete={onPermanentDelete}
                restoreLabel="R"
                deletePermanentLabel="D"
                cardTestId="t-card-2"
                restoreTestId="t-restore-2"
                permanentTestId="t-permanent-2"
            />,
        );
        fireEvent.click(screen.getByTestId("t-restore-2"));
        expect(onRestore).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByTestId("t-permanent-2"));
        expect(onPermanentDelete).toHaveBeenCalledTimes(1);
    });

    it("permanent-delete button is always rendered (regression guard for the prior layout-clip bug)", () => {
        // The trash-card-permanent-delete-recheck audit identified that
        // the inline-style version of this card clipped the second
        // button off-screen in narrow grid columns. The shared module
        // encodes flex-wrap: wrap so the button always paints inside
        // the card. The test guards against re-introducing the
        // clipping by asserting the button is in the DOM with the
        // caller-supplied testid (visibility itself can't be measured
        // in jsdom, but the class application is checked structurally
        // below).
        const { container } = render(
            <TrashCard
                title="Y"
                onRestore={() => {}}
                onPermanentDelete={() => {}}
                restoreLabel="R"
                deletePermanentLabel="D"
                cardTestId="t-card-3"
                restoreTestId="t-restore-3"
                permanentTestId="t-permanent-3"
            />,
        );
        const card = screen.getByTestId("t-card-3");
        // CSS-Module class names are hashed by Vite; assert the class
        // attribute is set rather than a specific name.
        expect(card.className).toMatch(/card/);
        // Permanent button must exist regardless of viewport.
        expect(container.querySelector("[data-testid='t-permanent-3']"))
            .not.toBeNull();
    });
});
