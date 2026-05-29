/**
 * Vitest cases for the SplitButton primitive.
 *
 * Filed by ARTICLE-TYPES-SSOT-01 C4 (2026-05-29).
 *
 * Per the "Radix DropdownMenu + happy-dom is brittle for Vitest"
 * lessons-learned rule, the test surface is:
 *
 * - Trigger half (primary button + chevron) rendering + click
 *   behavior — fully covered here.
 * - Disabled state — covered here.
 * - Dropdown content (menu items) behavior — covered by the C9
 *   Playwright smoke spec in a real browser, NOT here. happy-dom
 *   portal + focus-scope simulation is incomplete; asserting on
 *   testids inside ``DropdownMenu.Portal`` is flaky.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import {SplitButton, type SplitButtonDropdownItem} from "./SplitButton";

function makeItem(
    id: string,
    onSelect: () => void = vi.fn(),
): SplitButtonDropdownItem {
    return {
        id,
        content: <span>{id}</span>,
        onSelect,
    };
}

describe("SplitButton rendering", () => {
    it("renders primary content + chevron", () => {
        render(
            <SplitButton
                buttonClass="btn btn-primary"
                primaryContent={<span>Primary</span>}
                onPrimaryClick={vi.fn()}
                chevronTooltip="More"
                dropdownItems={[makeItem("a"), makeItem("b")]}
                groupTestId="group"
                primaryTestId="primary"
                chevronTestId="chevron"
            />,
        );
        expect(screen.getByTestId("group")).toBeTruthy();
        expect(screen.getByTestId("primary").textContent).toBe("Primary");
        expect(screen.getByTestId("chevron")).toBeTruthy();
    });

    it("chevron carries the tooltip + aria-label", () => {
        render(
            <SplitButton
                buttonClass="btn btn-primary"
                primaryContent={<span>P</span>}
                onPrimaryClick={vi.fn()}
                chevronTooltip="Weitere Optionen"
                dropdownItems={[makeItem("a")]}
                chevronTestId="chevron"
            />,
        );
        const chevron = screen.getByTestId("chevron");
        expect(chevron.getAttribute("title")).toBe("Weitere Optionen");
        expect(chevron.getAttribute("aria-label")).toBe("Weitere Optionen");
    });

    it("primary half receives the buttonClass verbatim", () => {
        render(
            <SplitButton
                buttonClass="btn btn-primary custom-class"
                primaryContent={<span>P</span>}
                onPrimaryClick={vi.fn()}
                chevronTooltip="More"
                dropdownItems={[makeItem("a")]}
                primaryTestId="primary"
            />,
        );
        const primary = screen.getByTestId("primary");
        expect(primary.className).toContain("btn btn-primary custom-class");
    });

    it("chevron inherits the buttonClass + appends shared chevron classes", () => {
        render(
            <SplitButton
                buttonClass="btn btn-primary"
                primaryContent={<span>P</span>}
                onPrimaryClick={vi.fn()}
                chevronTooltip="More"
                dropdownItems={[makeItem("a")]}
                chevronTestId="chevron"
            />,
        );
        const chevron = screen.getByTestId("chevron");
        expect(chevron.className).toContain("btn btn-primary");
        // Shared chevron classes from SplitButton.module.css.
        expect(chevron.className).toMatch(/chevron/);
        expect(chevron.className).toMatch(/variantPrimary/);
    });

    it("variant='secondary' applies the secondary chevron class", () => {
        render(
            <SplitButton
                buttonClass="btn btn-secondary"
                variant="secondary"
                primaryContent={<span>P</span>}
                onPrimaryClick={vi.fn()}
                chevronTooltip="More"
                dropdownItems={[makeItem("a")]}
                chevronTestId="chevron"
            />,
        );
        const chevron = screen.getByTestId("chevron");
        expect(chevron.className).toMatch(/variantSecondary/);
    });
});

describe("SplitButton click handling", () => {
    it("primary click fires onPrimaryClick", () => {
        const handler = vi.fn();
        render(
            <SplitButton
                buttonClass="btn btn-primary"
                primaryContent={<span>P</span>}
                onPrimaryClick={handler}
                chevronTooltip="More"
                dropdownItems={[makeItem("a")]}
                primaryTestId="primary"
            />,
        );
        fireEvent.click(screen.getByTestId("primary"));
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("disabled disables BOTH halves", () => {
        const handler = vi.fn();
        render(
            <SplitButton
                buttonClass="btn btn-primary"
                primaryContent={<span>P</span>}
                onPrimaryClick={handler}
                disabled
                chevronTooltip="More"
                dropdownItems={[makeItem("a")]}
                primaryTestId="primary"
                chevronTestId="chevron"
            />,
        );
        const primary = screen.getByTestId("primary") as HTMLButtonElement;
        const chevron = screen.getByTestId("chevron") as HTMLButtonElement;
        expect(primary.disabled).toBe(true);
        expect(chevron.disabled).toBe(true);
        // A disabled button does not fire onClick.
        fireEvent.click(primary);
        expect(handler).not.toHaveBeenCalled();
    });
});
