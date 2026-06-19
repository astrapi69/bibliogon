/**
 * ArticleImageUpload storage-mode tests (#157).
 *
 * Verifies the dexie-mode offline path stores the blob via the seam and
 * reports the new asset id, the api-mode path uploads to the endpoint, and
 * remove clears both fields.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

import ArticleImageUpload from "./ArticleImageUpload";

const storageMock: {
    mode: "api" | "dexie";
    articleAssets: { store: ReturnType<typeof vi.fn>; deleteByArticle: ReturnType<typeof vi.fn> };
} = {
    mode: "dexie",
    articleAssets: { store: vi.fn(), deleteByArticle: vi.fn() },
};

vi.mock("../storage", () => ({ getStorage: () => storageMock }));

// Preview resolves to a stable value so the preview + remove button render.
let previewValue: string | null = null;
vi.mock("../hooks/article/useArticleImageUrl", () => ({
    useArticleImageUrl: () => previewValue,
}));

const uploadMock = vi.fn();
const urlForMock = vi.fn(
    (articleId: string, filename: string) => `/api/articles/${articleId}/assets/file/${filename}`,
);
vi.mock("../api/client", () => ({
    ApiError: class ApiError extends Error {
        detail = "";
    },
    api: {
        articleAssets: {
            upload: (...args: unknown[]) => uploadMock(...args),
            urlFor: (a: string, f: string) => urlForMock(a, f),
            list: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({ t: (_k: string, fallback: string) => fallback }),
}));

vi.mock("../utils/notify", () => ({
    notify: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
    storageMock.mode = "dexie";
    storageMock.articleAssets.store.mockReset().mockResolvedValue("new-asset-id");
    storageMock.articleAssets.deleteByArticle.mockReset().mockResolvedValue(undefined);
    uploadMock.mockReset().mockResolvedValue({ filename: "pic.png", id: "srv-1" });
    previewValue = null;
});

const pngFile = () => new File(["bytes"], "pic.png", { type: "image/png" });

describe("ArticleImageUpload — storage modes (#157)", () => {
    it("dexie mode stores the blob via the seam + reports the asset id", async () => {
        const onChange = vi.fn();
        const { getByTestId } = render(
            <ArticleImageUpload articleId="a1" value={null} assetId={null} onChange={onChange} />,
        );
        fireEvent.change(getByTestId("article-featured-image-file-input"), {
            target: { files: [pngFile()] },
        });
        await waitFor(() => expect(storageMock.articleAssets.store).toHaveBeenCalled());
        expect(storageMock.articleAssets.store).toHaveBeenCalledWith(
            "a1",
            expect.any(File),
            "pic.png",
            "image/png",
        );
        expect(onChange).toHaveBeenCalledWith(null, "new-asset-id");
        expect(uploadMock).not.toHaveBeenCalled();
    });

    it("api mode uploads to the endpoint + reports the served url", async () => {
        storageMock.mode = "api";
        const onChange = vi.fn();
        const { getByTestId } = render(
            <ArticleImageUpload articleId="a1" value={null} assetId={null} onChange={onChange} />,
        );
        fireEvent.change(getByTestId("article-featured-image-file-input"), {
            target: { files: [pngFile()] },
        });
        await waitFor(() => expect(uploadMock).toHaveBeenCalled());
        expect(onChange).toHaveBeenCalledWith("/api/articles/a1/assets/file/pic.png", null);
        expect(storageMock.articleAssets.store).not.toHaveBeenCalled();
    });

    it("dexie mode remove deletes the cached blob + clears both fields", async () => {
        previewValue = "blob:fake";
        const onChange = vi.fn();
        const { getByTestId } = render(
            <ArticleImageUpload
                articleId="a1"
                value={null}
                assetId="asset-1"
                onChange={onChange}
            />,
        );
        fireEvent.click(getByTestId("article-featured-image-remove"));
        await waitFor(() =>
            expect(storageMock.articleAssets.deleteByArticle).toHaveBeenCalledWith("a1"),
        );
        expect(onChange).toHaveBeenCalledWith(null, null);
    });
});
