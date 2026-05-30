/**
 * Tier1Section tests (Comics-Session-2 C5).
 *
 * Pins:
 * - Field-name parity with the walker (background_color,
 *   border_color, border_width, border_style, border_radius,
 *   shadow, shadow_intensity, padding).
 * - testidPrefix + i18nKeyPrefix prop defaulting (picture-book
 *   backward-compat).
 * - onChange receives partial dicts in flat shape.
 */

import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import {Tier1Section} from "./Tier1Section";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

describe("Tier1Section", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("renders all 8 Tier-1 fields with default testidPrefix", () => {
        render(<Tier1Section config={null} onChange={() => {}} />);
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"));

        expect(
            screen.getByTestId("speech-bubble-background-color"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-border-color"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-border-width-slider"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-border-style-trigger"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-border-radius-slider"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-shadow-toggle"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-shadow-intensity-slider"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-padding-slider"),
        ).toBeInTheDocument();
    });

    it("honours testidPrefix='comic-bubble' when explicitly provided", () => {
        render(
            <Tier1Section
                config={null}
                onChange={() => {}}
                testidPrefix="comic-bubble"
            />,
        );
        fireEvent.click(screen.getByTestId("comic-bubble-tier1-trigger"));
        expect(
            screen.getByTestId("comic-bubble-background-color"),
        ).toBeInTheDocument();
    });

    it("border_style select fires onChange immediately (discrete control)", () => {
        const onChange = vi.fn();
        render(<Tier1Section config={null} onChange={onChange} />);
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"));
        const select = screen.getByTestId(
            "speech-bubble-border-style-trigger",
        ) as HTMLSelectElement;
        fireEvent.change(select, {target: {value: "dashed"}});
        expect(onChange).toHaveBeenCalledWith({border_style: "dashed"});
    });

    it("shadow checkbox fires onChange with boolean", () => {
        const onChange = vi.fn();
        render(<Tier1Section config={null} onChange={onChange} />);
        fireEvent.click(screen.getByTestId("speech-bubble-tier1-trigger"));
        const toggle = screen.getByTestId(
            "speech-bubble-shadow-toggle",
        ) as HTMLInputElement;
        // Default DEFAULT_SHADOW=true; clicking flips it to false.
        fireEvent.click(toggle);
        expect(onChange).toHaveBeenCalledWith({shadow: false});
    });

    it("collapses by default + opens on trigger click", () => {
        render(<Tier1Section config={null} onChange={() => {}} />);
        const trigger = screen.getByTestId("speech-bubble-tier1-trigger");
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(trigger);
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
    });

    it("respects defaultOpen=true", () => {
        render(
            <Tier1Section
                config={null}
                onChange={() => {}}
                defaultOpen={true}
            />,
        );
        expect(
            screen.getByTestId("speech-bubble-background-color"),
        ).toBeInTheDocument();
    });

    it("reads pre-filled border_width from bubbles[0]", () => {
        render(
            <Tier1Section
                config={{bubbles: [{border_width: 6}]}}
                onChange={() => {}}
                defaultOpen={true}
            />,
        );
        expect(
            screen.getByTestId("speech-bubble-border-width-value").textContent,
        ).toBe("6px");
    });
});
