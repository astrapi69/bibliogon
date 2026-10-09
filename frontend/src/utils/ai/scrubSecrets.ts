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

/** One base URL a restore would change while a key for it is configured. */
export interface BaseUrlChange {
    /** Provider id, or `""` for the derived top-level `ai.base_url`. */
    provider: string;
    /** What this device points that provider at today. */
    from: string;
    /** What the bundle would point it at. */
    to: string;
}

/**
 * Base URLs a restore would change for a provider whose key is already
 * configured on this device.
 *
 * A base URL is not a secret, so {@link scrubSecrets} leaves it in the
 * bundle, and a restore is meant to overwrite settings. The combination
 * is the problem: `preserveLocalSecrets` keeps the live key, and the
 * bundle supplies the endpoint - so a restore can quietly point an
 * existing key at a host the user did not choose, which is the one way
 * a key can leave the device without anybody typing it anywhere.
 *
 * Only providers that HOLD a live key are reported. Changing the base
 * URL of a provider with no key configured costs nothing: the next call
 * fails for want of a key, which is visible.
 *
 * An absent or empty value in the bundle is "no opinion" rather than a
 * change, so it is not reported either.
 *
 * @returns One entry per affected provider, provider-sorted with the
 *   top-level mirror last, or `[]` when nothing needs asking.
 *
 * @example
 * baseUrlChangesBesideKeys(
 *   {ai: {keys: {custom: "k"}, base_url_overrides: {custom: "http://localhost:1234/v1"}}},
 *   {ai: {base_url_overrides: {custom: "https://elsewhere.test/v1"}}},
 * )
 * // -> [{provider: "custom", from: "http://localhost:1234/v1", to: "https://elsewhere.test/v1"}]
 */
export function baseUrlChangesBesideKeys(
    live: unknown,
    restored: unknown,
): BaseUrlChange[] {
    if (!isRecord(live) || !isRecord(live.ai)) return [];
    if (!isRecord(restored) || !isRecord(restored.ai)) return [];
    const liveAi = live.ai;
    const restoredAi = restored.ai;

    const keyed = new Set<string>();
    if (isRecord(liveAi.keys)) {
        for (const [id, value] of Object.entries(liveAi.keys)) {
            if (isNonEmptyString(value)) keyed.add(id);
        }
    }
    if (isRecord(liveAi.provider_keys)) {
        for (const [id, entry] of Object.entries(liveAi.provider_keys)) {
            if (isRecord(entry) && isNonEmptyString(entry.api_key)) keyed.add(id);
        }
    }
    if (keyed.size === 0) return [];

    const changes: BaseUrlChange[] = [];
    const liveOverrides = isRecord(liveAi.base_url_overrides)
        ? liveAi.base_url_overrides
        : {};
    const restoredOverrides = isRecord(restoredAi.base_url_overrides)
        ? restoredAi.base_url_overrides
        : {};

    for (const provider of [...keyed].sort()) {
        const to = restoredOverrides[provider];
        if (!isNonEmptyString(to)) continue;
        const from = isNonEmptyString(liveOverrides[provider])
            ? liveOverrides[provider]
            : "";
        if (from !== to) changes.push({provider, from, to});
    }

    // The derived top-level mirror points at whichever provider is
    // active. It only matters when THAT provider holds a key.
    const active = isNonEmptyString(liveAi.active_provider)
        ? liveAi.active_provider
        : "";
    if (active && keyed.has(active) && isNonEmptyString(restoredAi.base_url)) {
        const from = isNonEmptyString(liveAi.base_url) ? liveAi.base_url : "";
        if (from !== restoredAi.base_url) {
            changes.push({provider: "", from, to: restoredAi.base_url});
        }
    }

    return changes;
}

/**
 * {@link preserveLocalSecrets}, with the live base URLs kept as well.
 *
 * What the importer applies when the user declines the change that
 * {@link baseUrlChangesBesideKeys} reported: every other setting in the
 * bundle still restores, the endpoints the keys talk to do not move.
 */
export function preserveLocalBaseUrls(live: unknown, restored: unknown): unknown {
    const merged = preserveLocalSecrets(live, restored);
    if (!isRecord(merged) || !isRecord(merged.ai)) return merged;
    const liveAi = isRecord(live) && isRecord(live.ai) ? live.ai : {};
    const ai = {...merged.ai};

    if (isRecord(liveAi.base_url_overrides) || isRecord(ai.base_url_overrides)) {
        ai.base_url_overrides = {
            ...(isRecord(ai.base_url_overrides) ? ai.base_url_overrides : {}),
            ...(isRecord(liveAi.base_url_overrides) ? liveAi.base_url_overrides : {}),
        };
    }
    if (isNonEmptyString(liveAi.base_url)) {
        ai.base_url = liveAi.base_url;
    }
    return {...merged, ai};
}
