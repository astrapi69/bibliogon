import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
    NavigationSidebar,
    type NavigationSidebarGroup,
} from "./NavigationSidebar";

const GROUPS: NavigationSidebarGroup[] = [
    {
        label: "Content",
        items: [
            { id: "general", label: "General", testId: "nav-general" },
            { id: "story", label: "Story", testId: "nav-story" },
        ],
    },
    {
        label: "Advanced",
        items: [{ id: "ai", label: "AI Template", testId: "nav-ai" }],
    },
];

describe("NavigationSidebar", () => {
    it("renders every group item with its testid on the desktop sidebar", () => {
        render(
            <NavigationSidebar
                groups={GROUPS}
                activeId="general"
                onSelect={vi.fn()}
                ariaLabel="Test nav"
            />,
        );
        expect(screen.getByTestId("nav-general")).toBeTruthy();
        expect(screen.getByTestId("nav-story")).toBeTruthy();
        expect(screen.getByTestId("nav-ai")).toBeTruthy();
    });

    it("renders the group header labels", () => {
        render(
            <NavigationSidebar groups={GROUPS} activeId="general" onSelect={vi.fn()} />,
        );
        expect(screen.getByText("Content")).toBeTruthy();
        expect(screen.getByText("Advanced")).toBeTruthy();
    });

    it("calls onSelect with the item id on a desktop item click", () => {
        const onSelect = vi.fn();
        render(
            <NavigationSidebar groups={GROUPS} activeId="general" onSelect={onSelect} />,
        );
        fireEvent.click(screen.getByTestId("nav-story"));
        expect(onSelect).toHaveBeenCalledWith("story");
    });

    it("marks the active item with aria-current=page", () => {
        render(
            <NavigationSidebar groups={GROUPS} activeId="story" onSelect={vi.fn()} />,
        );
        expect(screen.getByTestId("nav-story").getAttribute("aria-current")).toBe("page");
        expect(screen.getByTestId("nav-general").getAttribute("aria-current")).toBeNull();
    });

    it("renders the hamburger trigger reflecting the active label", () => {
        // Per the documented Radix-dropdown + happy-dom limitation, we
        // assert the TRIGGER exists (with the active label) but do NOT
        // assert the popover's open contents — that timing is flaky in
        // happy-dom and belongs in an E2E spec.
        render(
            <NavigationSidebar groups={GROUPS} activeId="ai" onSelect={vi.fn()} />,
        );
        const trigger = screen.getByTestId("navigation-sidebar-mobile-trigger");
        expect(trigger).toBeTruthy();
        expect(trigger.textContent).toContain("AI Template");
    });

    it("does not call onSelect for a disabled item", () => {
        const onSelect = vi.fn();
        const groups: NavigationSidebarGroup[] = [
            {
                items: [{ id: "x", label: "X", testId: "nav-x", disabled: true }],
            },
        ];
        render(<NavigationSidebar groups={groups} activeId="x" onSelect={onSelect} />);
        const btn = screen.getByTestId("nav-x") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        fireEvent.click(btn);
        expect(onSelect).not.toHaveBeenCalled();
    });
});
