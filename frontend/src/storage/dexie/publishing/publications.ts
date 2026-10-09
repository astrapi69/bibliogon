/**
 * Publications for DexieStorage (#747): the record of where an article
 * was published, with the drift detection that makes it worth keeping.
 *
 * Mirror of `app/routers/publications.py`. Two things carry the weight:
 *
 * - **Drift detection runs on every READ**, as it does server-side.
 *   `markPublished` stores a snapshot of the article's `content_json`;
 *   a later read that finds the article changed flips the row to
 *   `out_of_sync` and persists the flip, so the next read does not redo
 *   the comparison. Without it an offline publication would read
 *   `published` forever, however far the article moved - which is the
 *   one thing this feature exists to tell the user.
 * - **`verifyLive` touches no network.** The endpoint's own docstring is
 *   "User asserts the live version matches the local snapshot": it moves
 *   the snapshot forward, stamps `last_verified_at` and clears
 *   `out_of_sync`. So there is nothing here to gate on connectivity.
 *
 * `platform_metadata` is validated against the platform's schema from
 * the seeded map (#1015), so an offline create is refused for the same
 * input the backend's 400 refuses.
 */

import type {
    Article,
    Publication,
    PublicationCreate,
    PublicationUpdate,
} from "../../../api/client";
import {
    PlatformMetadataError,
    validatePlatformMetadata,
} from "../../../lib/utils/publishing/platformMetadata";
import type { IStorageService } from "../../types";
import { newId, notFound } from "../helpers";
import { articlePlatforms } from "../reference";
import { type GraphRow, offlineDb } from "../schema";
import { serializedUpdate } from "../serialized-update";

function nowIso(): string {
    return new Date().toISOString();
}

async function articleOf(articleId: string): Promise<Article> {
    const article = await offlineDb.articles.get(articleId);
    if (!article) notFound("Article", articleId);
    return article as Article;
}

/**
 * Compare the stored snapshot against the article's current content and
 * persist an `out_of_sync` flip. Only a `published` row with a snapshot
 * can drift: a draft has nothing to be out of sync with, and a row
 * already flipped stays flipped until `verifyLive` clears it.
 */
async function checkDrift(pub: Publication, article: Article): Promise<Publication> {
    if (pub.status !== "published") return pub;
    if (pub.content_snapshot_at_publish === null) return pub;
    if (pub.content_snapshot_at_publish === article.content_json) return pub;
    const flipped: Publication = { ...pub, status: "out_of_sync", updated_at: nowIso() };
    await offlineDb.publications.put(flipped as unknown as GraphRow);
    return flipped;
}

async function rowOf(articleId: string, pubId: string): Promise<Publication> {
    const row = (await offlineDb.publications.get(pubId)) as unknown as Publication | undefined;
    if (!row || row.article_id !== articleId) notFound("Publication", pubId);
    return row as Publication;
}

/** Refuse invalid metadata the way the endpoint's 400 refuses it. */
async function assertMetadataValid(
    platform: string,
    metadata: Record<string, unknown>,
): Promise<void> {
    const schemas = await articlePlatforms.list();
    const { valid, errors } = validatePlatformMetadata(schemas[platform], metadata);
    if (!valid) throw new PlatformMetadataError(platform, errors);
}

export const publications: IStorageService["publications"] = {
    list: async (articleId) => {
        const article = await articleOf(articleId);
        const rows = (await offlineDb.publications
            .where("article_id")
            .equals(articleId)
            .toArray()) as unknown as Publication[];
        const ordered = rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
        const checked: Publication[] = [];
        for (const pub of ordered) checked.push(await checkDrift(pub, article));
        return checked;
    },

    get: async (articleId, pubId) =>
        checkDrift(await rowOf(articleId, pubId), await articleOf(articleId)),

    create: async (articleId, data: PublicationCreate) => {
        await articleOf(articleId);
        const metadata = data.platform_metadata ?? {};
        await assertMetadataValid(data.platform, metadata);
        const timestamp = nowIso();
        const row: Publication = {
            id: newId(),
            article_id: articleId,
            platform: data.platform,
            is_promo: data.is_promo ?? false,
            status: "planned",
            platform_metadata: metadata,
            content_snapshot_at_publish: null,
            scheduled_at: data.scheduled_at ?? null,
            published_at: null,
            last_verified_at: null,
            notes: data.notes ?? null,
            created_at: timestamp,
            updated_at: timestamp,
        };
        await offlineDb.publications.add(row as unknown as GraphRow);
        return row;
    },

    update: async (articleId, pubId, data: PublicationUpdate) =>
        serializedUpdate("publications", pubId, async () => {
            const existing = await rowOf(articleId, pubId);
            if (data.platform_metadata !== undefined) {
                await assertMetadataValid(existing.platform, data.platform_metadata);
            }
            const merged: Publication = { ...existing, ...data, updated_at: nowIso() };
            await offlineDb.publications.put(merged as unknown as GraphRow);
            return merged;
        }),

    delete: async (articleId, pubId) => {
        await rowOf(articleId, pubId);
        await offlineDb.publications.delete(pubId);
    },

    markPublished: async (articleId, pubId, payload) =>
        serializedUpdate("publications", pubId, async () => {
            const article = await articleOf(articleId);
            const existing = await rowOf(articleId, pubId);
            const publishedAt = payload.published_at ?? nowIso();
            // The URL rides inside platform_metadata rather than a column of
            // its own, so a mark-published carrying one merges into whatever
            // the form already stored there.
            const metadata = payload.published_url
                ? { ...existing.platform_metadata, published_url: payload.published_url }
                : existing.platform_metadata;
            const merged: Publication = {
                ...existing,
                status: "published",
                content_snapshot_at_publish: article.content_json ?? null,
                published_at: publishedAt,
                last_verified_at: publishedAt,
                platform_metadata: metadata,
                updated_at: nowIso(),
            };
            await offlineDb.publications.put(merged as unknown as GraphRow);
            return merged;
        }),

    verifyLive: async (articleId, pubId) =>
        serializedUpdate("publications", pubId, async () => {
            const article = await articleOf(articleId);
            const existing = await rowOf(articleId, pubId);
            const merged: Publication = {
                ...existing,
                content_snapshot_at_publish: article.content_json ?? null,
                last_verified_at: nowIso(),
                status: existing.status === "out_of_sync" ? "published" : existing.status,
                updated_at: nowIso(),
            };
            await offlineDb.publications.put(merged as unknown as GraphRow);
            return merged;
        }),
};
