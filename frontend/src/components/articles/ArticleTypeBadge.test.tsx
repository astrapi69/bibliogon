/**
 * Vitest cases for ArticleTypeBadge.
 *
 * Filed by ARTICLE-TYPES-SSOT-01 C7 (2026-05-29).
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";

import {ArticleTypeBadge} from "./ArticleTypeBadge";
import {ArticleTypesProvider} from "../../hooks/useArticleTypes";
import type {ArticleTypeDef} from "../../api/client";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}));

const TYPES: Record<string, ArticleTypeDef> = {
    blogpost: {
        id: "blogpost",
        label_key: "ui.article_types.blogpost",
        description_key: "ui.article_types.blogpost_description",
        icon: "FileText",
        default: true,
        extra_fields: [],
    },
    tutorial: {
        id: "tutorial",
        label_key: "ui.article_types.tutorial",
        description_key: "ui.article_types.tutorial_description",
        icon: "GraduationCap",
        default: false,
        extra_fields: [],
    },
};

function renderBadge(contentType: string) {
    return render(
        <ArticleTypesProvider initialTypes={TYPES}>
            <ArticleTypeBadge
                contentType={contentType}
                testId="badge"
            />
        </ArticleTypesProvider>,
    );
}

describe("ArticleTypeBadge", () => {
    it("renders the registry's label_key fallback for a known content_type", () => {
        // Our i18n mock returns the fallback (2nd arg) — the
        // component passes ``contentType`` as the fallback when
        // looking up the registry's label_key, so the badge
        // surfaces the bare id when the i18n catalog isn't loaded.
        // Real product usage carries the German/English label;
        // this assertion pins the safe-fallback behavior.
        renderBadge("tutorial");
        const badge = screen.getByTestId("badge");
        expect(badge.textContent).toContain("tutorial");
    });

    it("falls back to the raw content_type for an unknown value", () => {
        renderBadge("unknown_legacy_type");
        const badge = screen.getByTestId("badge");
        // For an unknown id, the convenience selector returns the
        // id itself as the label_key. ``t()`` mock returns the
        // fallback (also the id). Net: the badge surfaces the id
        // string verbatim, NOT throws.
        expect(badge.textContent).toContain("unknown_legacy_type");
    });

    it("renders an icon (svg) element for a known type", () => {
        renderBadge("blogpost");
        const badge = screen.getByTestId("badge");
        const svg = badge.querySelector("svg");
        expect(svg).toBeTruthy();
    });
});
