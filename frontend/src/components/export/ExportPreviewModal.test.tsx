import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import ExportPreviewModal from "./ExportPreviewModal";
import type { ExportDocument } from "../../export";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({ t: (_k: string, fb: string) => fb, lang: "de", setLang: vi.fn() }),
}));

const DOC: ExportDocument = {
  title: "My Book",
  author: "Jane",
  sections: [
    {
      heading: "Chapter 1",
      doc: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
      },
    },
  ],
};

describe("ExportPreviewModal", () => {
  it("renders the export HTML into a sandboxed iframe when open", () => {
    render(<ExportPreviewModal open doc={DOC} onClose={vi.fn()} />);
    const frame = screen.getByTestId("export-preview-frame") as HTMLIFrameElement;
    const srcdoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("My Book");
    expect(srcdoc).toContain("Chapter 1");
    expect(srcdoc).toContain("Hello");
    expect(frame.getAttribute("sandbox")).toBe("");
  });

  it("does not render when closed", () => {
    render(<ExportPreviewModal open={false} doc={DOC} onClose={vi.fn()} />);
    expect(screen.queryByTestId("export-preview-modal")).toBeNull();
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(<ExportPreviewModal open doc={DOC} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("export-preview-close"));
    expect(onClose).toHaveBeenCalled();
  });
});
