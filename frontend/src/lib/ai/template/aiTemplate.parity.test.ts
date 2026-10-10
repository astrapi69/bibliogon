/**
 * #745: the port is checked against what the endpoints actually return.
 *
 * `backend/tests/test_ai_template_parity.py` records the response of
 * `GET /api/{books,articles}/{id}/ai-template` for six cases into
 * `aiTemplate.parity.json`. This asserts the TypeScript reproduces it.
 *
 * Recorded at the endpoint rather than at `serialize_template_to_yaml`
 * because of #1042: a record taken below the API boundary cannot see what
 * the route supplies, and here the route supplies the download filename.
 *
 * What is compared, and what deliberately is not:
 *
 * - **Structure**, both directions: the recorded YAML parses to the same
 *   object the port produces, and the port's own output re-parses to it.
 * - **The header**, character for character, because in the
 *   external-roundtrip workflow it is the only instruction the assistant
 *   reads.
 * - **NOT the bytes.** PyYAML and the `yaml` package fold long plain
 *   scalars differently. Chasing PyYAML's emitter would spend effort on
 *   whitespace nothing depends on - so the two formatting properties that
 *   DO matter are asserted on their own instead: non-ASCII unescaped, and
 *   nested maps in block style.
 */

import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";

import record from "./aiTemplate.parity.json";
import { ARTICLE_HEADER, BOOK_HEADER } from "./headers";
import { FIELD_ORDER, type TemplateKind } from "./models";
import { parseTemplate, serializeTemplate } from "./yaml";

interface Case {
    key: string;
    kind: TemplateKind;
    title: string;
    content_disposition: string;
    yaml: string;
}

const CASES = record.cases as Case[];

/** The YAML body, with the comment header removed. */
function bodyOf(text: string): string {
    const start = text.indexOf("\ntype: ");
    return start === -1 ? text : text.slice(start + 1);
}

describe("the recorded cases cover every shape", () => {
    it("has a case per kind, plus unicode and empty-field variants", () => {
        const keys = CASES.map((c) => c.key);
        // A record that silently loses a case would make the assertions
        // below pass by not running.
        expect(keys).toEqual([
            "book-plain",
            "book-unicode",
            "book-empty-fields",
            "article-plain",
            "article-unicode",
            "article-bare",
        ]);
    });
});

describe("parseTemplate reads what the backend wrote", () => {
    it.each(CASES.map((c) => [c.key, c] as const))("%s", (_key, testCase) => {
        const parsed = parseTemplate(testCase.yaml);
        expect(parsed).toEqual(parseYaml(testCase.yaml));
        expect(parsed.type).toBe(testCase.kind);
        expect(parsed.schema_version).toBe(1);
    });

    it.each(CASES.map((c) => [c.key, c] as const))(
        "%s keeps every field, with null intact",
        (_key, testCase) => {
            const parsed = parseTemplate(testCase.yaml);
            for (const name of FIELD_ORDER[testCase.kind]) {
                const field = parsed[name] as Record<string, unknown>;
                expect(field, `field ${name} is missing`).toBeTruthy();
                expect(typeof field.description).toBe("string");
                // The three-key contract: `current_value` present even when
                // null, because the header tells the assistant to fill that
                // key and it has to be there to fill.
                expect(Object.keys(field)).toContain("current_value");
            }
        },
    );
});

describe("serializeTemplate round-trips through the backend's own parser shape", () => {
    it.each(CASES.map((c) => [c.key, c] as const))("%s", (_key, testCase) => {
        const parsed = parseTemplate(testCase.yaml);
        const rendered = serializeTemplate(parsed);
        // The structure survives, which is the contract. The bytes do not
        // have to: see the file docstring.
        expect(parseYaml(bodyOf(rendered))).toEqual(parseYaml(bodyOf(testCase.yaml)));
    });

    it.each(CASES.map((c) => [c.key, c] as const))(
        "%s emits the fields in the backend's order",
        (_key, testCase) => {
            const rendered = serializeTemplate(parseTemplate(testCase.yaml));
            const recordedOrder = Object.keys(
                parseYaml(bodyOf(testCase.yaml)) as Record<string, unknown>,
            );
            expect(Object.keys(parseYaml(bodyOf(rendered)) as Record<string, unknown>)).toEqual(
                recordedOrder,
            );
        },
    );

    it.each(CASES.map((c) => [c.key, c] as const))(
        "%s prepends the header its kind calls for, character for character",
        (_key, testCase) => {
            const rendered = serializeTemplate(parseTemplate(testCase.yaml));
            const header = testCase.kind === "article" ? ARTICLE_HEADER : BOOK_HEADER;
            expect(rendered.startsWith(header + "\n")).toBe(true);
            // And the recorded response starts with the same bytes, which
            // is what makes the constant a mirror rather than a rewrite.
            expect(testCase.yaml.startsWith(header + "\n")).toBe(true);
        },
    );

    it("omits the header on request, like include_header=False", () => {
        const rendered = serializeTemplate(parseTemplate(CASES[0].yaml), false);
        expect(rendered.startsWith("#")).toBe(false);
        expect(rendered.startsWith("type: book")).toBe(true);
    });
});

describe("the two formatting properties that are load-bearing", () => {
    it("writes non-ASCII unescaped, as the header instructs the assistant to", () => {
        const unicodeCase = CASES.find((c) => c.key === "book-unicode")!;
        const rendered = serializeTemplate(parseTemplate(unicodeCase.yaml));
        expect(rendered).toContain("Über Dächer und Straßen");
        // `Ü` would be valid YAML and unreadable, and would contradict
        // rule 4 of the header in the same file.
        expect(rendered).not.toContain("\\u00");
    });

    it("keeps nested maps in block style", () => {
        const rendered = serializeTemplate(parseTemplate(CASES[0].yaml));
        // A flow-style dump (`title: {description: ..., example: ...}`) is
        // valid YAML and unreadable in a chat window, which is where this
        // file is meant to be pasted.
        expect(rendered).toMatch(/^title:\n {2}description: /m);
        expect(rendered).not.toMatch(/^title: \{/m);
    });
});

describe("parseTemplate rejects what the backend rejects", () => {
    it("refuses a non-mapping root", () => {
        expect(() => parseTemplate("- a\n- b\n")).toThrow(/must be a mapping/);
        expect(() => parseTemplate("just a string\n")).toThrow(/must be a mapping/);
    });

    it("refuses an unknown type", () => {
        expect(() => parseTemplate("type: pamphlet\nschema_version: 1\n")).toThrow(
            /Unknown template type/,
        );
        expect(() => parseTemplate("schema_version: 1\n")).toThrow(/Unknown template type/);
    });

    it("refuses a schema_version it does not know", () => {
        expect(() => parseTemplate("type: book\nschema_version: 99\n")).toThrow(
            /Unsupported schema_version/,
        );
        // Absent is not 1: a file with no version is not a template this
        // code wrote, and guessing would apply the wrong field set.
        expect(() => parseTemplate("type: book\n")).toThrow(/Unsupported schema_version/);
    });

    it("refuses malformed YAML", () => {
        expect(() => parseTemplate("type: book\n  bad: [indent\n")).toThrow(/Malformed YAML/);
    });

    it("names the field when one is not the three-key mapping", () => {
        const good = parseTemplate(CASES[0].yaml);
        const broken = { ...good, subtitle: "just a string" };
        expect(() => parseTemplate(serializeTemplate(broken as typeof good))).toThrow(
            /field 'subtitle'/,
        );
    });
});
