/**
 * Optional GitHub personal-access-token storage for the GitHub import (#353).
 *
 * The token is stored client-side only and is NEVER sent anywhere but
 * `api.github.com` / `raw.githubusercontent.com`. It lifts the
 * unauthenticated rate limit (60 requests/hour) to the authenticated one
 * (5000/hour) and unlocks private repositories. It is optional: public-repo
 * import works with no token at all.
 *
 * Storage (#880): a dedicated IndexedDB database, `bibliogon-credentials`,
 * separate from the app data in `bibliogon-offline` so a full backup never
 * carries it. IndexedDB is not a security boundary against a script running
 * on the origin, but the token is no longer a one-line `localStorage` read
 * and no longer sits in the storage that extensions and injected snippets
 * scrape first. A token left in `localStorage` by an earlier version is moved
 * on the first read and its old key removed.
 *
 * @example
 * ```ts
 * await saveGitHubToken(input);
 * const token = await loadGitHubToken();
 * ```
 */

import Dexie, { type Table } from "dexie";

/** The `localStorage` key earlier versions stored the token under. */
export const LEGACY_TOKEN_KEY = "bibliogon.github_token";

const DB_NAME = "bibliogon-credentials";
const GITHUB_TOKEN_ID = "github_token";

interface StoredSecret {
    id: string;
    value: string;
}

class CredentialDB extends Dexie {
    secrets!: Table<StoredSecret, string>;

    constructor() {
        super(DB_NAME);
        this.version(1).stores({ secrets: "id" });
    }
}

let credentialDb: CredentialDB | null = null;

function database(): CredentialDB {
    credentialDb ??= new CredentialDB();
    return credentialDb;
}

function readLegacyToken(): string {
    try {
        return (localStorage.getItem(LEGACY_TOKEN_KEY) ?? "").trim();
    } catch {
        return "";
    }
}

function removeLegacyToken(): void {
    try {
        localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
        return;
    }
}

/**
 * Read the stored GitHub token, or an empty string when none is set.
 * Moves a token left in `localStorage` by an earlier version into
 * IndexedDB; a token already in IndexedDB wins over a stale legacy one.
 */
export async function loadGitHubToken(): Promise<string> {
    const stored = await database().secrets.get(GITHUB_TOKEN_ID);
    const legacy = readLegacyToken();
    removeLegacyToken();
    if (stored?.value) return stored.value;
    if (!legacy) return "";
    await database().secrets.put({ id: GITHUB_TOKEN_ID, value: legacy });
    return legacy;
}

/** Persist the trimmed token, or delete it when the input is empty. */
export async function saveGitHubToken(token: string): Promise<void> {
    removeLegacyToken();
    const trimmed = token.trim();
    if (trimmed) {
        await database().secrets.put({ id: GITHUB_TOKEN_ID, value: trimmed });
    } else {
        await database().secrets.delete(GITHUB_TOKEN_ID);
    }
}

/**
 * Drop the whole credential database. Used by the danger-zone reset, which
 * must not leave a token behind when it wipes everything else.
 */
export async function deleteCredentialStore(): Promise<void> {
    credentialDb?.close();
    credentialDb = null;
    removeLegacyToken();
    await Dexie.delete(DB_NAME);
}
