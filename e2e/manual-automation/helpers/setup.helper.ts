/**
 * Setup helpers for the manual-automation suite.
 *
 * The suite drives the SAME live backend as `e2e/smoke/` (the
 * `resetDatabase` auto-fixture in `../../fixtures/base` wipes the DB +
 * restores the mutation-prone settings before every test). These helpers
 * add the API-side seed shapes the manual test plan needs that the shared
 * `helpers/api.ts` does not already export, plus small UI-side primitives.
 *
 * Direct-API seeding (not the UI) is deliberate: the manual test plan's
 * Vorbedingung ("App mit Testdaten gefuellt") is setup, not the thing
 * under test. Seeding through the API keeps each spec focused on the one
 * surface it verifies.
 */

import type {Page} from "@playwright/test";

const API = "http://localhost:8000/api";

/** Thin JSON fetch wrapper (node-side, absolute URL). */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        headers: {"Content-Type": "application/json"},
        ...init,
    });
    if (!res.ok && res.status !== 204) {
        throw new Error(`API ${path}: ${res.status} ${await res.text()}`);
    }
    return res.status === 204 ? (undefined as T) : res.json();
}

export interface SeededAuthor {
    id: string;
    name: string;
    slug: string;
    is_profile_author: boolean;
}

export async function createAuthor(
    name: string,
    isProfile = false,
): Promise<SeededAuthor> {
    return api<SeededAuthor>("/authors", {
        method: "POST",
        body: JSON.stringify({name, is_profile_author: isProfile}),
    });
}

export async function listAuthors(): Promise<SeededAuthor[]> {
    return api<SeededAuthor[]>("/authors?limit=1000");
}

export async function wipeAuthors(): Promise<void> {
    for (const author of await listAuthors()) {
        await api(`/authors/${author.id}`, {method: "DELETE"});
    }
}

/** Create a story-bible entity on a book (plugin-story-bible). */
export async function createStoryEntity(
    bookId: string,
    name: string,
    entityType = "character",
): Promise<{id: string; name: string}> {
    return api(`/story-bible/books/${bookId}/entities`, {
        method: "POST",
        body: JSON.stringify({entity_type: entityType, name}),
    });
}

export async function getStoryEntities(
    bookId: string,
): Promise<{id: string; name: string}[]> {
    return api(`/story-bible/books/${bookId}/entities`);
}

/** PATCH a book (genre / language / cover_image / status / ...). */
export async function patchBook(
    id: string,
    patch: Record<string, unknown>,
): Promise<void> {
    await api(`/books/${id}`, {method: "PATCH", body: JSON.stringify(patch)});
}

/** PATCH an article (content_type / featured_image_url / status / ...). */
export async function patchArticle(
    id: string,
    patch: Record<string, unknown>,
): Promise<void> {
    await api(`/articles/${id}`, {method: "PATCH", body: JSON.stringify(patch)});
}

/** A 1x1 transparent PNG, the smallest valid cover image. */
const TINY_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

/**
 * Upload a real cover asset for a book and point `cover_image` at it, so the
 * grid card resolves a live `<img>` (TC-015 "with image" path). Returns the
 * stored filename.
 */
export async function uploadCover(bookId: string, filename = "cover.png"): Promise<string> {
    const bytes = Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0));
    const form = new FormData();
    // `asset_type` is a scalar param alongside an UploadFile, so FastAPI
    // reads it from the query string, not the multipart body.
    form.append("file", new Blob([bytes], {type: "image/png"}), filename);
    const res = await fetch(`${API}/books/${bookId}/assets?asset_type=cover`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) throw new Error(`upload cover: ${res.status} ${await res.text()}`);
    await patchBook(bookId, {cover_image: filename});
    return filename;
}

export async function getApp(): Promise<Record<string, unknown>> {
    return api<Record<string, unknown>>("/settings/app");
}

export async function patchApp(data: Record<string, unknown>): Promise<void> {
    await api("/settings/app", {method: "PATCH", body: JSON.stringify(data)});
}

/**
 * Resolve the persisted storage-mode override the running frontend reads.
 * Backend (`api`) vs the backendless `dexie` build decide which
 * feature-gate assertions are meaningful (Section 6). Reads the
 * `bibliogon.storage_mode` localStorage key (the explicit override the app
 * checks in `storage/index.ts`); a build-time `VITE_STORAGE_MODE=dexie`
 * also lands there once the app boots. Returns "api" when nothing is set,
 * which is the dev-server default this suite runs against.
 */
export async function resolveStorageMode(page: Page): Promise<string> {
    return page.evaluate(() => {
        try {
            return localStorage.getItem("bibliogon.storage_mode") ?? "api";
        } catch {
            return "api";
        }
    });
}
