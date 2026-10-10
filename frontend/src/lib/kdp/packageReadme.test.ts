import {describe, it, expect} from "vitest";

import {CLIENT_PDF_FIDELITY_NOTE, kdpPackageReadme} from "./packageReadme";

describe("kdpPackageReadme", () => {
    it("heads the file with the title and the book's identity", () => {
        const text = kdpPackageReadme(
            {id: "b1", title: "Mein Buch", author: "Asterios Raptis", language: "de"},
            "prose",
        );
        expect(text.split("\n")[0]).toBe("# KDP Publishing Package — Mein Buch");
        expect(text).toContain("Book ID: b1");
        expect(text).toContain("Author: Asterios Raptis");
        expect(text).toContain("Language: de");
        expect(text).toContain("Book type: prose");
    });

    it("names every entry the package carries", () => {
        // The README is the one file a user opens to find out what the
        // other files are. An entry added to the ZIP and not here is a
        // file nobody can identify.
        const text = kdpPackageReadme({id: "b", title: "T"}, "prose");
        for (const entry of [
            "metadata.json",
            "cover.*",
            "cover-validation-report.json",
            "manuscript-*.*",
            "publishing-state-snapshot.json",
        ]) {
            expect(text).toContain(entry);
        }
    });

    it("falls back the way the Python does on an unset author or language", () => {
        const text = kdpPackageReadme({id: "b", title: null}, "comic_book");
        expect(text).toContain("# KDP Publishing Package — Untitled");
        expect(text).toContain("Author: (unset)");
        expect(text).toContain("Language: en");
    });

    it("says in the package itself that a browser rendered the PDF", () => {
        // In the package, not only in the wizard: the ZIP outlives the
        // step that produced it, and the person uploading it to KDP weeks
        // later has the file and not the toast.
        const client = kdpPackageReadme({id: "b", title: "T"}, "prose", {
            clientRendered: true,
        });
        expect(client).toContain("## About this PDF");
        expect(client).toContain("rendered in your browser");
        expect(client).toContain("no crop marks");
        for (const line of CLIENT_PDF_FIDELITY_NOTE) expect(client).toContain(line);
    });

    it("omits the fidelity note when the server built the package", () => {
        const server = kdpPackageReadme({id: "b", title: "T"}, "prose");
        expect(server).not.toContain("## About this PDF");
        // and the shared body is byte-identical to the client build's
        // prefix, so the note is additive rather than a second README.
        const client = kdpPackageReadme({id: "b", title: "T"}, "prose", {
            clientRendered: true,
        });
        expect(client.startsWith(server.trimEnd())).toBe(true);
    });

    it("ends with a newline, like a text file should", () => {
        expect(kdpPackageReadme({id: "b", title: "T"}, "prose").endsWith("\n")).toBe(true);
    });
});
