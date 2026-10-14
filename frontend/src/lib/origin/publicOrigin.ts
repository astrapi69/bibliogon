/**
 * Where this app is published, from one source (#1102).
 *
 * The host used to be written out in thirteen places - five meta tags in
 * `index.html`, the sitemap, `robots.txt`, four components, the share
 * section's two URLs, and twice as a gate parameter - so a domain move was
 * a search-and-replace across file types with no way to tell whether it
 * had been complete. `public-origin.json` is the source now; this module is
 * how the app reads it, `vite.config.ts` how the static files do, and
 * `scripts/public_origin.py` how the shell does.
 *
 * `APP_URL` is the deployed app, which is not the same as the origin: a
 * GitHub-Pages project site lives under a path. Use `publicUrl` for a file
 * beside the app, never string concatenation - it is where the single and
 * double slash cases are handled once.
 *
 * None of this describes the origin the code is RUNNING on. For that, read
 * `window.location`, or `onSharedOrigin()` when the question is whether
 * this origin is shared with other sites.
 *
 * @example
 * <a href={APP_URL}>Open the web app</a>
 * ogImage: publicUrl("og-image.png")
 */

import config from "../../../public-origin.json";

/** Scheme and host the app is published under, with no trailing slash. */
export const PUBLIC_ORIGIN: string = config.origin;

/** The host alone, as the external-host gate and the SEO checks name it. */
export const PUBLIC_HOST: string = new URL(config.origin).host;

/** The deployed app, origin plus its path, with a trailing slash. */
export const APP_URL: string = `${config.origin}${config.appPath}`;

/** The preview deploy, which is a sibling path on the same origin. */
export const PREVIEW_URL: string = `${config.origin}${config.previewPath}`;

/**
 * An absolute URL for a file published beside the app.
 *
 * @param relativePath - the path under the app, with or without a leading
 *   slash (`og-image.png`, `/sitemap.xml`).
 * @returns the absolute URL, with exactly one slash at the join.
 */
export function publicUrl(relativePath: string): string {
    return `${APP_URL}${relativePath.replace(/^\/+/, "")}`;
}
