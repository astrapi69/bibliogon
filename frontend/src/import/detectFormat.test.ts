import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";

import { detectImportFormat } from "./detectFormat";

function file(content: BlobPart, name: string): File {
    return new File([content], name);
}

describe("detectImportFormat", () => {
    it("detects markdown by extension", async () => {
        expect(await detectImportFormat(file("# Hi", "a.md"))).toBe("markdown");
        expect(await detectImportFormat(file("# Hi", "a.markdown"))).toBe(
            "markdown",
        );
    });

    it("detects text and html by extension", async () => {
        expect(await detectImportFormat(file("hi", "a.txt"))).toBe("text");
        expect(await detectImportFormat(file("<p>hi</p>", "a.html"))).toBe(
            "html",
        );
        expect(await detectImportFormat(file("<p>hi</p>", "a.htm"))).toBe(
            "html",
        );
    });

    it("detects bgb by extension without reading content", async () => {
        expect(await detectImportFormat(file("anything", "backup.bgb"))).toBe(
            "bgb",
        );
    });

    it("detects a full-data backup bundle by its JSON envelope", async () => {
        const bundle = JSON.stringify({ version: 1, data: { books: [] } });
        expect(await detectImportFormat(file(bundle, "b.json"))).toBe(
            "json-backup",
        );
    });

    it("treats unrelated JSON as unknown", async () => {
        const other = JSON.stringify({ hello: "world" });
        expect(await detectImportFormat(file(other, "x.json"))).toBe("unknown");
    });

    it("detects a Medium export ZIP by its posts/*.html entries", async () => {
        const zip = zipSync({
            "posts/2020-01-01_hello-abc.html": strToU8("<article></article>"),
            "profile/about.html": strToU8("<p></p>"),
        });
        expect(await detectImportFormat(file(zip, "medium-export.zip"))).toBe(
            "medium-zip",
        );
    });

    it("treats a non-Medium ZIP (e.g. write-book-template) as unknown", async () => {
        const zip = zipSync({
            "metadata.yaml": strToU8("title: X"),
            "manuscript/chapter-01.md": strToU8("# One"),
        });
        expect(await detectImportFormat(file(zip, "project.zip"))).toBe(
            "unknown",
        );
    });

    it("returns unknown for unrecognised extensions", async () => {
        expect(await detectImportFormat(file("x", "a.pdf"))).toBe("unknown");
        expect(await detectImportFormat(file("x", "noext"))).toBe("unknown");
    });
});
