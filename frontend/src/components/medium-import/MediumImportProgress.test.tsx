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

    // ASYNC-IMPORT-PROGRESS-01 Phase 2: new processing-async phase
    // renders SSE-driven determinate progress with per-post counters.

    it("processing-async phase renders the SSE-driven determinate bar", () => {
        render(
            <MediumImportProgress
                phase="processing-async"
                asyncCurrent={3}
                asyncTotal={10}
                asyncCurrentFilename="post-3.html"
                asyncImported={2}
                asyncSkipped={1}
                asyncErrored={0}
                asyncImportedComments={0}
                asyncSkippedComments={0}
            />,
        );
        const wrap = screen.getByTestId("medium-import-progress-async");
        expect(wrap).toBeInTheDocument();
        expect(wrap).toHaveAttribute("aria-valuenow", "3");
        expect(wrap).toHaveAttribute("aria-valuemax", "10");

        const counter = screen.getByTestId(
            "medium-import-progress-async-counter",
        );
        expect(counter.textContent).toContain("3");
        expect(counter.textContent).toContain("10");
        expect(counter.textContent).toContain("30%");

        const currentFile = screen.getByTestId(
            "medium-import-progress-async-current-file",
        );
        expect(currentFile.textContent).toBe("post-3.html");

        const tally = screen.getByTestId(
            "medium-import-progress-async-tally",
        );
        expect(tally.textContent).toContain("2"); // imported
        expect(tally.textContent).toContain("1"); // skipped
        expect(tally.textContent).toContain("0"); // errored
    });

    it("async phase folds skipped-comments into the skipped tally", () => {
        // Per the page wiring, skipped-comments add to the same
        // "skipped" tally column for the user (both are non-imports).
        render(
            <MediumImportProgress
                phase="processing-async"
                asyncCurrent={5}
                asyncTotal={5}
                asyncCurrentFilename=""
                asyncImported={3}
                asyncSkipped={1}
                asyncErrored={0}
                asyncImportedComments={0}
                asyncSkippedComments={1}
            />,
        );
        const tally = screen.getByTestId(
            "medium-import-progress-async-tally",
        );
        // 1 article skipped + 1 comment skipped -> "2 übersprungen"
        expect(tally.textContent).toContain("2");
    });

    it("async phase shows the comments counter when imported comments > 0", () => {
        render(
            <MediumImportProgress
                phase="processing-async"
                asyncCurrent={5}
                asyncTotal={5}
                asyncCurrentFilename=""
                asyncImported={3}
                asyncSkipped={0}
                asyncErrored={0}
                asyncImportedComments={2}
                asyncSkippedComments={0}
            />,
        );
        const tally = screen.getByTestId(
            "medium-import-progress-async-tally",
        );
        expect(tally.textContent).toMatch(/Kommentare/i);
    });

    it("async phase percent clamps to 100 even when overcount", () => {
        // Defensive: an SSE event-ordering glitch could send a
        // stale index > total. Bar should still render 100% (not
        // 150%) so the UI doesn't look glitchy.
        render(
            <MediumImportProgress
                phase="processing-async"
                asyncCurrent={15}
                asyncTotal={10}
                asyncCurrentFilename=""
                asyncImported={10}
                asyncSkipped={0}
                asyncErrored={0}
                asyncImportedComments={0}
                asyncSkippedComments={0}
            />,
        );
        const counter = screen.getByTestId(
            "medium-import-progress-async-counter",
        );
        expect(counter.textContent).toContain("100%");
    });

    it("async phase omits the current-file label when filename is empty", () => {
        render(
            <MediumImportProgress
                phase="processing-async"
                asyncCurrent={0}
                asyncTotal={5}
                asyncCurrentFilename=""
                asyncImported={0}
                asyncSkipped={0}
                asyncErrored={0}
                asyncImportedComments={0}
                asyncSkippedComments={0}
            />,
        );
        expect(
            screen.queryByTestId("medium-import-progress-async-current-file"),
        ).toBeNull();
    });
});
