/**
 * Manual-Testplan Section 7 — Service-Worker / Stale-Bundle.
 *
 * TC-064 (Stale-SW-Clear + Live-Test) is a RELEASE BLOCKER but only PARTLY
 * automatable: the real browser SW unregister + "Clear site data" + hard
 * reload path stays manual. The automatable slice is a post-deploy check
 * that the LIVE bundle actually carries an expected string literal of the
 * current release (so a stale CDN/SW bundle is caught). That slice runs
 * here only when `LIVE_URL` is provided, and as a standalone CI step via
 * `scripts/check_live_chunk.sh` (see .github/workflows/manual-automation.yml).
 *
 * TC-065 (SW-Update-Erkennung: focus/visibility/hourly timing) stays manual
 * — real-browser update timing is not reproducible in a deterministic test.
 */

import {test, expect} from "@playwright/test";

const LIVE_URL = process.env.LIVE_URL;
const EXPECTED_MARKER = process.env.EXPECTED_MARKER;

// Pure Playwright (no DB fixture): this section talks to a deployed site,
// not the local backend.
test.describe("Section 7 — TC-064 live bundle freshness", () => {
    test("the deployed app shell carries the expected release marker", async ({request}) => {
        test.skip(
            !LIVE_URL || !EXPECTED_MARKER,
            "Set LIVE_URL (deployed site) + EXPECTED_MARKER (a string literal of " +
                "the current release, e.g. the version) to run the post-deploy " +
                "freshness check. Otherwise this is a no-op (local dev has no SW).",
        );

        // Fetch the entry HTML, then the referenced JS chunks, and confirm
        // the marker appears in the shipped bundle — the curl-on-live-chunk
        // technique from the stale-service-worker-root-cause memory.
        const indexRes = await request.get(LIVE_URL!);
        expect(indexRes.status()).toBe(200);
        const html = await indexRes.text();
        const chunkPaths = Array.from(
            html.matchAll(/(?:src|href)="([^"']+\.js)"/g),
            (m) => m[1],
        );
        expect(chunkPaths.length).toBeGreaterThan(0);

        let found = html.includes(EXPECTED_MARKER!);
        for (const path of chunkPaths) {
            if (found) break;
            const url = new URL(path, LIVE_URL!).toString();
            const res = await request.get(url);
            if (res.ok() && (await res.text()).includes(EXPECTED_MARKER!)) {
                found = true;
            }
        }
        expect(
            found,
            `Expected marker "${EXPECTED_MARKER}" not found in the deployed bundle at ${LIVE_URL} — possible stale SW/CDN bundle.`,
        ).toBe(true);
    });
});

// TC-065 documented-as-manual: real SW update-detection timing
// (focus/visibility/hourly) is not deterministically reproducible.
test.fixme("TC-065 SW update detection — manual only (real-browser timing)", () => {});
