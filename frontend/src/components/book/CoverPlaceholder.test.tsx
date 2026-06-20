import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CoverPlaceholder from "./CoverPlaceholder";

describe("CoverPlaceholder", () => {
    it("renders the title", () => {
        render(<CoverPlaceholder title="My Book" />);
        expect(screen.getByText("My Book")).toBeTruthy();
    });

    it("uses the title as the aria-label for screen readers", () => {
        render(<CoverPlaceholder title="My Book" />);
        expect(screen.getByLabelText("My Book")).toBeTruthy();
    });

    it("produces the same hue for the same title (deterministic)", () => {
        const { container, unmount } = render(<CoverPlaceholder title="Stable Title" />);
        const hueA = container.querySelector("[data-hue]")?.getAttribute("data-hue");
        unmount();

        const { container: container2 } = render(<CoverPlaceholder title="Stable Title" />);
        const hueB = container2.querySelector("[data-hue]")?.getAttribute("data-hue");

        expect(hueA).toBe(hueB);
        expect(hueA).not.toBeNull();
    });

    it("produces different hues for different titles", () => {
        const { container: a } = render(<CoverPlaceholder title="One" data-testid="a" />);
        const { container: b } = render(<CoverPlaceholder title="Two" data-testid="b" />);
        const hueA = a.querySelector("[data-hue]")?.getAttribute("data-hue");
        const hueB = b.querySelector("[data-hue]")?.getAttribute("data-hue");
        expect(hueA).not.toBe(hueB);
    });

    it("hides subtitle in compact mode", () => {
        render(<CoverPlaceholder title="Title" subtitle="Subtitle" compact />);
        expect(screen.queryByText("Subtitle")).toBeNull();
    });

    it("renders subtitle in default (non-compact) mode", () => {
        render(<CoverPlaceholder title="Title" subtitle="Subtitle" />);
        expect(screen.getByText("Subtitle")).toBeTruthy();
    });
});
