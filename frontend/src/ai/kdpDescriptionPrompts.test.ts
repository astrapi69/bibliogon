/**
 * The AI prompts for the KDP description name only tags KDP accepts (#1119).
 *
 * They told the model to use `h2`, which KDP rejects, so a generated
 * description was refused the moment it was pasted. Mirror of
 * `backend/tests/test_kdp_description_prompts.py`.
 */

import { describe, expect, it } from "vitest";

import { BOOK_FIELD_SPECS } from "../lib/ai/template/fieldSpecs";
import { KDP_DESCRIPTION_TAGS } from "../lib/utils/content/kdpHtml";
import { BOOK_FILL_CLASSES } from "./bookFillPrompts";

function allowedTags(text: string): string[] {
    const match = /Allowed tags:\s*([a-z0-9,\s]+?)\./i.exec(text.replace(/\s+/g, " "));
    if (!match) throw new Error(`no 'Allowed tags:' list in ${text.slice(0, 80)}`);
    return match[1].split(",").map((tag) => tag.trim().toLowerCase());
}

function rejected(text: string): string[] {
    return allowedTags(text).filter((tag) => !KDP_DESCRIPTION_TAGS.includes(tag));
}

describe("KDP description prompts", () => {
    it("the browser fill prompt names only tags KDP accepts", () => {
        const messages = BOOK_FILL_CLASSES.marketing_copy.buildMessages(
            { title: "T", language: "de" },
            "body",
        );
        const user = messages.map((message) => message.content).join("\n");
        expect(rejected(user.slice(user.indexOf('"html_description"')))).toEqual([]);
    });

    it("the template field spec names only tags KDP accepts", () => {
        expect(rejected(BOOK_FIELD_SPECS.html_description.description)).toEqual([]);
    });

    it("the check sees a rejected tag", () => {
        expect(rejected("Allowed tags: b, p, h2, ul. Hook")).toEqual(["h2"]);
    });
});
