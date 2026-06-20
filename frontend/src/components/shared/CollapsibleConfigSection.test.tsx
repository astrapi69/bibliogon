/**
 * Vitest coverage for CollapsibleConfigSection (#109).
 *
 * Pins the shared parent-section collapsible wrapper used by the
 * picture-book / comic editor right sidebars: trigger renders the
 * heading, content shows when open, toggling hides/shows the
 * children, and the open-state persists to localStorage via
 * useCollapsibleState.
 */
import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it} from "vitest";

import {CollapsibleConfigSection} from "../CollapsibleConfigSection";

const STORAGE_KEY = "bibliogon-collapsible-test-section";

function renderSection(defaultOpen = true) {
    return render(
        <CollapsibleConfigSection
            storageKey={STORAGE_KEY}
            heading="Layout"
            testidPrefix="test-config"
            defaultOpen={defaultOpen}
        >
            <div data-testid="test-config-body">body</div>
        </CollapsibleConfigSection>,
    );
}

beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
});

describe("CollapsibleConfigSection", () => {
    it("renders the heading as an expanded trigger with visible content by default", () => {
        renderSection();
        const trigger = screen.getByTestId("test-config-section-trigger");
        expect(trigger.textContent).toContain("Layout");
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(screen.getByTestId("test-config-body")).toBeTruthy();
    });

    it("collapses on trigger click and expands again on the next click", () => {
        renderSection();
        const trigger = screen.getByTestId("test-config-section-trigger");

        fireEvent.click(trigger);
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByTestId("test-config-body")).toBeNull();

        fireEvent.click(trigger);
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(screen.getByTestId("test-config-body")).toBeTruthy();
    });

    it("persists the collapsed choice to localStorage and restores it on remount", () => {
        const first = renderSection();
        fireEvent.click(screen.getByTestId("test-config-section-trigger"));
        expect(localStorage.getItem(STORAGE_KEY)).toBe("0");
        first.unmount();

        renderSection();
        const trigger = screen.getByTestId("test-config-section-trigger");
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByTestId("test-config-body")).toBeNull();
    });

    it("respects defaultOpen=false when nothing is persisted", () => {
        renderSection(false);
        const trigger = screen.getByTestId("test-config-section-trigger");
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByTestId("test-config-body")).toBeNull();
    });

    it("applies the shared open/close animation classes to the content", () => {
        renderSection();
        const content = screen.getByTestId("test-config-section-content");
        expect(content.className).toContain("animate-collapsible-down");
        expect(content.className).toContain("animate-collapsible-up");
        expect(content.className).toContain("overflow-hidden");
    });
});
