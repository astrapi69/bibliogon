import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MediumImportUploadZone from "./MediumImportUploadZone";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

function makeFile(name: string, sizeBytes: number, type = "application/zip"): File {
    const file = new File([new Uint8Array(0)], name, { type });
    Object.defineProperty(file, "size", { value: sizeBytes });
    return file;
}

describe("MediumImportUploadZone", () => {
    it("renders the drop-zone hint when no file selected", () => {
        render(<MediumImportUploadZone file={null} onFileSelected={vi.fn()} />);
        expect(
            screen.getByTestId("medium-import-upload-zone"),
        ).toBeInTheDocument();
    });

    it("calls onFileSelected when a valid .zip is picked", () => {
        const onFileSelected = vi.fn();
        const { container } = render(
            <MediumImportUploadZone file={null} onFileSelected={onFileSelected} />,
        );
        const input = container.querySelector(
            '[data-testid="medium-import-upload-input"]',
        ) as HTMLInputElement;
        const file = makeFile("archive.zip", 1024);
        fireEvent.change(input, { target: { files: [file] } });
        expect(onFileSelected).toHaveBeenCalledWith(file);
    });

    it("rejects a non-zip file with a visible error", () => {
        const onFileSelected = vi.fn();
        const { container } = render(
            <MediumImportUploadZone file={null} onFileSelected={onFileSelected} />,
        );
        const input = container.querySelector(
            '[data-testid="medium-import-upload-input"]',
        ) as HTMLInputElement;
        const file = makeFile("archive.tar.gz", 1024, "application/gzip");
        fireEvent.change(input, { target: { files: [file] } });
        expect(onFileSelected).not.toHaveBeenCalled();
        expect(screen.getByTestId("medium-import-upload-error")).toBeInTheDocument();
    });

    it("rejects a file >200MB", () => {
        const onFileSelected = vi.fn();
        const { container } = render(
            <MediumImportUploadZone file={null} onFileSelected={onFileSelected} />,
        );
        const input = container.querySelector(
            '[data-testid="medium-import-upload-input"]',
        ) as HTMLInputElement;
        const file = makeFile("huge.zip", 250 * 1024 * 1024);
        fireEvent.change(input, { target: { files: [file] } });
        expect(onFileSelected).not.toHaveBeenCalled();
        expect(screen.getByTestId("medium-import-upload-error")).toBeInTheDocument();
    });

    it("shows a soft warning for files >50MB but accepts them", () => {
        const onFileSelected = vi.fn();
        const { container } = render(
            <MediumImportUploadZone file={null} onFileSelected={onFileSelected} />,
        );
        const input = container.querySelector(
            '[data-testid="medium-import-upload-input"]',
        ) as HTMLInputElement;
        const file = makeFile("medium.zip", 80 * 1024 * 1024);
        fireEvent.change(input, { target: { files: [file] } });
        expect(onFileSelected).toHaveBeenCalledWith(file);
        expect(screen.getByTestId("medium-import-upload-warning")).toBeInTheDocument();
    });

    it("renders the selected state with filename + size and clear button", () => {
        const file = makeFile("archive.zip", 2 * 1024 * 1024);
        const onFileSelected = vi.fn();
        render(<MediumImportUploadZone file={file} onFileSelected={onFileSelected} />);
        expect(screen.getByText("archive.zip")).toBeInTheDocument();
        expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("medium-import-upload-clear"));
        expect(onFileSelected).toHaveBeenCalledWith(null);
    });

    it("does not invoke the picker when disabled", () => {
        const onFileSelected = vi.fn();
        render(
            <MediumImportUploadZone
                file={null}
                onFileSelected={onFileSelected}
                disabled
            />,
        );
        const zone = screen.getByTestId("medium-import-upload-zone");
        expect(zone).toHaveAttribute("aria-disabled", "true");
    });
});
