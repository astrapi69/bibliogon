/**
 * Resolve the public origin into the static files that carry URLs (#1102).
 *
 * `index.html` cannot import a module, and a file in `public/` is copied
 * verbatim - so before this plugin the canonical URL, the two social
 * images, `og:url`, the JSON-LD `url`, the sitemap and `robots.txt` each
 * wrote the host out again. They are generated here instead, from
 * `public-origin.json`: the HTML keeps placeholders a reader can see, and
 * the sitemap and robots.txt are emitted rather than stored.
 *
 * `appUrl` is NOT derived from Vite's `base`. The two answer different
 * questions - `base` is where the bundle is served from in THIS build
 * (`/` for dev, preview and the Docker image), while the canonical URL has
 * to name the published address no matter which build writes it. A dev
 * build that advertised `https://host/` as canonical would be wrong in a
 * way nothing would catch.
 *
 * @example
 * plugins: [publicOrigin()]
 * // index.html: <link rel="canonical" href="%PUBLIC_APP_URL%"/>
 */

import type { Plugin } from "vite";

import {
    assertUsableOrigin,
    resolveOriginConfig,
    type OriginConfig,
} from "../src/lib/origin/originConfig";

export type PublicOriginConfig = OriginConfig;

/**
 * The config this build publishes from: the declared values with the
 * build's `VITE_PUBLIC_*` overrides applied, validated loudly.
 *
 * Validation lives here rather than in the app module because a throw at
 * config time fails the build, while the same throw in the bundle would
 * white-screen the app - and a typo'd override is a build mistake.
 *
 * @param declared - the values from `public-origin.json`.
 * @param env - the environment to read overrides from.
 * @returns the resolved config.
 * @throws Error when the resulting origin cannot carry a URL.
 */
export function configFromEnv(
    declared: OriginConfig,
    env: Record<string, string | undefined> = process.env,
): PublicOriginConfig {
    const resolved = resolveOriginConfig(declared, {
        origin: env.VITE_PUBLIC_ORIGIN,
        appPath: env.VITE_PUBLIC_APP_PATH,
    });
    assertUsableOrigin(resolved);
    return resolved;
}

/** The placeholders the HTML may use, and what each resolves to. */
export function placeholders(config: PublicOriginConfig): Record<string, string> {
    const appUrl = `${config.origin}${config.appPath}`;
    return {
        "%PUBLIC_ORIGIN%": config.origin,
        "%PUBLIC_APP_URL%": appUrl,
    };
}

/** Replace every placeholder in `html`; unknown `%…%` text is left alone. */
export function applyPlaceholders(html: string, config: PublicOriginConfig): string {
    let out = html;
    for (const [token, value] of Object.entries(placeholders(config))) {
        out = out.split(token).join(value);
    }
    return out;
}

/** The `robots.txt` body, pointing crawlers at the published sitemap. */
export function robotsTxt(config: PublicOriginConfig): string {
    const appUrl = `${config.origin}${config.appPath}`;
    return ["# Bibliogon PWA", "User-agent: *", "Allow: /", `Sitemap: ${appUrl}sitemap.xml`, ""].join(
        "\n",
    );
}

/** The sitemap body: the app's home page, dated by the build. */
export function sitemapXml(config: PublicOriginConfig, lastmod: string): string {
    const appUrl = `${config.origin}${config.appPath}`;
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "  <url>",
        `    <loc>${appUrl}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        "    <changefreq>weekly</changefreq>",
        "    <priority>1.0</priority>",
        "  </url>",
        "</urlset>",
        "",
    ].join("\n");
}

/** `YYYY-MM-DD` for a sitemap's `lastmod`. */
export function isoDate(now: Date): string {
    return now.toISOString().slice(0, 10);
}

/**
 * The plugin: placeholders in the HTML, sitemap and robots.txt in the
 * bundle.
 *
 * The two files are emitted rather than written into `public/` so there is
 * no copy on disk that can disagree with the source, and they are served
 * in dev too - a `robots.txt` that only exists in a production build is a
 * file nobody looks at until it is wrong.
 */
export function publicOrigin(config: PublicOriginConfig, now: () => Date = () => new Date()): Plugin {
    const files = () => ({
        "robots.txt": robotsTxt(config),
        "sitemap.xml": sitemapXml(config, isoDate(now())),
    });

    return {
        name: "bibliogon:public-origin",
        transformIndexHtml: {
            order: "pre",
            handler: (html) => applyPlaceholders(html, config),
        },
        generateBundle() {
            for (const [fileName, source] of Object.entries(files())) {
                this.emitFile({ type: "asset", fileName, source });
            }
        },
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const url = (request.url ?? "").split("?")[0];
                const name = url.replace(/^.*\//, "");
                const body = files()[name as keyof ReturnType<typeof files>];
                if (body === undefined || !["robots.txt", "sitemap.xml"].includes(name)) {
                    next();
                    return;
                }
                response.setHeader(
                    "Content-Type",
                    name.endsWith(".xml") ? "application/xml" : "text/plain",
                );
                response.end(body);
            });
        },
    };
}
