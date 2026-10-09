/**
 * Remove provider secrets from a settings blob before it leaves the device.
 *
 * The full backup and the selective export both embed `settings` whole, so
 * every `.bgb` a user sends to someone else, attaches to a bug report or
 * drops in a cloud folder carried every AI provider key verbatim (#985).
 * A key is the one thing in that bundle that is worth money to a stranger,
 * and the one thing a restore can get from the user instead.
 *
 * Three fields hold a secret, because the AI config has grown three shapes
 * (see `normalizeAiConfig`):
 *
 *  - `ai.keys` - the canonical per-provider map (#460)
 *  - `ai.provider_keys[id].api_key` - the #459 side-store
 *  - `ai.api_key` - the derived mirror of the active provider
 *
 * Everything else about the AI config survives: which provider is active,
 * the model overrides, the base URLs, the temperature. A restore therefore
 * puts the user back where they were minus the keys, which they paste once.
 *
 * The input is not modified. Only the branches that need changing are
 * copied, so an unrelated settings tree keeps its identity.
 *
 * @example
 * const {settings, removed} = scrubSecrets({ai: {api_key: "sk-x", keys: {google: "g"}}})
 * // settings.ai has neither field; removed === ["ai.api_key", "ai.keys.google"]
 */

/** A settings blob with its secrets gone, and what was taken out. */
export interface ScrubResult {
    /** The blob to write out. The input is untouched. */
    settings: unknown;
    /** Dotted paths that held a secret, in a stable order, for the UI to
     *  name what the backup will not contain. */
    removed: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Non-empty string keys of `value`, sorted, or `[]` when it is not a map. */
function secretKeys(value: unknown): string[] {
    if (!isRecord(value)) return [];
    return Object.keys(value)
        .filter((id) => typeof value[id] === "string" && (value[id] as string).trim() !== "")
        .sort();
}

/**
 * Strip every known secret field from a settings blob.
 *
 * @param settings - The blob as the storage seam returns it. Anything that
 *   is not an object comes back unchanged, so a caller does not have to
 *   guard against a missing or malformed settings response.
 */
export function scrubSecrets(settings: unknown): ScrubResult {
    if (!isRecord(settings) || !isRecord(settings.ai)) {
        return {settings, removed: []};
    }

    const ai = {...settings.ai};
    const removed: string[] = [];

    if (typeof ai.api_key === "string" && ai.api_key.trim() !== "") {
        removed.push("ai.api_key");
    }
    if ("api_key" in ai) {
        ai.api_key = "";
    }

    for (const id of secretKeys(ai.keys)) {
        removed.push(`ai.keys.${id}`);
    }
    if ("keys" in ai) {
        ai.keys = {};
    }

    if (isRecord(ai.provider_keys)) {
        const providerKeys: Record<string, unknown> = {};
        for (const [id, entry] of Object.entries(ai.provider_keys).sort()) {
            if (!isRecord(entry)) {
                providerKeys[id] = entry;
                continue;
            }
            if (typeof entry.api_key === "string" && entry.api_key.trim() !== "") {
                removed.push(`ai.provider_keys.${id}.api_key`);
            }
            providerKeys[id] = "api_key" in entry ? {...entry, api_key: ""} : entry;
        }
        ai.provider_keys = providerKeys;
    }

    return {settings: {...settings, ai}, removed};
}

/**
 * Merge a restored settings blob over the live one without losing secrets.
 *
 * Scrubbing the export (above) creates a second obligation: a bundle now
 * carries `ai.keys: {}` and `ai.api_key: ""`, and a restore that writes
 * those over the live settings would DELETE the keys the user has
 * configured on this machine. The backup is meant to put them back where
 * they were, not to log them out of their AI provider.
 *
 * So a secret in the restored blob wins only when it actually holds
 * something. Everything else in the blob is applied as before, which keeps
 * the restore's "settings are overwritten" rule intact for every field
 * that is not a secret.
 *
 * An older bundle, taken before #985, still carries real keys and still
 * restores them - the rule is "empty does not overwrite", not "never
 * overwrite".
 *
 * @param live - Settings as they are now, from the storage seam.
 * @param restored - The `data.settings` of the bundle being imported.
 * @returns The blob to hand to `settings.updateApp`.
 *
 * @example
 * preserveLocalSecrets({ai: {keys: {google: "g"}}}, {ai: {keys: {}}})
 * // -> {ai: {keys: {google: "g"}}}
 */
export function preserveLocalSecrets(live: unknown, restored: unknown): unknown {
    if (!isRecord(restored) || !isRecord(restored.ai)) return restored;
    const liveAi = isRecord(live) && isRecord(live.ai) ? live.ai : {};

    const ai = {...restored.ai};

    if (!isNonEmptyString(ai.api_key) && isNonEmptyString(liveAi.api_key)) {
        ai.api_key = liveAi.api_key;
    }

    ai.keys = mergeKeyMaps(liveAi.keys, ai.keys);

    if (isRecord(liveAi.provider_keys) || isRecord(ai.provider_keys)) {
        ai.provider_keys = mergeProviderKeys(liveAi.provider_keys, ai.provider_keys);
    }

    return {...restored, ai};
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

/** Restored entries win where they hold a secret; local ones survive. */
function mergeKeyMaps(live: unknown, restored: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (isRecord(live)) {
        for (const [id, value] of Object.entries(live)) {
            if (isNonEmptyString(value)) out[id] = value;
        }
    }
    if (isRecord(restored)) {
        for (const [id, value] of Object.entries(restored)) {
            if (isNonEmptyString(value)) out[id] = value;
        }
    }
    return out;
}

/** The same rule one level deeper, for the #459 side-store. */
function mergeProviderKeys(live: unknown, restored: unknown): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const liveEntries = isRecord(live) ? live : {};
    const restoredEntries = isRecord(restored) ? restored : {};

    for (const id of new Set([...Object.keys(liveEntries), ...Object.keys(restoredEntries)])) {
        const liveEntry = liveEntries[id];
        const restoredEntry = restoredEntries[id];
        if (!isRecord(restoredEntry)) {
            out[id] = restoredEntry ?? liveEntry;
            continue;
        }
        const merged = {...restoredEntry};
        if (
            !isNonEmptyString(merged.api_key) &&
            isRecord(liveEntry) &&
            isNonEmptyString(liveEntry.api_key)
        ) {
            merged.api_key = liveEntry.api_key;
        }
        out[id] = merged;
    }
    return out;
}
