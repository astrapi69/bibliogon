/**
 * Vitest coverage for the build-provenance helper.
 *
 * The build-time literals are replaced by Vite's `define` during vitest
 * runs (config shared with the app), so VITE_IS_PREVIEW is unset and
 * __IS_PREVIEW__ resolves to false here — pinning the production-build
 * contract. __BUILD_COMMIT__ is the real local full SHA, so the commit-URL
 * shape is asserted by prefix.
 */

import { describe, it, expect } from "vitest";
import { getBuildInfo, REPO_URL } from "./buildInfo";

describe("getBuildInfo", () => {
  it("reports isPreview=false on a non-preview (production/local) build", () => {
    expect(getBuildInfo().isPreview).toBe(false);
  });

  it("returns the app version from the build-time literal", () => {
    expect(getBuildInfo().version).toBe(__APP_VERSION__);
  });

  it("derives an 8-char short commit and a GitHub commit URL", () => {
    const build = getBuildInfo();
    expect(build.commit).toBeTruthy();
    expect(build.commit).not.toBe("unknown");
    expect(build.commitShort.length).toBeLessThanOrEqual(8);
    expect(build.commitUrl.startsWith(`${REPO_URL}/commit`)).toBe(true);
  });

  it("exposes branch + date from build-time literals", () => {
    const build = getBuildInfo();
    expect(build.branch).toBe(__BUILD_BRANCH__ || "unknown");
    expect(build.date).toBeTruthy();
  });
});
