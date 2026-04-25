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

    it("css language exposes a preview toggle when value is non-empty", () => {
        render(
            <EnhancedTextarea
                value="body { color: red; }"
                onChange={() => {}}
                language="css"
                testid="t"
            />,
        );
        expect(screen.getByTestId("t-preview-toggle")).toBeInTheDocument();
    });

    it("css preview toggle hidden when value is empty", () => {
        render(
            <EnhancedTextarea
                value=""
                onChange={() => {}}
                language="css"
                testid="t"
            />,
        );
        expect(
            screen.queryByTestId("t-preview-toggle"),
        ).not.toBeInTheDocument();
    });

    it("clicking css preview toggle reveals the highlighted preview", () => {
        render(
            <EnhancedTextarea
                value="body { color: red; }"
                onChange={() => {}}
                language="css"
                testid="t"
            />,
        );
        expect(
            screen.queryByTestId("textarea-css-preview"),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId("t-preview-toggle"));
        const preview = screen.getByTestId("textarea-css-preview");
        expect(preview).toBeInTheDocument();
        // Lowlight wraps tokens in <span class="hljs-...">.
        expect(preview.querySelectorAll("span.hljs-selector-tag, span.hljs-attribute, span.hljs-number, span.hljs-keyword").length).toBeGreaterThan(0);
    });

    it("plain language does not render the preview toggle", () => {
        render(
            <EnhancedTextarea
                value="hello"
                onChange={() => {}}
                language="plain"
                testid="t"
            />,
        );
        expect(
            screen.queryByTestId("t-preview-toggle"),
        ).not.toBeInTheDocument();
    });

    it("markdown language reveals markdown preview on toggle", () => {
        const md = ["# Heading", "", "**bold** text"].join("\n");
        render(
            <EnhancedTextarea
                value={md}
                onChange={() => {}}
                language="markdown"
                testid="t"
            />,
        );
        fireEvent.click(screen.getByTestId("t-preview-toggle"));
        const preview = screen.getByTestId("textarea-markdown-preview");
        expect(preview).toBeInTheDocument();
        expect(preview.querySelector("h1")?.textContent).toBe("Heading");
        expect(preview.querySelector("strong")?.textContent).toBe("bold");
    });

    it("html language reveals sanitized html preview on toggle", () => {
        render(
            <EnhancedTextarea
                value="<p>safe</p><script>alert('xss')</script>"
                onChange={() => {}}
                language="html"
                testid="t"
            />,
        );
        fireEvent.click(screen.getByTestId("t-preview-toggle"));
        const preview = screen.getByTestId("textarea-html-preview");
        expect(preview).toBeInTheDocument();
        expect(preview.querySelector("p")?.textContent).toBe("safe");
        // Script tag stripped by DOMPurify.
        expect(preview.querySelector("script")).toBeNull();
        expect(preview.innerHTML).not.toContain("alert");
    });

    it("fullscreen toggle is hidden by default", () => {
        render(<EnhancedTextarea value="" onChange={() => {}} testid="t"/>);
        expect(
            screen.queryByTestId("t-fullscreen"),
        ).not.toBeInTheDocument();
    });

    it("fullscreen=true exposes the toggle", () => {
        render(
            <EnhancedTextarea
                value="x"
                onChange={() => {}}
                fullscreen
                testid="t"
            />,
        );
        expect(screen.getByTestId("t-fullscreen")).toBeInTheDocument();
    });

    it("fullscreen toggle wraps body in a dialog overlay", () => {
        render(
            <EnhancedTextarea
                value="x"
                onChange={() => {}}
                fullscreen
                testid="t"
            />,
        );
        fireEvent.click(screen.getByTestId("t-fullscreen"));
        const overlay = screen.getByTestId("t-fullscreen-overlay");
        expect(overlay).toBeInTheDocument();
        expect(overlay.getAttribute("role")).toBe("dialog");
        expect(overlay.getAttribute("aria-modal")).toBe("true");
    });

    it("ESC closes the fullscreen overlay", () => {
        render(
            <EnhancedTextarea
                value="x"
                onChange={() => {}}
                fullscreen
                testid="t"
            />,
        );
        fireEvent.click(screen.getByTestId("t-fullscreen"));
        expect(
            screen.getByTestId("t-fullscreen-overlay"),
        ).toBeInTheDocument();
        fireEvent.keyDown(window, { key: "Escape" });
        expect(
            screen.queryByTestId("t-fullscreen-overlay"),
        ).not.toBeInTheDocument();
    });

    it("html preview strips inline event handlers", () => {
        render(
            <EnhancedTextarea
                value='<p onclick="alert(1)">click</p>'
                onChange={() => {}}
                language="html"
                testid="t"
            />,
        );
        fireEvent.click(screen.getByTestId("t-preview-toggle"));
        const preview = screen.getByTestId("textarea-html-preview");
        const p = preview.querySelector("p") as HTMLElement;
        expect(p?.getAttribute("onclick")).toBeNull();
    });
});
