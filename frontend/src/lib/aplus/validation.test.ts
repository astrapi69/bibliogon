/**
 * #890: the ported validator agrees with the Python one it mirrors.
 *
 * The structure follows `plugins/bibliogon-plugin-aplus/tests/
 * test_validation.py` case for case - same fixture, same phrases, same
 * four languages - because the point of the port is that a package
 * checked offline gets the same findings as one checked by the desktop
 * backend. Divergences a transcription would introduce (UTF-16 length,
 * ASCII word boundaries) get their own cases at the end.
 */

import { describe, expect, it } from "vitest";

import type { AplusBullet, AplusModule, AplusPackage } from "../../api/platform/aplus";

import { getAplusRuleset } from "./ruleset";
import { containsWord, validateAplusPackage } from "./validation";

const RULES = getAplusRuleset();

function image() {
    return { prompt: "minimalist, flat colors", aspect_ratio: "", size: "", style_flags: [] };
}

function pkg(overrides: {
    short_description?: string;
    bullets?: AplusBullet[];
    headerText?: string;
    headerAlt?: string;
    threeImages?: AplusModule[];
    language?: string;
} = {}): AplusPackage {
    const language = overrides.language ?? "en";
    return {
        short_description:
            overrides.short_description ??
            "A clear, engaging description of the book's premise.",
        bullets:
            overrides.bullets ?? [
                { heading: "Clear structure", body: "Chapters build on each other." },
                { heading: "Real examples", body: "Every idea comes with a concrete case." },
                { heading: "Practical takeaways", body: "Readers leave with something usable." },
            ],
        module_header: {
            title: "Overview",
            text:
                overrides.headerText ??
                "An inviting overview of what the reader will find inside.",
            image: image(),
            alt_text: overrides.headerAlt ?? "Illustration of the book's theme",
        },
        module_three_images:
            overrides.threeImages ?? [
                {
                    title: "Concept one",
                    text: "A supporting idea from the book.",
                    image: image(),
                    alt_text: "Icon representing concept one",
                },
                {
                    title: "Concept two",
                    text: "Another supporting idea.",
                    image: image(),
                    alt_text: "Icon representing concept two",
                },
                {
                    title: "Concept three",
                    text: "A final supporting idea.",
                    image: image(),
                    alt_text: "Icon representing concept three",
                },
            ],
        validation: [],
        meta: {
            book_id: "b1",
            language,
            model: "",
            ruleset_version: RULES.version,
            generated_at: "2026-09-15T00:00:00Z",
        },
    };
}

function check(
    source: AplusPackage,
    language = "en",
    genreKey: string | null = null,
) {
    return validateAplusPackage(source, { language, genreKey });
}

const errorsOf = (findings: ReturnType<typeof check>) =>
    findings.filter((f) => f.severity === "error");
const warningsOf = (findings: ReturnType<typeof check>) =>
    findings.filter((f) => f.severity === "warning");

describe("a clean package", () => {
    it("has no errors", () => {
        expect(errorsOf(check(pkg()))).toEqual([]);
    });
});

describe("dashes", () => {
    it("rejects an em dash", () => {
        const findings = check(pkg({ short_description: "A book — about habits." }));
        expect(errorsOf(findings).map((f) => f.code)).toContain("dash_not_allowed");
    });

    it("rejects an en dash", () => {
        const findings = check(pkg({ short_description: "Pages 10–20 explain why." }));
        expect(errorsOf(findings).map((f) => f.code)).toContain("dash_not_allowed");
    });

    it("accepts a plain hyphen", () => {
        expect(
            errorsOf(check(pkg({ short_description: "A well-made book about habits." }))),
        ).toEqual([]);
    });
});

describe("emoji", () => {
    it("rejects an emoji", () => {
        const findings = check(pkg({ short_description: "A book about habits \u{1F600}" }));
        expect(errorsOf(findings).map((f) => f.code)).toContain("emoji_not_allowed");
    });

    it("accepts plain text", () => {
        expect(errorsOf(check(pkg()))).toEqual([]);
    });
});

describe("hidden and control characters", () => {
    it("rejects a zero-width space", () => {
        const findings = check(pkg({ short_description: "A book\u200babout habits." }));
        expect(errorsOf(findings).map((f) => f.code)).toContain("hidden_character");
    });

    it("rejects a C0 control character", () => {
        const findings = check(pkg({ short_description: "A book\u0007about habits." }));
        expect(errorsOf(findings).map((f) => f.code)).toContain("hidden_character");
    });

    it("accepts a newline in body text", () => {
        const findings = check(
            pkg({
                bullets: [
                    { heading: "One", body: "First line.\nSecond line." },
                    { heading: "Two", body: "Another idea." },
                    { heading: "Three", body: "A third idea." },
                ],
            }),
        );
        expect(errorsOf(findings)).toEqual([]);
    });

    it("rejects a lone surrogate as both invalid and hidden", () => {
        // Python's check is whether text.encode("utf-8") raises, which a
        // lone surrogate does - and it is also category Cs, so the
        // hidden-character rule fires too. Both findings, same as Python.
        const findings = check(pkg({ short_description: `A book \ud800 about habits.` }));
        const codes = errorsOf(findings).map((f) => f.code);
        expect(codes).toContain("invalid_character");
        expect(codes).toContain("hidden_character");
    });
});

describe("marketing imperatives", () => {
    const flagged: Array<[string, string]> = [
        ["de", "Lernen Sie, wie man Tag fuer Tag bessere Entscheidungen trifft."],
        ["en", "Learn how to make better decisions every single day."],
        ["fr", "Apprenez a prendre de meilleures decisions chaque jour."],
        ["es", "Aprenda a tomar mejores decisiones cada dia."],
    ];

    it.each(flagged)("rejects an imperative in %s", (language, phrase) => {
        const findings = errorsOf(check(pkg({ short_description: phrase, language }), language));
        expect(findings.some((f) => f.field === "short_description")).toBe(true);
    });

    const clean: Array<[string, string]> = [
        ["de", "Ein Buch ueber die Kraft kleiner Gewohnheiten."],
        ["en", "A book about the power of small habits."],
        ["fr", "Un livre sur le pouvoir des petites habitudes."],
        ["es", "Un libro sobre el poder de los pequenos habitos."],
    ];

    it.each(clean)("accepts descriptive prose in %s", (language, phrase) => {
        expect(
            errorsOf(check(pkg({ short_description: phrase, language }), language)),
        ).toEqual([]);
    });

    it("catches the #827 example that shipped unflagged", () => {
        const findings = errorsOf(
            check(
                pkg({
                    short_description:
                        "Master AI conversations without writing a single line of code.",
                }),
            ),
        );
        expect(
            findings.some(
                (f) => f.field === "short_description" && f.message.includes("Master"),
            ),
        ).toBe(true);
    });
});

describe("the leading-imperative heuristic", () => {
    it("catches an unlisted German verb opening with Sie", () => {
        const findings = errorsOf(
            check(
                pkg({
                    short_description: "Erobern Sie neue Wissensgebiete mit diesem Buch.",
                    language: "de",
                }),
                "de",
            ),
        );
        expect(findings.some((f) => f.message.includes("Erobern Sie"))).toBe(true);
    });

    it("accepts German prose that does not open with an imperative", () => {
        expect(
            errorsOf(
                check(
                    pkg({
                        short_description: "Dieses Buch begleitet Sie durch vier Jahreszeiten.",
                        language: "de",
                    }),
                    "de",
                ),
            ),
        ).toEqual([]);
    });

    it("catches an unlisted French vous-form verb opening", () => {
        const findings = errorsOf(
            check(
                pkg({
                    short_description: "Gagnez en clarte des le premier chapitre.",
                    language: "fr",
                }),
                "fr",
            ),
        );
        expect(findings.some((f) => f.message.includes("Gagnez"))).toBe(true);
    });

    it("accepts French prose that does not open with an imperative", () => {
        expect(
            errorsOf(
                check(
                    pkg({
                        short_description:
                            "Ce livre explore quatre saisons dans une foret paisible.",
                        language: "fr",
                    }),
                    "fr",
                ),
            ),
        ).toEqual([]);
    });

    it("does not flag a known non-verb French -ez word", () => {
        expect(
            errorsOf(
                check(
                    pkg({
                        short_description:
                            "Assez de theorie, ce livre passe directement a la pratique.",
                        language: "fr",
                    }),
                    "fr",
                ),
            ),
        ).toEqual([]);
    });

    it.each(["Start", "Build", "Get", "Take"])(
        "rejects the leading-only word %s when it opens the field",
        (word) => {
            const findings = errorsOf(
                check(pkg({ short_description: `${word} a new habit, one chapter at a time.` })),
            );
            expect(findings.some((f) => f.field === "short_description")).toBe(true);
        },
    );

    it.each(["start", "build", "get", "take"])(
        "accepts the same word mid-sentence (%s)",
        (word) => {
            expect(
                errorsOf(
                    check(
                        pkg({
                            short_description: `Every chapter helps readers ${word} lasting confidence.`,
                        }),
                    ),
                ),
            ).toEqual([]);
        },
    );

    it("has no English heuristic beyond the word list", () => {
        // Documented limitation, pinned so a future change cannot start
        // (or stop) catching these without an explicit decision.
        expect(
            errorsOf(
                check(
                    pkg({
                        short_description: "Conquer every chapter with confidence and curiosity.",
                    }),
                ),
            ),
        ).toEqual([]);
    });
});

describe("price, shipping and availability", () => {
    const flagged: Array<[string, string]> = [
        ["de", "Jetzt kostenlos lesen und sparen."],
        ["en", "Available now with free shipping."],
        ["fr", "Livraison gratuite dans le monde entier."],
        ["es", "Envio gratis a todo el mundo."],
    ];

    it.each(flagged)("rejects a claim in %s", (language, phrase) => {
        const findings = errorsOf(check(pkg({ short_description: phrase, language }), language));
        expect(findings.some((f) => f.field === "short_description")).toBe(true);
    });

    it("accepts prose about the story itself", () => {
        expect(
            errorsOf(
                check(pkg({ short_description: "The characters travel across three continents." })),
            ),
        ).toEqual([]);
    });
});

describe("competitor brands", () => {
    it("rejects a brand reference", () => {
        const brand = RULES.competitor_brands[0];
        expect(brand).toBeTruthy();
        const findings = errorsOf(
            check(pkg({ short_description: `Also available on ${brand} today.` })),
        );
        expect(findings.map((f) => f.code)).toContain("brand_reference");
    });

    it("accepts text with no brand mention", () => {
        expect(errorsOf(check(pkg()))).toEqual([]);
    });
});

describe("alt text", () => {
    it("rejects empty header alt text", () => {
        const findings = errorsOf(check(pkg({ headerAlt: "" })));
        expect(findings.map((f) => f.code)).toContain("alt_text_required");
    });

    it("rejects whitespace-only alt text", () => {
        const findings = errorsOf(check(pkg({ headerAlt: "   " })));
        expect(findings.map((f) => f.code)).toContain("alt_text_required");
    });

    it("accepts a real alt text", () => {
        expect(errorsOf(check(pkg()))).toEqual([]);
    });

    it("accepts alt text exactly at the limit", () => {
        const alt = "a".repeat(RULES.schema_limits.alt_text);
        expect(errorsOf(check(pkg({ headerAlt: alt })))).toEqual([]);
    });

    it("rejects alt text one over the limit", () => {
        const alt = "a".repeat(RULES.schema_limits.alt_text + 1);
        const findings = errorsOf(check(pkg({ headerAlt: alt })));
        expect(findings.map((f) => f.code)).toContain("alt_text_over_max_length");
    });
});

describe("schema length limits", () => {
    it("accepts a short description exactly at the limit", () => {
        const text = "a".repeat(RULES.schema_limits.short_description);
        expect(errorsOf(check(pkg({ short_description: text })))).toEqual([]);
    });

    it("rejects a short description one over the limit", () => {
        const text = "a".repeat(RULES.schema_limits.short_description + 1);
        const findings = errorsOf(check(pkg({ short_description: text })));
        expect(findings.map((f) => f.code)).toContain("over_max_length");
    });

    it("accepts a bullet heading exactly at the limit", () => {
        const heading = "a".repeat(RULES.schema_limits.bullet_heading);
        const findings = errorsOf(
            check(
                pkg({
                    bullets: [
                        { heading, body: "One." },
                        { heading: "Two", body: "Two." },
                        { heading: "Three", body: "Three." },
                    ],
                }),
            ),
        );
        expect(findings).toEqual([]);
    });

    it("rejects a bullet body one over the limit", () => {
        const body = "a".repeat(RULES.schema_limits.bullet_body + 1);
        const findings = errorsOf(
            check(
                pkg({
                    bullets: [
                        { heading: "One", body },
                        { heading: "Two", body: "Two." },
                        { heading: "Three", body: "Three." },
                    ],
                }),
            ),
        );
        expect(findings.map((f) => f.code)).toContain("over_max_length");
    });
});

describe("structural counts", () => {
    it("rejects fewer than three bullets", () => {
        const findings = errorsOf(
            check(pkg({ bullets: [{ heading: "Only one", body: "Just this." }] })),
        );
        expect(findings.map((f) => f.code)).toContain("bullet_count");
        expect(findings.find((f) => f.code === "bullet_count")?.params?.count).toBe("1");
    });

    it("rejects fewer than three image entries", () => {
        const findings = errorsOf(
            check(
                pkg({
                    threeImages: [
                        {
                            title: "Only one",
                            text: "A single idea.",
                            image: image(),
                            alt_text: "Icon",
                        },
                    ],
                }),
            ),
        );
        expect(findings.map((f) => f.code)).toContain("image_count");
    });
});

describe("soft words and the genre escalation", () => {
    it("warns rather than errors outside the escalating genre", () => {
        const findings = check(
            pkg({ short_description: "A gripping tale of theft and betrayal in deep space." }),
            "en",
            "scifi",
        );
        expect(errorsOf(findings)).toEqual([]);
        expect(warningsOf(findings).some((f) => f.field === "short_description")).toBe(true);
    });

    it("errors on the same word when the genre escalates it", () => {
        const findings = errorsOf(
            check(
                pkg({ short_description: "A gripping tale of theft and betrayal." }),
                "en",
                "kinderbuch",
            ),
        );
        expect(findings.some((f) => f.field === "short_description")).toBe(true);
    });

    it("produces nothing for a word that is not on the soft list", () => {
        expect(
            check(
                pkg({ short_description: "A gentle story about friendship and curiosity." }),
                "en",
                "kinderbuch",
            ),
        ).toEqual([]);
    });

    it("treats an unknown genre key like no genre", () => {
        const findings = check(
            pkg({ short_description: "A gripping tale of theft in the outer colonies." }),
            "en",
            "totally-unknown",
        );
        expect(errorsOf(findings)).toEqual([]);
        expect(warningsOf(findings).some((f) => f.field === "short_description")).toBe(true);
    });
});

describe("finding codes and params", () => {
    it("gives every finding a code and an English message", () => {
        const findings = check(
            pkg({
                short_description: "Entdecken Sie \u{1F600} — jetzt nur 9,99 EUR bei Kindle.",
                language: "de",
            }),
            "de",
        );
        expect(findings.length).toBeGreaterThan(0);
        expect(findings.every((f) => Boolean(f.code))).toBe(true);
        expect(findings.every((f) => Boolean(f.message))).toBe(true);
    });

    it("names the rule in the code and the term in the params", () => {
        const findings = check(
            pkg({ short_description: "Entdecken Sie das Buch.", language: "de" }),
            "de",
        );
        const imperative = findings.filter((f) => f.code === "marketing_imperative");
        expect(imperative.length).toBeGreaterThan(0);
        expect(imperative[0].params?.term).toBe("Entdecken Sie");
    });

    it("carries both numbers on a length finding", () => {
        const findings = check(pkg({ short_description: "x".repeat(5000) }));
        const tooLong = findings.filter((f) => f.code === "over_max_length");
        expect(tooLong.length).toBeGreaterThan(0);
        expect(tooLong[0].params?.length).toBe("5000");
        expect(Number(tooLong[0].params?.max)).toBeLessThan(5000);
    });

    it("reports the fields in the Python validator's order", () => {
        const findings = check(pkg({ short_description: "", headerAlt: "", threeImages: [] }));
        const fields = findings.map((f) => f.field);
        expect(fields).toEqual([
            "module_header.alt_text",
            "module_three_images",
        ]);
    });
});

describe("the four port-specific divergences", () => {
    it("counts length in code points, not UTF-16 units", () => {
        // Python's len() counts code points. Measured with .length, a
        // field of astral characters would count double and be rejected
        // under its real limit.
        const astral = "\u{1F600}".repeat(RULES.schema_limits.short_description);
        expect(astral.length).toBe(RULES.schema_limits.short_description * 2);
        const findings = check(pkg({ short_description: astral }));
        expect(findings.map((f) => f.code)).not.toContain("over_max_length");
    });

    it("uses a Unicode-aware word boundary", () => {
        // JavaScript's \b is ASCII-only, so it sees a word
        // boundary between "Mord" and an umlaut and matches inside the
        // compound; Python's does not, because the umlaut is a word
        // character there.
        expect(containsWord("Ein Mord im Hafen", "Mord")).toBe(true);
        expect(containsWord("Ein Mordüberfall im Hafen", "Mord")).toBe(
            false,
        );
    });

    it("does not match a word inside another word", () => {
        expect(containsWord("a party of five", "art")).toBe(false);
        expect(containsWord("fine art for sale", "art")).toBe(true);
    });

    it("matches case-insensitively, like the Python search", () => {
        expect(containsWord("ENTDECKEN SIE das Buch", "Entdecken Sie")).toBe(true);
    });
});
