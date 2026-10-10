/**
 * The A+ generation port, against the recorded Python (#890 stage 3b).
 *
 * Every assertion here reads `generate.parity.json`, produced by
 * `backend/tests/test_aplus_generate_parity.py` from the live
 * generator. Nothing in this file states what the behaviour should be;
 * the record does, and a disagreement is a port that drifted.
 *
 * The loop cases replay the recorded replies through a scripted chat
 * function and compare the resulting package AND the prompts the
 * function was handed - a port that produced the right package from
 * the wrong second prompt would otherwise pass.
 *
 * One shape is normalised before comparing, the same one
 * `validation.parity.test.ts` normalises: `AplusFinding.params` is
 * optional on the TS side and the validator omits it when there is
 * nothing to interpolate, while Pydantic always emits `params: {}`.
 * Absent and empty mean the same thing to every reader of the type,
 * and the convention is pinned by its own case below rather than left
 * as a silent allowance inside the comparison.
 */

import { describe, expect, it } from "vitest";

import type { AplusFinding, AplusMeta, AplusPackage } from "../../api/platform/aplus";
import record from "./generate.parity.json";
import {
    INITIAL_GENERATION_ATTEMPT,
    buildDraftPackage,
    generateAplusPackage,
    parseAiYamlFragment,
    type AplusChatMessage,
    type AplusChatReply,
} from "./generate";
import { buildStyleContext } from "./imagePrompts";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { getAplusRuleset } from "./ruleset";
import type { BookContext } from "./bookContext";

const RULES = getAplusRuleset();
const PLACEHOLDER = record.generated_at_placeholder;

/** The record's context entries are the dataclass, field for field. */
const asContext = (raw: unknown): BookContext => raw as BookContext;

function metaFor(language: string, model: string): AplusMeta {
    return {
        book_id: "book-1",
        language,
        model,
        ruleset_version: record.ruleset_version,
        generated_at: PLACEHOLDER,
    };
}

/**
 * The package with every finding's `params` spelled out as `{}` when
 * the validator omitted it, which is the only shape difference between
 * the two sides (see the module docstring).
 */
function withEmptyParams(pkg: AplusPackage): AplusPackage {
    return {
        ...pkg,
        validation: pkg.validation.map((f) => ({ ...f, params: f.params ?? {} })),
    };
}

/** Replies from a list, repeating the last once the script runs out. */
function scripted(responses: { content: string; model?: string }[]) {
    const prompts: AplusChatMessage[][] = [];
    const temperatures: number[] = [];
    const chat = async (
        messages: AplusChatMessage[],
        options: { temperature: number },
    ): Promise<AplusChatReply> => {
        prompts.push(messages.map((message) => ({ ...message })));
        temperatures.push(options.temperature);
        const index = Math.min(prompts.length - 1, responses.length - 1);
        return { ...responses[index] };
    };
    return { chat, prompts, temperatures };
}

describe("the ruleset the record was taken against", () => {
    it("is the one the browser reads", () => {
        // Every expectation below is derived from these two numbers. A
        // seed regenerated from a newer ruleset than the record would
        // otherwise fail somewhere far from the cause.
        expect(RULES.version).toBe(record.ruleset_version);
        expect(RULES.max_regeneration_retries).toBe(record.max_regeneration_retries);
        expect(INITIAL_GENERATION_ATTEMPT).toBe(record.initial_generation_attempt);
    });
});

describe("buildSystemPrompt", () => {
    for (const entry of record.system_prompts) {
        it(`matches the recorded prompt for ${entry.language}`, () => {
            expect(buildSystemPrompt(entry.language)).toBe(entry.prompt);
        });
    }
});

describe("buildUserPrompt", () => {
    for (const entry of record.prompt_cases) {
        it(`matches the recorded prompt for ${entry.name}`, () => {
            const prompt = buildUserPrompt(asContext(entry.context), {
                rules: RULES,
                priorFindings: entry.prior_findings as AplusFinding[],
            });
            expect(prompt).toBe(entry.user_prompt);
        });
    }
});

describe("parseAiYamlFragment", () => {
    for (const entry of record.raw_responses) {
        it(`parses ${entry.name} the way PyYAML did`, () => {
            expect(parseAiYamlFragment(entry.text)).toEqual(entry.parsed);
        });
    }
});

describe("buildDraftPackage", () => {
    for (const entry of record.fragment_cases) {
        it(`builds the recorded draft for ${entry.name}`, () => {
            const styles = buildStyleContext(entry.genre_key, RULES.image_style);
            const draft = buildDraftPackage(
                entry.parsed as Record<string, unknown>,
                metaFor("de", "test-model"),
                styles,
            );
            expect(draft).toEqual(entry.draft);
        });
    }
});

describe("generateAplusPackage", () => {
    for (const entry of record.loop_cases) {
        it(`reproduces the recorded run for ${entry.name}`, async () => {
            const client = scripted(entry.responses);
            const pkg: AplusPackage = await generateAplusPackage(asContext(entry.context), {
                language: entry.language,
                rules: RULES,
                chat: client.chat,
                now: () => PLACEHOLDER,
            });
            expect(withEmptyParams(pkg)).toEqual(entry.package);
            expect(client.prompts.length).toBe(entry.attempts);
            expect(client.temperatures).toEqual(entry.temperatures);
            expect(client.prompts).toEqual(entry.prompts);
        });
    }
});

describe("the recorded runs cover the branches the loop can take", () => {
    // Without this the suite could pass on a record whose cases all
    // happened to finish on the first attempt, leaving the retry and
    // the exhausted-budget paths unexercised in the browser too.
    const byName = new Map(record.loop_cases.map((entry) => [entry.name, entry]));

    it("includes a clean first attempt, a retry, and an exhausted budget", () => {
        const budget = INITIAL_GENERATION_ATTEMPT + RULES.max_regeneration_retries;
        expect(byName.get("first-attempt-is-clean")?.attempts).toBe(1);
        expect(byName.get("retry-fixes-the-error")?.attempts).toBe(2);
        expect(byName.get("budget-exhausted-returns-the-errors")?.attempts).toBe(budget);
    });

    it("states the params convention the comparison relies on", () => {
        // The normalisation above is only safe while this holds: a
        // finding with nothing to interpolate omits `params` rather
        // than carrying something else, so absent really does mean
        // empty. A validator that started emitting `params: null`
        // would make the comparison lie instead of fail.
        const exhausted = byName.get("budget-exhausted-returns-the-errors");
        const withoutParams = exhausted?.package.validation.filter(
            (finding) => Object.keys(finding.params).length === 0,
        );
        expect(withoutParams?.length).toBeGreaterThan(0);
        const client = scripted(exhausted!.responses);
        return generateAplusPackage(asContext(exhausted!.context), {
            language: exhausted!.language,
            rules: RULES,
            chat: client.chat,
            now: () => PLACEHOLDER,
        }).then((pkg) => {
            const omitted = pkg.validation.filter((finding) => finding.params === undefined);
            expect(omitted.length).toBe(withoutParams?.length);
        });
    });

    it("has the exhausted case come back WITH its errors", () => {
        const exhausted = byName.get("budget-exhausted-returns-the-errors");
        expect(
            exhausted?.package.validation.some((finding) => finding.severity === "error"),
        ).toBe(true);
    });
});
