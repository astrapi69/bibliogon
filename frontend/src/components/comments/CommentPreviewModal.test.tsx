/**
 * CommentPreviewModal tests pin the pure-presentational contract:
 * - Closed when comment === null (testid absent from DOM).
 * - Open when a comment is passed; metadata + full body render.
 * - Reclassify button is disabled while pendingReclassify is true.
 * - Delete button is disabled while pendingDelete is true.
 * - Tooltip text on the reclassify button carries the Bug 4c
 *   educational message.
 * - Close button + footer-close button both fire onClose.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import CommentPreviewModal from "./CommentPreviewModal";
import type {ArticleComment} from "../../api/client";

const t = (_k: string, fallback?: string) => fallback || _k;

function mkComment(over: Partial<ArticleComment> = {}): ArticleComment {
    return {
        id: "c-1",
        author: "Alice",
        body_text: "Hello world, this is the full body text.",
        body_json: null,
        language: "en",
        published_at: null,
        canonical_url: null,
        responds_to_article_id: null,
        responds_to_url: null,
        imported_from: "medium",
        imported_at: "2026-05-12T00:00:00+00:00",
        source_filename: null,
        created_at: "2026-05-12T00:00:00+00:00",
        updated_at: "2026-05-12T00:00:00+00:00",
        ...over,
    };
}

describe("CommentPreviewModal", () => {
    it("is closed when comment is null", () => {
        render(
            <CommentPreviewModal
                comment={null}
                onClose={() => {}}
                onReclassify={() => {}}
                onDelete={() => {}}
                pendingReclassify={false}
                pendingDelete={false}
                t={t}
                lang="en"
            />,
        );
        expect(screen.queryByTestId("comment-preview-modal")).toBeNull();
    });

    it("renders metadata + full body when a comment is set", () => {
        const comment = mkComment({
            body_text:
                "This is a long body text that the modal must render in full, not truncated.",
        });
        render(
            <CommentPreviewModal
                comment={comment}
                onClose={() => {}}
                onReclassify={() => {}}
                onDelete={() => {}}
                pendingReclassify={false}
                pendingDelete={false}
                t={t}
                lang="en"
            />,
        );
        expect(screen.getByTestId("comment-preview-modal")).toBeTruthy();
        expect(screen.getByTestId("comment-preview-metadata").textContent).toContain(
            "Alice",
        );
        expect(screen.getByTestId("comment-preview-body").textContent).toBe(
            comment.body_text,
        );
    });

    it("renders the parent URL link when responds_to_url is set", () => {
        render(
            <CommentPreviewModal
                comment={mkComment({
                    responds_to_url: "https://example.com/parent",
                })}
                onClose={() => {}}
                onReclassify={() => {}}
                onDelete={() => {}}
                pendingReclassify={false}
                pendingDelete={false}
                t={t}
                lang="en"
            />,
        );
        const link = screen
            .getByTestId("comment-preview-metadata")
            .querySelector("a");
        expect(link).not.toBeNull();
        expect(link!.getAttribute("href")).toBe("https://example.com/parent");
        // External link opens in new tab + has rel='noopener noreferrer'.
        expect(link!.getAttribute("target")).toBe("_blank");
        expect(link!.getAttribute("rel")).toBe("noopener noreferrer");
    });

    it("reclassify button carries the Bug 4c educational tooltip", () => {
        render(
            <CommentPreviewModal
                comment={mkComment()}
                onClose={() => {}}
                onReclassify={() => {}}
                onDelete={() => {}}
                pendingReclassify={false}
                pendingDelete={false}
                t={t}
                lang="en"
            />,
        );
        const btn = screen.getByTestId(
            "comment-preview-reclassify",
        ) as HTMLButtonElement;
        const title = btn.getAttribute("title") || "";
        // Pin a representative phrase from the German tooltip text.
        expect(title.toLowerCase()).toContain(
            "import-heuristik".toLowerCase(),
        );
    });

    it("disables both action buttons while a per-row request is pending", () => {
        const {rerender} = render(
            <CommentPreviewModal
                comment={mkComment()}
                onClose={() => {}}
                onReclassify={() => {}}
                onDelete={() => {}}
                pendingReclassify={true}
                pendingDelete={false}
                t={t}
                lang="en"
            />,
        );
        expect(
            (screen.getByTestId("comment-preview-reclassify") as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        expect(
            (screen.getByTestId("comment-preview-delete") as HTMLButtonElement)
                .disabled,
        ).toBe(true);

        rerender(
            <CommentPreviewModal
                comment={mkComment()}
                onClose={() => {}}
                onReclassify={() => {}}
                onDelete={() => {}}
                pendingReclassify={false}
                pendingDelete={true}
                t={t}
                lang="en"
            />,
        );
        expect(
            (screen.getByTestId("comment-preview-reclassify") as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        expect(
            (screen.getByTestId("comment-preview-delete") as HTMLButtonElement)
                .disabled,
        ).toBe(true);
    });

    it("clicking Reclassify calls onReclassify with the comment", () => {
        const spy = vi.fn();
        const comment = mkComment();
        render(
            <CommentPreviewModal
                comment={comment}
                onClose={() => {}}
                onReclassify={spy}
                onDelete={() => {}}
                pendingReclassify={false}
                pendingDelete={false}
                t={t}
                lang="en"
            />,
        );
        fireEvent.click(screen.getByTestId("comment-preview-reclassify"));
        expect(spy).toHaveBeenCalledWith(comment);
    });

    it("clicking Delete calls onDelete with the comment", () => {
        const spy = vi.fn();
        const comment = mkComment();
        render(
            <CommentPreviewModal
                comment={comment}
                onClose={() => {}}
                onReclassify={() => {}}
                onDelete={spy}
                pendingReclassify={false}
                pendingDelete={false}
                t={t}
                lang="en"
            />,
        );
        fireEvent.click(screen.getByTestId("comment-preview-delete"));
        expect(spy).toHaveBeenCalledWith(comment);
    });

    it("footer close button fires onClose", () => {
        const spy = vi.fn();
        render(
            <CommentPreviewModal
                comment={mkComment()}
                onClose={spy}
                onReclassify={() => {}}
                onDelete={() => {}}
                pendingReclassify={false}
                pendingDelete={false}
                t={t}
                lang="en"
            />,
        );
        fireEvent.click(screen.getByTestId("comment-preview-close-footer"));
        expect(spy).toHaveBeenCalled();
    });
});
