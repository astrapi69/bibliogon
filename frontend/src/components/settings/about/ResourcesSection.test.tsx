import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {ResourcesSection} from "./ResourcesSection";

const t = (_: string, fallback: string) => fallback;

describe("ResourcesSection legal links", () => {
    it("links to the imprint and privacy pages in the UI language", () => {
        render(<ResourcesSection t={t} lang="de" onCreateReport={vi.fn()} />);
        expect(screen.getByTestId("about-imprint-link")).toHaveAttribute("href", "/impressum.html");
        expect(screen.getByTestId("about-privacy-link")).toHaveAttribute("href", "/datenschutz.html");
    });

    it("falls back to the English pages", () => {
        render(<ResourcesSection t={t} lang="ja" onCreateReport={vi.fn()} />);
        expect(screen.getByTestId("about-imprint-link")).toHaveAttribute("href", "/imprint.html");
        expect(screen.getByTestId("about-privacy-link")).toHaveAttribute("href", "/privacy.html");
    });
});
