import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MediumImportProgress from "./MediumImportProgress";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

describe("MediumImportProgress", () => {
    it("renders the determinate uploading bar with percentage", () => {
        render(<MediumImportProgress phase="uploading" loaded={500} total={1000} />);
        const bar = screen.getByTestId("medium-import-progress-uploading");
        expect(bar).toBeInTheDocument();
        expect(bar).toHaveAttribute("aria-valuenow", "50");
        expect(screen.getByText(/50%/)).toBeInTheDocument();
    });

    it("renders 0% when total is unknown", () => {
        render(<MediumImportProgress phase="uploading" loaded={0} total={0} />);
        const bar = screen.getByTestId("medium-import-progress-uploading");
        expect(bar).toHaveAttribute("aria-valuenow", "0");
    });

    it("renders the indeterminate processing state", () => {
        render(<MediumImportProgress phase="processing" />);
        expect(
            screen.getByTestId("medium-import-progress-processing"),
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId("medium-import-progress-uploading"),
        ).not.toBeInTheDocument();
    });
});
