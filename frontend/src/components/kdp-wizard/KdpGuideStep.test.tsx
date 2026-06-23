/** Tests for KdpGuideStep (KDP-WIZARD-UPLOAD-GUIDE-01). */
import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";

import KdpGuideStep from "./KdpGuideStep";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

describe("KdpGuideStep", () => {
    it("renders the guide container + ordered walkthrough", () => {
        render(<KdpGuideStep />);
        expect(screen.getByTestId("kdp-publishing-wizard-step-5-guide")).toBeInTheDocument();
        const list = screen.getByTestId("kdp-publishing-wizard-step-5-steps");
        expect(list.querySelectorAll("li")).toHaveLength(5);
    });

    it("links to the KDP bookshelf in a new tab", () => {
        render(<KdpGuideStep />);
        const link = screen.getByTestId("kdp-publishing-wizard-step-5-open-kdp");
        expect(link).toHaveAttribute("href", "https://kdp.amazon.com");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("omits the format summary when no format is passed", () => {
        render(<KdpGuideStep />);
        expect(
            screen.queryByTestId("kdp-publishing-wizard-step-5-format-summary"),
        ).not.toBeInTheDocument();
    });

    it("consumes the chosen format: shows it with the trim size for print", () => {
        render(
            <KdpGuideStep format={{kind: "paperback", trim_size: "6x9", margin: "normal"}} />,
        );
        const summary = screen.getByTestId("kdp-publishing-wizard-step-5-format-summary");
        expect(summary).toBeInTheDocument();
        expect(summary.textContent).toContain("6 × 9");
    });
});
