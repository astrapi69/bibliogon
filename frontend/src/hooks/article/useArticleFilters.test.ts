/**
 * Filter-compose tests for useArticleFilters. Pins:
 * - series filter narrows to exact match
 * - tag filter is membership (no substring matching)
 * - filters compose AND across status/series/tag/topic
 * - resetFilters clears every facet (including new series + tag)
 *
 * Real timers + ``waitFor`` because the hook debounces search by
 * 200ms; fake timers break react-router-dom's microtask scheduling.
 */

import {describe, it, expect} from "vitest"
import {renderHook, act, waitFor} from "@testing-library/react"
import React from "react"
import {MemoryRouter} from "react-router-dom"

import {useArticleFilters} from "./useArticleFilters"
import type {Article} from "../../api/client"

const t = (_k: string, fallback?: string) => fallback || _k

function makeArticle(overrides: Partial<Article> = {}): Article {
    return {
        id: "x",
        title: "T",
        subtitle: null,
        author: null,
        language: "en",
        content_type: "article",
        content_json: "",
        status: "draft",
        canonical_url: null,
        featured_image_url: null,
        excerpt: null,
        tags: [],
        topic: null,
        seo_title: null,
        seo_description: null,
        series: null,
        created_at: "2026-04-27T10:00:00Z",
        updated_at: "2026-04-27T10:00:00Z",
        ...overrides,
    }
}

const wrapper = ({children}: {children: React.ReactNode}) =>
    React.createElement(MemoryRouter, null, children)

describe("useArticleFilters - series + tag", () => {
    it("series filter selects exact-string matches", async () => {
        const articles = [
            makeArticle({id: "1", series: "Cosmos"}),
            makeArticle({id: "2", series: "Cosmos"}),
            makeArticle({id: "3", series: "Other"}),
            makeArticle({id: "4", series: null}),
        ]
        const {result} = renderHook(() => useArticleFilters(articles, t), {wrapper})
        act(() => result.current.setSeries("Cosmos"))
        await waitFor(() => {
            const ids = result.current.filteredArticles.map((a) => a.id).sort()
            expect(ids).toEqual(["1", "2"])
        })
    })

    it("tag filter checks list membership, not substring", async () => {
        const articles = [
            makeArticle({id: "1", tags: ["python", "pytest"]}),
            makeArticle({id: "2", tags: ["pythonista"]}), // superstring
            makeArticle({id: "3", tags: ["other"]}),
        ]
        const {result} = renderHook(() => useArticleFilters(articles, t), {wrapper})
        act(() => result.current.setTag("python"))
        await waitFor(() => {
            const ids = result.current.filteredArticles.map((a) => a.id).sort()
            expect(ids).toEqual(["1"])
        })
    })

    it("status + series + tag compose with AND", async () => {
        const articles = [
            makeArticle({
                id: "1",
                series: "Stoa",
                tags: ["philosophy"],
                status: "published",
            }),
            makeArticle({
                id: "2",
                series: "Stoa",
                tags: ["philosophy"],
                status: "draft",
            }),
            makeArticle({
                id: "3",
                series: "Stoa",
                tags: ["history"],
                status: "published",
            }),
        ]
        const {result} = renderHook(() => useArticleFilters(articles, t), {wrapper})
        act(() => {
            result.current.setSeries("Stoa")
        })
        act(() => {
            result.current.setTag("philosophy")
        })
        act(() => {
            result.current.setStatus("published")
        })
        await waitFor(() => {
            const ids = result.current.filteredArticles.map((a) => a.id)
            expect(ids).toEqual(["1"])
        })
    })

    it("availableSeries / availableTags facets count occurrences", () => {
        const articles = [
            makeArticle({id: "1", series: "Stoa", tags: ["a", "b"]}),
            makeArticle({id: "2", series: "Stoa", tags: ["a"]}),
            makeArticle({id: "3", series: "Other", tags: ["c"]}),
        ]
        const {result} = renderHook(() => useArticleFilters(articles, t), {wrapper})
        const seriesByValue = Object.fromEntries(
            result.current.availableSeries.map((o) => [o.value, o.count]),
        )
        expect(seriesByValue).toEqual({Stoa: 2, Other: 1})
        const tagsByValue = Object.fromEntries(
            result.current.availableTags.map((o) => [o.value, o.count]),
        )
        expect(tagsByValue).toEqual({a: 2, b: 1, c: 1})
    })

    it("resetFilters clears every facet, including series + tag", async () => {
        const articles = [makeArticle({id: "1", series: "Stoa", tags: ["x"]})]
        const {result} = renderHook(() => useArticleFilters(articles, t), {wrapper})
        act(() => {
            result.current.setSeries("Stoa")
            result.current.setTag("x")
        })
        act(() => {
            result.current.resetFilters()
        })
        await waitFor(() => {
            expect(result.current.series).toBe("")
            expect(result.current.tag).toBe("")
            expect(result.current.hasActiveFilters).toBe(false)
        })
    })
})
