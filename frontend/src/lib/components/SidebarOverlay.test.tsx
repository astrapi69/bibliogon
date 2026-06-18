import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SidebarOverlay } from "./SidebarOverlay";

describe("SidebarOverlay", () => {
    it("renders nothing when closed", () => {
        render(
            <SidebarOverlay open={false} onClose={vi.fn()} testId="overlay" />,
        );
        expect(screen.queryByTestId("overlay")).toBeNull();
    });

    it("renders the backdrop when open", () => {
        render(<SidebarOverlay open onClose={vi.fn()} testId="overlay" />);
        expect(screen.getByTestId("overlay")).toBeTruthy();
    });

    it("calls onClose when the backdrop is clicked", () => {
        const onClose = vi.fn();
        render(<SidebarOverlay open onClose={onClose} testId="overlay" />);
        fireEvent.click(screen.getByTestId("overlay"));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("is hidden at/above the menu breakpoint (menu:hidden) and below the sidebar z-index", () => {
        // The scrim must only show where the sidebar is a fixed overlay
        // (below 1200px) and sit beneath the sidebar (z-90) + toggle (z-100).
        render(<SidebarOverlay open onClose={vi.fn()} testId="overlay" />);
        const el = screen.getByTestId("overlay");
        expect(el.className).toContain("menu:hidden");
        expect(el.className).toContain("z-[80]");
        expect(el.className).toContain("fixed");
        expect(el.className).toContain("inset-0");
    });
});
