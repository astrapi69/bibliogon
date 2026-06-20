/**
 * Vitest coverage for SidebarToggleButton.
 *
 * Pins the accessibility contract that screen-reader + keyboard users
 * depend on: aria-expanded mirrors the open state, the aria-label
 * switches between the open/collapse actions, and activation fires the
 * handler. The element is a native <button>, so keyboard
 * focus/Enter/Space come for free — covered here via a click.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {SidebarToggleButton} from "./SidebarToggleButton";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fb: string) => fb,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

describe("SidebarToggleButton", () => {
    it("reflects the open state via aria-expanded + collapse label", () => {
        render(
            <SidebarToggleButton open onToggle={vi.fn()} testId="tg" />,
        );
        const btn = screen.getByTestId("tg");
        expect(btn).toHaveAttribute("aria-expanded", "true");
        expect(btn).toHaveAttribute("aria-label", "Seitenleiste einklappen");
    });

    it("reflects the collapsed state via aria-expanded + open label", () => {
        render(
            <SidebarToggleButton
                open={false}
                onToggle={vi.fn()}
                testId="tg"
            />,
        );
        const btn = screen.getByTestId("tg");
        expect(btn).toHaveAttribute("aria-expanded", "false");
        expect(btn).toHaveAttribute("aria-label", "Seitenleiste öffnen");
    });

    it("fires onToggle when activated", () => {
        const onToggle = vi.fn();
        render(
            <SidebarToggleButton
                open={false}
                onToggle={onToggle}
                testId="tg"
            />,
        );
        fireEvent.click(screen.getByTestId("tg"));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("merges caller positioning classes onto the button", () => {
        render(
            <SidebarToggleButton
                open
                onToggle={vi.fn()}
                testId="tg"
                className="fixed left-3"
            />,
        );
        const btn = screen.getByTestId("tg");
        expect(btn.className).toContain("btn-icon");
        expect(btn.className).toContain("fixed");
    });
});
