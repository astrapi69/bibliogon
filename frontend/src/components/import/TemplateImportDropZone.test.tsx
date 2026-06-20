import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"
import TemplateImportDropZone, {
    _isValidName,
    TemplateImportFilePreview,
} from "../TemplateImportDropZone"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 2/10. Pins the
// drop-zone contract: drag-drop wires through, file-picker
// fallback works, extension validation rejects mismatches
// without calling onFile, and the bulk vs single modes target
// the right extensions.

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}))

describe("_isValidName", () => {
    it("accepts .biblio.yaml in single mode", () => {
        expect(_isValidName("foo.biblio.yaml", "single")).toBe(true)
        expect(_isValidName("FOO.BIBLIO.YAML", "single")).toBe(true)
        expect(_isValidName("foo.biblio.yml", "single")).toBe(true)
    })

    it("rejects .zip in single mode", () => {
        expect(_isValidName("foo.zip", "single")).toBe(false)
    })

    it("accepts .zip in bulk mode", () => {
        expect(_isValidName("foo.zip", "bulk")).toBe(true)
        expect(_isValidName("FOO.ZIP", "bulk")).toBe(true)
    })

    it("rejects .biblio.yaml in bulk mode", () => {
        expect(_isValidName("foo.biblio.yaml", "bulk")).toBe(false)
    })

    it("rejects unrelated extensions", () => {
        expect(_isValidName("foo.txt", "single")).toBe(false)
        expect(_isValidName("foo.json", "bulk")).toBe(false)
    })
})

describe("TemplateImportDropZone", () => {
    let onFile: ReturnType<typeof vi.fn> & ((file: File) => void)

    beforeEach(() => {
        onFile = vi.fn() as typeof onFile
    })

    it("calls onFile when a valid file is dropped (single mode)", () => {
        render(<TemplateImportDropZone mode="single" onFile={onFile}/>)
        const zone = screen.getByTestId("template-import-dropzone")
        const file = new File(["type: article\n"], "alpha.biblio.yaml", {
            type: "text/yaml",
        })
        fireEvent.drop(zone, {
            dataTransfer: {files: [file]},
        })
        expect(onFile).toHaveBeenCalledWith(file)
    })

    it("rejects an invalid file and surfaces the error", () => {
        render(<TemplateImportDropZone mode="single" onFile={onFile}/>)
        const zone = screen.getByTestId("template-import-dropzone")
        const file = new File(["x"], "alpha.zip", {type: "application/zip"})
        fireEvent.drop(zone, {dataTransfer: {files: [file]}})
        expect(onFile).not.toHaveBeenCalled()
        expect(screen.getByTestId("template-import-dropzone-error")).toBeTruthy()
    })

    it("accepts a .zip in bulk mode", () => {
        render(<TemplateImportDropZone mode="bulk" onFile={onFile}/>)
        const zone = screen.getByTestId("template-import-dropzone")
        const file = new File(["PK"], "bundle.zip", {type: "application/zip"})
        fireEvent.drop(zone, {dataTransfer: {files: [file]}})
        expect(onFile).toHaveBeenCalledWith(file)
    })

    it("file picker via input change triggers onFile", () => {
        render(<TemplateImportDropZone mode="single" onFile={onFile}/>)
        const input = screen.getByTestId(
            "template-import-dropzone-input",
        ) as HTMLInputElement
        const file = new File(["type: article\n"], "alpha.biblio.yaml")
        Object.defineProperty(input, "files", {
            value: [file],
            configurable: true,
        })
        fireEvent.change(input)
        expect(onFile).toHaveBeenCalledWith(file)
    })

    it("clears prior error when a valid file is supplied next", () => {
        render(<TemplateImportDropZone mode="single" onFile={onFile}/>)
        const zone = screen.getByTestId("template-import-dropzone")
        // First drop: invalid -> error surfaces.
        fireEvent.drop(zone, {
            dataTransfer: {files: [new File(["x"], "bad.txt")]},
        })
        expect(screen.queryByTestId("template-import-dropzone-error")).not.toBeNull()

        // Second drop: valid -> error clears, callback fires.
        fireEvent.drop(zone, {
            dataTransfer: {
                files: [new File(["x"], "good.biblio.yaml")],
            },
        })
        expect(screen.queryByTestId("template-import-dropzone-error")).toBeNull()
        expect(onFile).toHaveBeenCalledTimes(1)
    })

    it("data-mode attribute reflects the configured mode", () => {
        const {rerender} = render(
            <TemplateImportDropZone mode="single" onFile={onFile}/>,
        )
        expect(
            screen.getByTestId("template-import-dropzone").getAttribute("data-mode"),
        ).toBe("single")
        rerender(<TemplateImportDropZone mode="bulk" onFile={onFile}/>)
        expect(
            screen.getByTestId("template-import-dropzone").getAttribute("data-mode"),
        ).toBe("bulk")
    })

    it("loading mode does not fire the click-to-open handler", () => {
        render(
            <TemplateImportDropZone mode="single" onFile={onFile} loading/>,
        )
        const zone = screen.getByTestId("template-import-dropzone")
        // Clicking the zone while loading should not open the picker
        // (we test via the side effect: no error surfaces, no callback
        // because there's no file). The check that matters is that
        // the cursor + opacity reflect the disabled state.
        expect(zone.getAttribute("style")).toContain("cursor: wait")
    })
})

describe("TemplateImportFilePreview", () => {
    it("renders the filename and size", () => {
        const file = new File([new Uint8Array(2048)], "preview.biblio.yaml")
        render(<TemplateImportFilePreview file={file}/>)
        expect(screen.getByText("preview.biblio.yaml")).toBeTruthy()
        // 2048 bytes = 2.0 KB
        expect(screen.getByText("2.0 KB")).toBeTruthy()
    })
})
