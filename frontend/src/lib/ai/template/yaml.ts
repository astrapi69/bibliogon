/**
 * Serialize and parse a `.biblio.yaml` template in the browser (#745).
 *
 * Mirrors `backend/app/ai/template_yaml.py`. The contract the port has to
 * hold is the STRUCTURE and the header, not the bytes: PyYAML and the
 * `yaml` package fold long plain scalars differently, and chasing
 * PyYAML's emitter would be effort spent on whitespace that no reader -
 * human or assistant - depends on. So `aiTemplate.parity.test.ts`
 * compares parsed structures, compares the header character for
 * character, and asserts separately on the two formatting properties that
 * ARE load-bearing: non-ASCII stays unescaped (rule 4 in the header tells
 * the assistant to write umlauts, so the file must be able to carry them)
 * and nested maps stay in block style (a flow-style dump is valid YAML and
 * unreadable to the human who has to paste it).
 *
 * @example
 * const template = parseTemplate(await file.text());
 * const text = serializeTemplate(template);
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { ARTICLE_HEADER, BOOK_HEADER, SCHEMA_VERSION } from "./headers";
import {
    FIELD_ORDER,
    OPTIONAL_ROOT_KEYS,
    TemplateSchemaError,
    type BiblioTemplate,
    type TemplateKind,
} from "./models";

/** `type`, validated. */
export function templateKind(body: unknown): TemplateKind {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new TemplateSchemaError("Template root must be a mapping");
    }
    const type = (body as Record<string, unknown>).type;
    if (type === "article" || type === "book") return type;
    throw new TemplateSchemaError(
        `Unknown template type ${JSON.stringify(type)}; expected 'article' or 'book'`,
    );
}

/**
 * Parse a template, dispatching on the `type` discriminator.
 *
 * Comments are dropped, including the rules-for-AI header - the backend
 * does the same and regenerates it on export, which is why the header is
 * documentation rather than a contract the parser enforces.
 *
 * @throws TemplateSchemaError on malformed YAML, a missing or unknown
 *   `type`, an unsupported `schema_version`, or a field that is not the
 *   three-key mapping the format requires.
 */
export function parseTemplate(text: string): BiblioTemplate {
    let body: unknown;
    try {
        body = parseYaml(text);
    } catch (err) {
        throw new TemplateSchemaError(
            `Malformed YAML: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    const kind = templateKind(body);
    const root = body as Record<string, unknown>;
    if (root.schema_version !== SCHEMA_VERSION) {
        throw new TemplateSchemaError(
            `Unsupported schema_version ${JSON.stringify(root.schema_version)}; ` +
                `expected ${SCHEMA_VERSION}`,
        );
    }
    for (const name of FIELD_ORDER[kind]) {
        const field = root[name];
        if (
            typeof field !== "object" ||
            field === null ||
            Array.isArray(field) ||
            typeof (field as Record<string, unknown>).description !== "string"
        ) {
            // Pydantic would reject this with a ValidationError the route
            // turns into a 400; the message names the field, because "the
            // structure is invalid" sends the user back to a 300-line file
            // with no idea where to look.
            throw new TemplateSchemaError(
                `Template structure invalid: field '${name}' must be a mapping ` +
                    "with a 'description'",
            );
        }
    }
    return root as BiblioTemplate;
}

/**
 * Render a template as the file the user downloads.
 *
 * With `includeHeader` (the default) the rules-for-AI block is prepended,
 * matching `serialize_template_to_yaml`'s default.
 */
export function serializeTemplate(
    template: BiblioTemplate,
    includeHeader = true,
): string {
    const kind = templateKind(template);
    const body: Record<string, unknown> = {
        type: template.type,
        schema_version: template.schema_version,
    };
    for (const key of OPTIONAL_ROOT_KEYS) {
        const value = template[key];
        // Dropped only when null or absent, so an empty template skips the
        // reference block cleanly while `current_value: null` survives
        // inside every field.
        if (value !== null && value !== undefined) body[key] = value;
    }
    for (const name of FIELD_ORDER[kind]) {
        const field = template[name];
        if (field === undefined) continue;
        body[name] = field;
    }
    const yamlBody = stringifyYaml(body, {
        // PyYAML's `sort_keys=False` equivalent: `yaml` keeps insertion
        // order unless told otherwise, and the loop above is the order.
        sortMapEntries: false,
        // `default_flow_style=False`: every nested map and list on its own
        // lines, which is what makes the file readable in a chat window.
        defaultStringType: "PLAIN",
        defaultKeyType: "PLAIN",
        lineWidth: 80,
        // A null value writes as `null`, like PyYAML's `safe_dump`, rather
        // than as an empty scalar - the header tells the assistant to
        // leave a field `null`, so it has to see the word.
        nullStr: "null",
    });
    if (!includeHeader) return yamlBody;
    return (kind === "article" ? ARTICLE_HEADER : BOOK_HEADER) + "\n" + yamlBody;
}
