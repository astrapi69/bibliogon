import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EnhancedTextarea } from "./EnhancedTextarea";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
    });
});

describe("EnhancedTextarea", () => {
    it("renders a textarea with the given value", () => {
        const onChange = vi.fn();
        render(
            <EnhancedTextarea
                value="hello world"
                onChange={onChange}
                testid="t"
            />,
        );
        const ta = screen.getByTestId("t") as HTMLTextAreaElement;
        expect(ta.value).toBe("hello world");
    });

    it("propagates onChange", () => {
        const onChange = vi.fn();
        render(
            <EnhancedTextarea value="" onChange={onChange} testid="t" />,
        );
        fireEvent.change(screen.getByTestId("t"), {
            target: { value: "edited" },
        });
        expect(onChange).toHaveBeenCalledWith("edited");
    });

    it("renders a copy button by default", () => {
        render(
            <EnhancedTextarea value="x" onChange={() => {}} testid="t" />,
        );
        expect(screen.getByTestId("t-copy")).toBeInTheDocument();
    });

    it("hides copy button when copy=false", () => {
        render(
            <EnhancedTextarea
                value="x"
                onChange={() => {}}
                copy={false}
                testid="t"
            />,
        );
        expect(screen.queryByTestId("t-copy")).not.toBeInTheDocument();
    });

    it("copy button writes value to clipboard", async () => {
        render(
            <EnhancedTextarea
                value="payload text"
                onChange={() => {}}
                testid="t"
            />,
        );
        fireEvent.click(screen.getByTestId("t-copy"));
        await vi.waitFor(() =>
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
                "payload text",
            ),
        );
    });

    it("copy button is disabled when value is empty", () => {
        render(
            <EnhancedTextarea value="" onChange={() => {}} testid="t" />,
        );
        expect(screen.getByTestId("t-copy")).toBeDisabled();
    });

    it("renders word + character count footer", () => {
        render(
            <EnhancedTextarea
                value="hello world here"
                onChange={() => {}}
                testid="t"
            />,
        );
        const footer = screen.getByTestId("t-footer");
        expect(footer.textContent).toContain("Wörter: 3");
        expect(footer.textContent).toContain("16 Zeichen");
    });

    it("char counter shows X / max when over limit", () => {
        render(
            <EnhancedTextarea
                value="abcdef"
                onChange={() => {}}
                maxChars={3}
                testid="t"
            />,
        );
        const footer = screen.getByTestId("t-footer");
        expect(footer.textContent).toContain("6 / 3");
    });

    it("readOnly hides word count by default", () => {
        render(
            <EnhancedTextarea
                value="x"
                onChange={() => {}}
                readOnly
                testid="t"
            />,
        );
        const footer = screen.queryByTestId("t-footer");
        // Char count still present, so footer renders; word count
        // segment is empty.
        expect(footer?.textContent).not.toContain("Wörter");
    });

    it("language='css' enables monospace font", () => {
        render(
            <EnhancedTextarea
                value="body { color: red; }"
                onChange={() => {}}
                language="css"
                testid="t"
            />,
        );
        const ta = screen.getByTestId("t") as HTMLTextAreaElement;
        expect(ta.style.fontFamily).toBe("var(--font-mono)");
    });

    it("language attribute is exposed for downstream phases", () => {
        render(
            <EnhancedTextarea
                value=""
                onChange={() => {}}
                language="markdown"
                testid="t"
            />,
        );
        expect(
            screen.getByTestId("t-wrapper").getAttribute("data-language"),
        ).toBe("markdown");
    });
});
