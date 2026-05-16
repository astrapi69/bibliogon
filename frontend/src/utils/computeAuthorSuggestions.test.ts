import {describe, it, expect} from "vitest"
import {computeAuthorSuggestions} from "./computeAuthorSuggestions"

describe("computeAuthorSuggestions", () => {
    it("returns empty when both inputs are empty", () => {
        expect(computeAuthorSuggestions([], [])).toEqual([])
    })

    it("returns just the DB authors when no articles are selected", () => {
        const result = computeAuthorSuggestions(
            [],
            [{name: "Asterios Raptis"}, {name: "Bruce Dickinson"}],
        )
        expect(result).toEqual(["Asterios Raptis", "Bruce Dickinson"])
    })

    it("returns just the article author when DB is empty", () => {
        const result = computeAuthorSuggestions(
            [{author: "Tarja Turunen"}],
            [],
        )
        expect(result).toEqual(["Tarja Turunen"])
    })

    it("merges article and DB authors with article-authors first", () => {
        const result = computeAuthorSuggestions(
            [{author: "Article A Author"}, {author: "Article B Author"}],
            [{name: "DB Only Author"}],
        )
        expect(result).toEqual([
            "Article A Author",
            "Article B Author",
            "DB Only Author",
        ])
    })

    it("dedupes case-insensitively, article casing wins", () => {
        const result = computeAuthorSuggestions(
            [{author: "Asterios Raptis"}],
            [{name: "asterios raptis"}],
        )
        expect(result).toEqual(["Asterios Raptis"])
    })

    it("dedupes whitespace-aware (leading/trailing trimmed)", () => {
        const result = computeAuthorSuggestions(
            [{author: "  Bruce Dickinson  "}],
            [{name: "Bruce Dickinson"}],
        )
        expect(result).toEqual(["Bruce Dickinson"])
    })

    it("skips null author fields", () => {
        const result = computeAuthorSuggestions(
            [{author: null}, {author: "Real Name"}, {author: null}],
            [],
        )
        expect(result).toEqual(["Real Name"])
    })

    it("skips empty + whitespace-only article authors", () => {
        const result = computeAuthorSuggestions(
            [{author: ""}, {author: "   "}, {author: "Solid Name"}],
            [],
        )
        expect(result).toEqual(["Solid Name"])
    })

    it("skips empty + whitespace-only DB names", () => {
        const result = computeAuthorSuggestions(
            [],
            [{name: ""}, {name: "  "}, {name: "Real Name"}],
        )
        expect(result).toEqual(["Real Name"])
    })

    it("dedupes article-internal duplicates (multiple articles same author)", () => {
        const result = computeAuthorSuggestions(
            [
                {author: "Same Author"},
                {author: "Same Author"},
                {author: "Same Author"},
            ],
            [],
        )
        expect(result).toEqual(["Same Author"])
    })

    it("dedupes DB-internal duplicates by case", () => {
        const result = computeAuthorSuggestions(
            [],
            [
                {name: "Asterios"},
                {name: "asterios"},
                {name: "ASTERIOS"},
            ],
        )
        expect(result).toEqual(["Asterios"])
    })

    it("preserves article order for distinct article authors", () => {
        const result = computeAuthorSuggestions(
            [
                {author: "Zeta"},
                {author: "Alpha"},
                {author: "Mu"},
            ],
            [],
        )
        // NOT sorted alphabetically — article-insertion order is the
        // user's natural selection order, which is what the datalist
        // should present.
        expect(result).toEqual(["Zeta", "Alpha", "Mu"])
    })

    it("preserves DB order for distinct DB names after article block", () => {
        const result = computeAuthorSuggestions(
            [{author: "Article-Only"}],
            [
                {name: "DB Zeta"},
                {name: "DB Alpha"},
                {name: "DB Mu"},
            ],
        )
        expect(result).toEqual([
            "Article-Only",
            "DB Zeta",
            "DB Alpha",
            "DB Mu",
        ])
    })

    it("treats DB entry that equals a trimmed-cased article author as duplicate", () => {
        const result = computeAuthorSuggestions(
            [
                {author: "  Mixed Case Author  "},
                {author: "Other Article Author"},
            ],
            [
                {name: "MIXED CASE AUTHOR"},
                {name: "Brand New"},
            ],
        )
        expect(result).toEqual([
            "Mixed Case Author",
            "Other Article Author",
            "Brand New",
        ])
    })

    it("preserves the trimmed display form, not the raw whitespace form", () => {
        const result = computeAuthorSuggestions(
            [{author: "   Padded   "}],
            [],
        )
        expect(result).toEqual(["Padded"])
    })
})
