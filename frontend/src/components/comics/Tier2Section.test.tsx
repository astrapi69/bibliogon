/**
 * Tier2Section tests (Comics-Session-2 C5).
 *
 * Pins:
 * - Field-name parity with the walker (font_family, font_size,
 *   font_weight, text_color, text_align, italic).
 * - testidPrefix + i18nKeyPrefix prop defaulting.
 * - Read precedence: bubbles[0].X overrides flat X.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import {Tier2Section} from "./Tier2Section";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

describe("Tier2Section", () => {
    it("renders all 6 Tier-2 fields with default testidPrefix", () => {
        render(
            <Tier2Section
                config={null}
                onChange={() => {}}
                defaultOpen={true}
            />,
        );
        expect(
            screen.getByTestId("speech-bubble-font-family-select"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-font-size-slider"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-font-weight-select"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("speech-bubble-text-color")).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-text-align-select"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("speech-bubble-italic-toggle"),
        ).toBeInTheDocument();
    });

    it("renders all fields under comic-bubble prefix", () => {
        render(
            <Tier2Section
                config={null}
                onChange={() => {}}
                testidPrefix="comic-bubble"
                defaultOpen={true}
            />,
        );
        expect(
            screen.getByTestId("comic-bubble-font-family-select"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("comic-bubble-italic-toggle"),
        ).toBeInTheDocument();
    });

    it("font_weight select fires onChange with the new value", () => {
        const onChange = vi.fn();
        render(
            <Tier2Section
                config={null}
                onChange={onChange}
                defaultOpen={true}
            />,
        );
        const select = screen.getByTestId(
            "speech-bubble-font-weight-select",
        ) as HTMLSelectElement;
        fireEvent.change(select, {target: {value: "bold"}});
        expect(onChange).toHaveBeenCalledWith({font_weight: "bold"});
    });

    it("italic checkbox fires onChange with boolean", () => {
        const onChange = vi.fn();
        render(
            <Tier2Section
                config={null}
                onChange={onChange}
                defaultOpen={true}
            />,
        );
        const toggle = screen.getByTestId(
            "speech-bubble-italic-toggle",
        ) as HTMLInputElement;
        fireEvent.click(toggle);
        expect(onChange).toHaveBeenCalledWith({italic: true});
    });

    it("reads pre-filled font_size from bubbles[0]", () => {
        render(
            <Tier2Section
                config={{bubbles: [{font_size: 22}]}}
                onChange={() => {}}
                defaultOpen={true}
            />,
        );
        expect(
            screen.getByTestId("speech-bubble-font-size-value").textContent,
        ).toBe("22pt");
    });

    it("bubbles[0] overrides flat key (Inclusive-on-write convention)", () => {
        render(
            <Tier2Section
                config={{font_size: 14, bubbles: [{font_size: 28}]}}
                onChange={() => {}}
                defaultOpen={true}
            />,
        );
        expect(
            screen.getByTestId("speech-bubble-font-size-value").textContent,
        ).toBe("28pt");
    });
});
