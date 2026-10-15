# The published origin

Where Bibliogon's web app is published is declared in exactly one place:

```
frontend/public-origin.json
```

```json
{
  "origin": "https://astrapi69.github.io",
  "appPath": "/bibliogon/",
  "previewPath": "/bibliogon-preview/"
}
```

Changing the origin there is the entire code side of a domain move. Nothing
else carries the host, and a guard test fails if something starts to
(#1102).

## Who reads it

| Reader | What it does with it |
|---|---|
| `frontend/src/lib/origin/publicOrigin.ts` | `PUBLIC_ORIGIN`, `PUBLIC_HOST`, `APP_URL`, `PREVIEW_URL`, `publicUrl(path)` for every absolute URL the app ships (share links and QR code, the migration dialog, the help panel's web-app link, the default `og:image`, the docs link in Settings > About) |
| `frontend/build-plugins/publicOrigin.ts` (a Vite plugin) | resolves `%PUBLIC_APP_URL%` / `%PUBLIC_ORIGIN%` in `index.html`, and emits `sitemap.xml` + `robots.txt` into the bundle |
| `scripts/public_origin.py` | prints a field for the shell: the `--origin` argument of the external-host gate, in the `Makefile` and in `deploy-pages.yml` |
| `frontend/src/lib/origin/originConfig.ts` | the normalisation and validation rules both of the above end in, so one reading `import.meta.env` and one reading `process.env` cannot resolve differently |

## Publishing the same bundle at a second origin

The declared values are defaults. A build may override them:

```bash
VITE_PUBLIC_ORIGIN=https://example.com VITE_PUBLIC_APP_PATH=/ npm run build
```

That is what lets the new domain run on a **second host** (Cloudflare
Pages, Netlify) while the GitHub-Pages instance stays reachable - which
removes the deadline from the domain move entirely: nothing is stranded,
because nothing is switched off. The old instance can be retired whenever,
not when DNS forces it.

Both overrides go through `resolveOriginConfig`, so the bundle and
`scripts/public_origin.py` normalise identically (a trailing slash is
stripped, a path gets both slashes, `/` stays `/`, and a blank value is not
an override - an unset env-var arrives as `""`). The plugin additionally
calls `assertUsableOrigin`, which **fails the build** on an origin that is
not absolute or that carries a path: a typo would otherwise bake a broken
canonical URL into the artifact, where a crawler is the first reader.

Pass the same variables to the gate, which reads them from the same place:

```bash
VITE_PUBLIC_ORIGIN=https://example.com make verify-external-hosts
```

`PREVIEW_URL` deliberately does **not** follow the override. The preview
deploy is a sibling path on the GitHub-Pages origin; production moving to
another host does not move it, so the share link to the test build keeps
pointing at Pages.

## Why the app URL is not derived from Vite's `base`

They answer different questions. `base` (from `VITE_BASE_URL`) is where the
bundle is served from in *this* build - `/` for dev, for the preview server
and for the Docker image. `APP_URL` is the published address, which the
canonical URL and the social-card tags have to name no matter which build
writes them. A dev build whose canonical URL said `http://localhost:5173/`
would be wrong in a way nothing would catch.

## Adding a URL

- **In the app:** `import { APP_URL, publicUrl } from "lib/origin/publicOrigin"`.
  Use `publicUrl("og-image.png")` rather than string concatenation; it is
  where the slash cases are handled once.
- **In a static file the build processes** (`index.html`): a
  `%PUBLIC_APP_URL%` placeholder.
- **In a file that would otherwise live in `public/`:** emit it from the
  plugin instead. A file in `public/` is copied verbatim, so a placeholder
  in it would ship unresolved - which is why `sitemap.xml` and `robots.txt`
  are generated rather than stored.
- **In a script or workflow:** `python3 scripts/public_origin.py`.

## What the guard does not cover

`frontend/src/lib/origin/publicOrigin.guard.test.ts` scans the shipped and
gate-forming files and allows a short, annotated list: the source itself,
docblocks that name the origin to explain shared-origin behaviour, tests
whose inputs are hostnames, the generated help-doc seeds, and the two legal
pages. The legal pages name the host in a sentence about who operates the
site, not in a URL the app resolves; per the decision in #991 they are the
last step of a domain move, after the domain and HTTPS are in place.

## Verifying a change

```bash
cd frontend && npx vitest run src/lib/origin build-plugins src/seoStatic
cd backend && poetry run pytest tests/test_public_origin_script.py
make verify-external-hosts            # reads the origin from the source
cd frontend && npm run build && cat dist/robots.txt dist/sitemap.xml

# and the same bundle at a second origin
cd frontend && VITE_PUBLIC_ORIGIN=https://example.com VITE_PUBLIC_APP_PATH=/ \
  npm run build && cat dist/robots.txt dist/sitemap.xml
```

The artifact itself is checked by `e2e/static-smoke/seo-origin.spec.ts`,
which reads the canonical URL, the social tags, the JSON-LD `url`,
`robots.txt` and `sitemap.xml` off the real built page - the only level at
which an unresolved placeholder or a plugin that stopped running is
visible.
