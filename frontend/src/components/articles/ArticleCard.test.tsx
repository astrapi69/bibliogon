/**
 * ArticleCard date-display behavior tests.
 *
 * Pins the prefer-original_published_at-over-updated_at rule that
 * makes imported Medium articles show their canonical Medium publish
 * date instead of the Bibliogon import timestamp. See the matching
 * backend computed-field tests in test_articles.py.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ArticleCard from "./ArticleCard";
import type { Article } from "../../api/client";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

function makeArticle(overrides: Partial<Article> = {}): Article {
    return {
        id: "art-1",
        title: "Sample article",
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
        created_at: "2026-05-08T11:00:00Z",
        updated_at: "2026-05-11T14:30:00Z",
        ...overrides,
    };
}

describe("ArticleCard date display", () => {
    it("prefers original_published_at when present", () => {
        const article = makeArticle({
            original_published_at: "2020-02-04T15:46:58.820Z",
        });
        render(<ArticleCard article={article} onClick={vi.fn()} />);
        // German short month names: 4. Feb. 2020 (locale "de-DE")
        // Allow exact or unicode-trimmed forms (some test envs render
        // differently).
        const dateText = screen.getByText(/2020/);
        expect(dateText.textContent).toMatch(/2020/);
        expect(dateText.textContent).toMatch(/Feb/i);
    });

    it("falls back to updated_at when original_published_at is null", () => {
        const article = makeArticle({ original_published_at: null });
        render(<ArticleCard article={article} onClick={vi.fn()} />);
        // updated_at = 2026-05-11 -> "11. Mai 2026"
        expect(screen.getByText(/2026/)).toBeInTheDocument();
        expect(screen.getByText(/Mai/i)).toBeInTheDocument();
    });

    it("falls back to updated_at when original_published_at is undefined (legacy API responses)", () => {
        const article = makeArticle({});  // no original_published_at field
        render(<ArticleCard article={article} onClick={vi.fn()} />);
        expect(screen.getByText(/2026/)).toBeInTheDocument();
    });
});
