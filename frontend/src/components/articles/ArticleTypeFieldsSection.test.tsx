/**
 * Vitest cases for ArticleTypeFieldsSection.
 *
 * Filed by ARTICLE-TYPES-SSOT-01 C6 (2026-05-29).
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import {ArticleTypeFieldsSection} from "./ArticleTypeFieldsSection";
import {ArticleTypesProvider} from "../../hooks/useArticleTypes";
import type {ArticleType, ArticleTypeDef} from "../../api/client";

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
        extra_fields: [
            {
                name: "difficulty_level",
                type: "enum",
                label_key: "ui.article_types.tutorial_field_difficulty",
                values: ["beginner", "intermediate", "advanced"],
            },
            {
                name: "prerequisites",
                type: "text",
                label_key: "ui.article_types.tutorial_field_prerequisites",
            },
            {
                name: "estimated_duration_minutes",
                type: "number",
                label_key: "ui.article_types.tutorial_field_duration",
            },
        ],
    },
    review: {
        id: "review",
        label_key: "ui.article_types.review",
        description_key: "ui.article_types.review_description",
        icon: "Star",
        default: false,
        extra_fields: [
            {
                name: "rating",
                type: "number",
                label_key: "ui.article_types.review_field_rating",
                min: 1,
                max: 5,
            },
        ],
    },
    newsletter: {
        id: "newsletter",
        label_key: "ui.article_types.newsletter",
        description_key: "ui.article_types.newsletter_description",
        icon: "Mail",
        default: false,
        extra_fields: [
            {
                name: "send_date",
                type: "date",
                label_key: "ui.article_types.newsletter_field_send_date",
            },
        ],
    },
    essay: {
        id: "essay",
        label_key: "ui.article_types.essay",
        description_key: "ui.article_types.essay_description",
        icon: "Feather",
        default: false,
        extra_fields: [],
    },
};

function renderSection(
    contentType: string,
    metadata: Record<string, unknown> = {},
    onChange: (
        contentType: ArticleType,
        next: Record<string, unknown>,
    ) => void = vi.fn(),
) {
    return render(
        <ArticleTypesProvider initialTypes={TYPES}>
            <ArticleTypeFieldsSection
                contentType={contentType}
                metadata={metadata}
                onChange={onChange}
            />
        </ArticleTypesProvider>,
    );
}

describe("ArticleTypeFieldsSection — empty cases", () => {
    it("renders nothing for blogpost (no extra_fields)", () => {
        const {container} = renderSection("blogpost");
        expect(container.textContent).toBe("");
    });

    it("renders nothing for essay (no extra_fields)", () => {
        const {container} = renderSection("essay");
        expect(container.textContent).toBe("");
    });

    it("renders nothing for unknown content_type", () => {
        const {container} = renderSection("unknown_type");
        expect(container.textContent).toBe("");
    });
});

describe("ArticleTypeFieldsSection — tutorial fields", () => {
    it("renders all 3 tutorial fields", () => {
        renderSection("tutorial");
        expect(screen.getByTestId("article-type-field-difficulty_level")).toBeTruthy();
        expect(screen.getByTestId("article-type-field-prerequisites")).toBeTruthy();
        expect(
            screen.getByTestId("article-type-field-estimated_duration_minutes"),
        ).toBeTruthy();
    });

    it("difficulty_level renders as a select with the 3 enum values", () => {
        renderSection("tutorial", {difficulty_level: "beginner"});
        const select = screen.getByTestId(
            "article-type-field-difficulty_level",
        ) as HTMLSelectElement;
        expect(select.tagName).toBe("SELECT");
        expect(select.value).toBe("beginner");
        const options = Array.from(select.options).map((o) => o.value);
        expect(options).toContain("beginner");
        expect(options).toContain("intermediate");
        expect(options).toContain("advanced");
    });

    it("prerequisites renders as a text input", () => {
        renderSection("tutorial", {prerequisites: "Some prereq"});
        const input = screen.getByTestId(
            "article-type-field-prerequisites",
        ) as HTMLInputElement;
        expect(input.tagName).toBe("INPUT");
        expect(input.type).toBe("text");
        expect(input.value).toBe("Some prereq");
    });

    it("estimated_duration_minutes renders as a number input", () => {
        renderSection("tutorial", {estimated_duration_minutes: 45});
        const input = screen.getByTestId(
            "article-type-field-estimated_duration_minutes",
        ) as HTMLInputElement;
        expect(input.tagName).toBe("INPUT");
        expect(input.type).toBe("number");
        expect(input.value).toBe("45");
    });
});

describe("ArticleTypeFieldsSection — review fields with bounds", () => {
    it("rating input carries min + max attributes", () => {
        renderSection("review", {rating: 4});
        const input = screen.getByTestId(
            "article-type-field-rating",
        ) as HTMLInputElement;
        expect(input.type).toBe("number");
        expect(input.min).toBe("1");
        expect(input.max).toBe("5");
        expect(input.value).toBe("4");
    });
});

describe("ArticleTypeFieldsSection — newsletter date field", () => {
    it("send_date renders as a date input", () => {
        renderSection("newsletter", {send_date: "2026-06-01"});
        const input = screen.getByTestId(
            "article-type-field-send_date",
        ) as HTMLInputElement;
        expect(input.type).toBe("date");
        expect(input.value).toBe("2026-06-01");
    });
});

describe("ArticleTypeFieldsSection — onChange", () => {
    it("text input fires onChange with merged metadata", () => {
        const onChange = vi.fn();
        renderSection("tutorial", {difficulty_level: "beginner"}, onChange);
        const input = screen.getByTestId(
            "article-type-field-prerequisites",
        ) as HTMLInputElement;
        fireEvent.change(input, {target: {value: "Python basics"}});
        expect(onChange).toHaveBeenCalledWith("tutorial", {
            difficulty_level: "beginner",
            prerequisites: "Python basics",
        });
    });

    it("number input parses to number; empty string → null", () => {
        const onChange = vi.fn();
        renderSection("review", {rating: 3}, onChange);
        const input = screen.getByTestId(
            "article-type-field-rating",
        ) as HTMLInputElement;
        fireEvent.change(input, {target: {value: "5"}});
        expect(onChange).toHaveBeenCalledWith("review", {rating: 5});
        onChange.mockClear();
        fireEvent.change(input, {target: {value: ""}});
        expect(onChange).toHaveBeenCalledWith("review", {rating: null});
    });

    it("enum select onChange fires the new value", () => {
        const onChange = vi.fn();
        renderSection("tutorial", {}, onChange);
        const select = screen.getByTestId(
            "article-type-field-difficulty_level",
        ) as HTMLSelectElement;
        fireEvent.change(select, {target: {value: "advanced"}});
        expect(onChange).toHaveBeenCalledWith("tutorial", {
            difficulty_level: "advanced",
        });
    });

    it("date input onChange fires the new value", () => {
        const onChange = vi.fn();
        renderSection("newsletter", {}, onChange);
        const input = screen.getByTestId(
            "article-type-field-send_date",
        ) as HTMLInputElement;
        fireEvent.change(input, {target: {value: "2026-07-15"}});
        expect(onChange).toHaveBeenCalledWith("newsletter", {
            send_date: "2026-07-15",
        });
    });
});
