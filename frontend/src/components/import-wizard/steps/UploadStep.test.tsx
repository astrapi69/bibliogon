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

function file(
    name: string,
    size: number,
    type = "application/octet-stream",
): File {
    const f = new File([new Uint8Array(Math.min(size, 1024))], name, { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
}

function folderFile(
    relativePath: string,
    size = 128,
    type = "text/markdown",
): File {
    const f = file(relativePath.split("/").pop() ?? relativePath, size, type);
    Object.defineProperty(f, "webkitRelativePath", {
        value: relativePath,
        configurable: true,
    });
    return f;
}

describe("UploadStep", () => {
    it("selects a .bgb file via the hidden input and calls onInputSelected", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        const input = screen.getByTestId("upload-input");
        const f = file("book.bgb", 1024);
        fireEvent.change(input, { target: { files: [f] } });
        expect(onInputSelected).toHaveBeenCalledWith({ files: [f] });
    });

    it("accepts a .md file", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("book.md", 512)] },
        });
        expect(onInputSelected).toHaveBeenCalled();
    });

    it("rejects unsupported extensions without calling onInputSelected", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("book.pdf", 1024)] },
        });
        expect(onInputSelected).not.toHaveBeenCalled();
        expect(screen.getByTestId("upload-error")).toHaveTextContent(/unsupported/i);
    });

    it("accepts .zip (WbtImportHandler handles write-book-template archives)", () => {
        // CIO-02 re-enables .zip in the wizard: WbtImportHandler claims
        // ZIPs that carry a config/metadata.yaml marker. ZIPs without
        // the marker still get rejected by the orchestrator at detect
        // time (415) - the wizard just lets the gate open.
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("project.zip", 1024)] },
        });
        expect(onInputSelected).toHaveBeenCalled();
    });

    it("accepts .docx (CIO-04 office handler)", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("manuscript.docx", 1024)] },
        });
        expect(onInputSelected).toHaveBeenCalled();
    });

    it("accepts .epub (CIO-04 office handler)", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("book.epub", 1024)] },
        });
        expect(onInputSelected).toHaveBeenCalled();
    });

    it("rejects files over 500 MB", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("huge.bgb", 501 * 1024 * 1024)] },
        });
        expect(onInputSelected).not.toHaveBeenCalled();
        expect(screen.getByTestId("upload-error")).toHaveTextContent(/too large/i);
    });

    it("warns but accepts files over 50 MB", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        fireEvent.change(screen.getByTestId("upload-input"), {
            target: { files: [file("big.bgb", 60 * 1024 * 1024)] },
        });
        expect(onInputSelected).toHaveBeenCalled();
        expect(screen.getByTestId("upload-warning")).toBeInTheDocument();
    });

    it("drag-drop of a single file triggers onInputSelected with one file", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        const zone = screen.getByTestId("upload-dropzone");
        const f = file("book.bgb", 1024);
        fireEvent.drop(zone, { dataTransfer: { files: [f] } });
        expect(onInputSelected).toHaveBeenCalledWith({ files: [f] });
    });

    it("keyboard Enter on dropzone opens the file picker", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        const input = screen.getByTestId("upload-input");
        const clickSpy = vi.spyOn(input, "click");
        fireEvent.keyDown(screen.getByTestId("upload-dropzone"), { key: "Enter" });
        expect(clickSpy).toHaveBeenCalled();
    });

    // --- CIO-03: folder upload ---

    it("folder input passes selected files with webkitRelativePath as paths", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        const folderInput = screen.getByTestId("upload-folder-input");
        const files = [
            folderFile("project/01-intro.md"),
            folderFile("project/02-next.md"),
            folderFile("project/images/cover.png", 256, "image/png"),
        ];
        fireEvent.change(folderInput, { target: { files } });
        expect(onInputSelected).toHaveBeenCalledTimes(1);
        const arg = onInputSelected.mock.calls[0][0];
        expect(arg.files).toHaveLength(3);
        expect(arg.paths).toEqual([
            "project/01-intro.md",
            "project/02-next.md",
            "project/images/cover.png",
        ]);
    });

    it("folder input filters out unrelated files (e.g. .DS_Store)", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        const folderInput = screen.getByTestId("upload-folder-input");
        const files = [
            folderFile("project/01-intro.md"),
            folderFile("project/.DS_Store", 64, "application/octet-stream"),
            folderFile("project/README.md"),
        ];
        fireEvent.change(folderInput, { target: { files } });
        const arg = onInputSelected.mock.calls[0][0];
        expect(arg.files.map((f: File) => f.name)).toEqual([
            "01-intro.md",
            "README.md",
        ]);
    });

    it("folder with no .md files surfaces error", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        const folderInput = screen.getByTestId("upload-folder-input");
        fireEvent.change(folderInput, {
            target: {
                files: [folderFile("project/notes.txt", 64, "text/plain")],
            },
        });
        expect(onInputSelected).not.toHaveBeenCalled();
        expect(screen.getByTestId("upload-error")).toBeInTheDocument();
    });

    it("folder picker button focuses the folder input", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        const folderInput = screen.getByTestId("upload-folder-input");
        const clickSpy = vi.spyOn(folderInput, "click");
        fireEvent.click(screen.getByTestId("upload-folder-btn"));
        expect(clickSpy).toHaveBeenCalled();
    });

    // --- git URL input (PGS-01) ---

    it("git URL input submits a valid https URL via onInputSelected", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        fireEvent.change(screen.getByTestId("git-url-input"), {
            target: { value: "https://github.com/astrapi69/write-book-template" },
        });
        fireEvent.click(screen.getByTestId("git-url-submit"));
        expect(onInputSelected).toHaveBeenCalledWith({
            files: [],
            gitUrl: "https://github.com/astrapi69/write-book-template",
        });
    });

    it("git URL input rejects a whitespace-only value via Enter", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        const input = screen.getByTestId("git-url-input");
        // Submit button disables itself on empty input, so drive the
        // submit path via Enter to exercise the trim-then-validate
        // branch of handleGitSubmit.
        fireEvent.change(input, { target: { value: "   " } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onInputSelected).not.toHaveBeenCalled();
        expect(screen.getByTestId("git-url-error")).toHaveTextContent(/paste/i);
    });

    it("git URL input rejects a plainly non-URL string", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        fireEvent.change(screen.getByTestId("git-url-input"), {
            target: { value: "not a url" },
        });
        fireEvent.click(screen.getByTestId("git-url-submit"));
        expect(onInputSelected).not.toHaveBeenCalled();
        expect(screen.getByTestId("git-url-error")).toHaveTextContent(/recognised/i);
    });

    it("git URL submit button is disabled until something is typed", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        expect(screen.getByTestId("git-url-submit")).toBeDisabled();
        fireEvent.change(screen.getByTestId("git-url-input"), {
            target: { value: "https://github.com/foo/bar" },
        });
        expect(screen.getByTestId("git-url-submit")).not.toBeDisabled();
    });

    it("pressing Enter in the git URL input submits when valid", () => {
        const onInputSelected = vi.fn();
        render(<UploadStep onInputSelected={onInputSelected} />);
        const input = screen.getByTestId("git-url-input");
        fireEvent.change(input, {
            target: { value: "git@github.com:foo/bar.git" },
        });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onInputSelected).toHaveBeenCalledWith({
            files: [],
            gitUrl: "git@github.com:foo/bar.git",
        });
    });
});
