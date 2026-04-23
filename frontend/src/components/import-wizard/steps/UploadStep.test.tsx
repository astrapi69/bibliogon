import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadStep } from "./UploadStep";

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

function file(name: string, size: number, type = "application/octet-stream"): File {
    const f = new File([new Uint8Array(Math.min(size, 1024))], name, { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
}

describe("UploadStep", () => {
    it("selects a .bgb file via the hidden input and calls onFileSelected", () => {
        const onFileSelected = vi.fn();
        render(<UploadStep onFileSelected={onFileSelected} />);
        const input = screen.getByTestId("upload-input");
        const f = file("book.bgb", 1024);
        fireEvent.change(input, { target: { files: [f] } });
        expect(onFileSelected).toHaveBeenCalledWith(f);
    });

    it("accepts a .md file", () => {
        const onFileSelected = vi.fn();
        render(<UploadStep onFileSelected={onFileSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("book.md", 512)] },
        });
        expect(onFileSelected).toHaveBeenCalled();
    });

    it("rejects unsupported extensions without calling onFileSelected", () => {
        const onFileSelected = vi.fn();
        render(<UploadStep onFileSelected={onFileSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("book.pdf", 1024)] },
        });
        expect(onFileSelected).not.toHaveBeenCalled();
        expect(screen.getByTestId("upload-error")).toHaveTextContent(/unsupported/i);
    });

    it("rejects .zip while no backend handler is registered for ZIPs", () => {
        // Regression pin: the wizard previously advertised .zip in its
        // accepted-formats list despite no registered backend handler.
        // Users dropped ZIPs and hit a 415 from /api/import/detect
        // only after upload. Keep .zip rejected at the gate until
        // plugin-git-sync PGS-01 ships a ZIP handler.
        const onFileSelected = vi.fn();
        render(<UploadStep onFileSelected={onFileSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("project.zip", 1024)] },
        });
        expect(onFileSelected).not.toHaveBeenCalled();
        expect(screen.getByTestId("upload-error")).toHaveTextContent(
            /unsupported/i,
        );
    });

    it("rejects files over 500 MB", () => {
        const onFileSelected = vi.fn();
        render(<UploadStep onFileSelected={onFileSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("huge.bgb", 501 * 1024 * 1024)] },
        });
        expect(onFileSelected).not.toHaveBeenCalled();
        expect(screen.getByTestId("upload-error")).toHaveTextContent(/too large/i);
    });

    it("warns but accepts files over 50 MB", () => {
        const onFileSelected = vi.fn();
        render(<UploadStep onFileSelected={onFileSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("big.bgb", 60 * 1024 * 1024)] },
        });
        expect(onFileSelected).toHaveBeenCalled();
        expect(screen.getByTestId("upload-warning")).toBeInTheDocument();
    });

    it("drag-drop triggers onFileSelected", () => {
        const onFileSelected = vi.fn();
        render(<UploadStep onFileSelected={onFileSelected} />);
        const zone = screen.getByTestId("upload-dropzone");
        const f = file("book.bgb", 1024);
        fireEvent.drop(zone, { dataTransfer: { files: [f] } });
        expect(onFileSelected).toHaveBeenCalledWith(f);
    });

    it("keyboard Enter on dropzone opens the file picker", () => {
        const onFileSelected = vi.fn();
        render(<UploadStep onFileSelected={onFileSelected} />);
        const input = screen.getByTestId("upload-input");
        const clickSpy = vi.spyOn(input, "click");
        fireEvent.keyDown(screen.getByTestId("upload-dropzone"), { key: "Enter" });
        expect(clickSpy).toHaveBeenCalled();
    });
});
