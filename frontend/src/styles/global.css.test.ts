import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Regression pin: the sticky-footer pattern survives across global.css edits.
// Modal action buttons in scrolling dialogs (.dialog-content-wide) must stay
// reachable as content grows. Audit + fix were applied across BackupCompare,
// ChapterTemplatePicker, CreateBook, ErrorReport, Export, SaveAsTemplate.

describe("global.css sticky modal footer", () => {
    const css = readFileSync(
        resolve(__dirname, "global.css"),
        "utf-8",
    );

    it("scopes sticky-footer to scrolling dialog containers", () => {
        expect(css).toMatch(/\.dialog-content-wide\s+\.dialog-footer\s*\{/);
    });

    it("declares position:sticky bottom:0 on the scoped footer", () => {
        const block = css.match(
            /\.dialog-content-wide\s+\.dialog-footer\s*\{[^}]+\}/,
        );
        expect(block).not.toBeNull();
        expect(block![0]).toContain("position: sticky");
        expect(block![0]).toContain("bottom: 0");
    });

    it("does not promote non-scrolling .dialog-footer to sticky", () => {
        // The base .dialog-footer rule should NOT carry position:sticky;
        // only the .dialog-content-wide-scoped rule does. AppDialog and
        // SaveAsChapterTemplateModal are short-content modals that gain
        // nothing from sticky and should not get a top border either.
        const baseBlock = css.match(/^\.dialog-footer\s*\{[^}]+\}/m);
        expect(baseBlock).not.toBeNull();
        expect(baseBlock![0]).not.toContain("position: sticky");
    });
});
