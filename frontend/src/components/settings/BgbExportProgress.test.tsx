import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { BgbExportProgress } from "./BgbExportProgress";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

describe("BgbExportProgress", () => {
    it("renders nothing when there is no progress", () => {
        const { container } = render(<BgbExportProgress progress={null} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("shows the collecting phase label without a counter bar", () => {
        render(<BgbExportProgress progress={{ step: "collecting" }} />);
        expect(screen.getByTestId("bgb-export-progress-label").textContent).toBe("Daten sammeln…");
        expect(screen.queryByTestId("bgb-export-progress-bar")).toBeNull();
    });

    it("appends a counter and renders the bar during the assets phase", () => {
        render(<BgbExportProgress progress={{ step: "assets", current: 3, total: 12 }} />);
        expect(screen.getByTestId("bgb-export-progress-label").textContent).toBe(
            "Bilder laden… (3/12)",
        );
        const bar = screen.getByTestId("bgb-export-progress-bar");
        expect(bar.getAttribute("aria-valuenow")).toBe("25");
        expect(screen.getByTestId("bgb-export-progress-bar-fill").getAttribute("style")).toContain(
            "width: 25%",
        );
    });

    it("omits the counter for an assets phase with a zero total", () => {
        render(<BgbExportProgress progress={{ step: "assets", current: 0, total: 0 }} />);
        expect(screen.getByTestId("bgb-export-progress-label").textContent).toBe("Bilder laden…");
        expect(screen.queryByTestId("bgb-export-progress-bar")).toBeNull();
    });

    it("shows the finalizing phase label", () => {
        render(<BgbExportProgress progress={{ step: "finalizing" }} />);
        expect(screen.getByTestId("bgb-export-progress-label").textContent).toBe(
            "Download wird vorbereitet…",
        );
    });
});
