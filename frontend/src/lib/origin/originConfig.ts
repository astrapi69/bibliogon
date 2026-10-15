/**
 * The published origin as a build parameter, not a constant (#1102).
 *
 * `public-origin.json` declares where the app is published. A second deploy
 * of the same bundle - the plan that ends the domain move's deadline: serve
 * the new domain from another host while the GitHub-Pages instance stays
 * reachable - publishes the same code at a different origin, and at the
 * root rather than under a path. So the declared values are defaults, and a
 * build may override them with `VITE_PUBLIC_ORIGIN` / `VITE_PUBLIC_APP_PATH`.
 *
 * This module is the rules, with no reading of its own, so the app module
 * and the Vite plugin cannot normalise differently: one reads
 * `import.meta.env`, the other `process.env`, and both end here.
 *
 * The preview deploy does NOT follow the override. It is a sibling path on
 * the GitHub-Pages origin, and production moving to another host does not
 * move it - a share link to the test build has to keep pointing at Pages.
 *
 * @example
 * const config = resolveOriginConfig(declared, { origin: process.env.VITE_PUBLIC_ORIGIN });
 * assertUsableOrigin(config); // at build time, where a throw is cheap
 */

/** What `public-origin.json` declares. */
export interface OriginConfig {
    origin: string;
    appPath: string;
    previewPath: string;
}

/** A resolved config: the override applied, plus where the preview stayed. */
export interface ResolvedOriginConfig extends OriginConfig {
    /** The origin the preview deploy is served from, always the declared one. */
    previewOrigin: string;
}

/** A build's overrides; an absent, empty or blank value is not an override. */
export interface OriginOverrides {
    origin?: string;
    appPath?: string;
}

function meaningful(value: string | undefined): string | null {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
}

/** A path with exactly one leading and one trailing slash; `/` stays `/`. */
function normalisePath(path: string): string {
    const inner = path.replace(/^\/+/, "").replace(/\/+$/, "");
    return inner.length > 0 ? `/${inner}/` : "/";
}

/**
 * Apply a build's overrides to the declared config.
 *
 * Normalises rather than validates, because this runs in the browser bundle
 * too, where a throw at import time would white-screen the app. The loud
 * check is {@link assertUsableOrigin}, at build time.
 *
 * @param declared - the values from `public-origin.json`.
 * @param overrides - a build's `VITE_PUBLIC_*` values, if any.
 * @returns the config to publish URLs from.
 */
export function resolveOriginConfig(
    declared: OriginConfig,
    overrides: OriginOverrides = {},
): ResolvedOriginConfig {
    const origin = meaningful(overrides.origin) ?? declared.origin;
    const appPath = meaningful(overrides.appPath) ?? declared.appPath;
    return {
        origin: origin.replace(/\/+$/, ""),
        appPath: normalisePath(appPath),
        previewPath: normalisePath(declared.previewPath),
        previewOrigin: declared.origin.replace(/\/+$/, ""),
    };
}

/**
 * Fail the build when the origin cannot carry a URL.
 *
 * Called from the Vite plugin, where a throw stops a bad bundle from being
 * written. Without it a typo'd override bakes a broken canonical URL into
 * the artifact, and nothing downstream can see it: every unit assertion is
 * about a template or a generator, and a crawler is the first reader.
 *
 * @param config - a resolved config.
 * @throws Error naming the offending value and what is wrong with it.
 */
export function assertUsableOrigin(config: OriginConfig): void {
    let parsed: URL;
    try {
        parsed = new URL(config.origin);
    } catch {
        throw new Error(
            `public origin ${JSON.stringify(config.origin)} is not an absolute URL ` +
                `(expected something like https://example.com)`,
        );
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(
            `public origin ${JSON.stringify(config.origin)} must be http or https, ` +
                `not ${parsed.protocol.replace(":", "")}`,
        );
    }
    if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
        throw new Error(
            `public origin ${JSON.stringify(config.origin)} must be scheme and host only; ` +
                `the path belongs in appPath`,
        );
    }
}
