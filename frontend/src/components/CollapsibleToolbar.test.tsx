import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CollapsibleToolbar } from "./CollapsibleToolbar";

const isMobileMock = vi.fn<() => boolean>(() => false);
vi.mock("../hooks/useIsMobile", () => ({
    useIsMobile: () => isMobileMock(),
}));

function renderToolbar() {
    return render(
        <CollapsibleToolbar expandLabel="Expand toolbar" collapseLabel="Collapse toolbar">
            <div data-testid="toolbar-content">buttons</div>
        </CollapsibleToolbar>,
    );
}

beforeEach(() => {
    isMobileMock.mockReset();
    isMobileMock.mockReturnValue(false);
});

describe("CollapsibleToolbar", () => {
    it("mobile: starts collapsed and renders a toggle", () => {
        isMobileMock.mockReturnValue(true);
        renderToolbar();

        const shell = screen.getByTestId("collapsible-toolbar");
        expect(shell.getAttribute("data-expanded")).toBe("false");
        expect(screen.getByTestId("toolbar-collapse-toggle")).toBeTruthy();
        // Content is always rendered (collapsed only clips it via CSS).
        expect(screen.getByTestId("toolbar-content")).toBeTruthy();
    });

    it("mobile: the toggle expands the toolbar", () => {
        isMobileMock.mockReturnValue(true);
        renderToolbar();

        fireEvent.click(screen.getByTestId("toolbar-collapse-toggle"));

        expect(screen.getByTestId("collapsible-toolbar").getAttribute("data-expanded")).toBe(
            "true",
        );
    });

    it("mobile: toggling twice collapses again", () => {
        isMobileMock.mockReturnValue(true);
        renderToolbar();
        const toggle = screen.getByTestId("toolbar-collapse-toggle");

        fireEvent.click(toggle);
        fireEvent.click(toggle);

        expect(screen.getByTestId("collapsible-toolbar").getAttribute("data-expanded")).toBe(
            "false",
        );
    });

    it("mobile: the toggle's accessible label reflects the state", () => {
        isMobileMock.mockReturnValue(true);
        renderToolbar();
        const toggle = screen.getByTestId("toolbar-collapse-toggle");

        // Collapsed -> action is "expand".
        expect(toggle.getAttribute("aria-label")).toBe("Expand toolbar");
        expect(toggle.getAttribute("aria-expanded")).toBe("false");

        fireEvent.click(toggle);

        // Expanded -> action is "collapse".
        expect(toggle.getAttribute("aria-label")).toBe("Collapse toolbar");
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
    });

    it("desktop: always expanded, no toggle rendered", () => {
        isMobileMock.mockReturnValue(false);
        renderToolbar();

        expect(screen.getByTestId("collapsible-toolbar").getAttribute("data-expanded")).toBe(
            "true",
        );
        expect(screen.queryByTestId("toolbar-collapse-toggle")).toBeNull();
        expect(screen.getByTestId("toolbar-content")).toBeTruthy();
    });
});
