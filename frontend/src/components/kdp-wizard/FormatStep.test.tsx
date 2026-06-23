/** Tests for FormatStep (KDP-WIZARD-FORMAT-STEP-01). */
import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import FormatStep from "./FormatStep";
import type {FormatState} from "./machines/types";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback?: string) => fallback ?? _,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const EBOOK: FormatState = {kind: "ebook", trim_size: "6x9", margin: "normal"};
const PAPERBACK: FormatState = {kind: "paperback", trim_size: "6x9", margin: "normal"};

describe("FormatStep", () => {
    it("renders the three format choices", () => {
        render(<FormatStep format={EBOOK} onChange={vi.fn()} />);
        expect(screen.getByTestId("kdp-publishing-wizard-step-2-format")).toBeInTheDocument();
        expect(screen.getByTestId("kdp-publishing-wizard-format-kind-ebook")).toBeInTheDocument();
        expect(screen.getByTestId("kdp-publishing-wizard-format-kind-paperback")).toBeInTheDocument();
        expect(screen.getByTestId("kdp-publishing-wizard-format-kind-hardcover")).toBeInTheDocument();
    });

    it("hides trim/margin for eBook, shows them for print", () => {
        const {rerender} = render(<FormatStep format={EBOOK} onChange={vi.fn()} />);
        expect(
            screen.queryByTestId("kdp-publishing-wizard-format-print-options"),
        ).not.toBeInTheDocument();
        rerender(<FormatStep format={PAPERBACK} onChange={vi.fn()} />);
        expect(
            screen.getByTestId("kdp-publishing-wizard-format-print-options"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("kdp-publishing-wizard-format-trim")).toBeInTheDocument();
    });

    it("fires onChange with the selected kind", () => {
        const onChange = vi.fn();
        render(<FormatStep format={EBOOK} onChange={onChange} />);
        fireEvent.click(screen.getByTestId("kdp-publishing-wizard-format-kind-paperback"));
        expect(onChange).toHaveBeenCalledWith({kind: "paperback"});
    });

    it("fires onChange with the selected trim size", () => {
        const onChange = vi.fn();
        render(<FormatStep format={PAPERBACK} onChange={onChange} />);
        fireEvent.change(screen.getByTestId("kdp-publishing-wizard-format-trim"), {
            target: {value: "5x8"},
        });
        expect(onChange).toHaveBeenCalledWith({trim_size: "5x8"});
    });
});
