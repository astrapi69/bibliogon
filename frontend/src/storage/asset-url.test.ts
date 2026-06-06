/**
 * Asset-URL helper tests + regression pins for the two served URL shapes the
 * service-worker intercept matches.
 *
 * The SW (public/asset-intercept-sw.js) runs in a context vitest cannot load
 * (top-level `self.addEventListener`), and the offline E2E runs against the
 * dev server where the SW is disabled — so the SW's URL matching is otherwise
 * untested. These pins mirror its FILE_BY_NAME / FILE_BY_ID regexes; keep them
 * in sync with that file. They guard the most error-prone part: the two
 * `/assets/...` shapes must each match their own URL and NOT cross-match.
 */

import { describe, it, expect } from "vitest";

import { bookAssetFileUrl, coverFilenameFromPath } from "./asset-url";

describe("asset-url helpers", () => {
  it("bookAssetFileUrl builds the filename-served URL (encoded)", () => {
    expect(bookAssetFileUrl("b1", "fig.png")).toBe(
      "/api/books/b1/assets/file/fig.png",
    );
    expect(bookAssetFileUrl("b1", "a b.png")).toBe(
      "/api/books/b1/assets/file/a%20b.png",
    );
  });

  it("coverFilenameFromPath extracts the trailing filename", () => {
    expect(coverFilenameFromPath("assets/covers/cover-b1.png")).toBe(
      "cover-b1.png",
    );
    expect(coverFilenameFromPath(null)).toBeNull();
    expect(coverFilenameFromPath("")).toBeNull();
  });
});

describe("SW intercept URL shapes (mirror asset-intercept-sw.js)", () => {
  const FILE_BY_NAME = /\/api\/books\/([^/]+)\/assets\/file\/([^?#]+)/;
  const FILE_BY_ID = /\/api\/books\/([^/]+)\/assets\/([^/]+)\/file(?:[?#]|$)/;

  it("by-filename URL matches FILE_BY_NAME (not FILE_BY_ID)", () => {
    const path = "/api/books/bk1/assets/file/cover-bk1.png";
    const m = path.match(FILE_BY_NAME);
    expect(m?.[1]).toBe("bk1");
    expect(m?.[2]).toBe("cover-bk1.png");
    expect(path.match(FILE_BY_ID)).toBeNull();
  });

  it("by-id URL matches FILE_BY_ID (not FILE_BY_NAME)", () => {
    const path = "/api/books/bk1/assets/asset-123/file";
    const m = path.match(FILE_BY_ID);
    expect(m?.[1]).toBe("bk1");
    expect(m?.[2]).toBe("asset-123");
    expect(path.match(FILE_BY_NAME)).toBeNull();
  });

  it("a non-asset /api URL matches neither", () => {
    const path = "/api/books/bk1/chapters";
    expect(path.match(FILE_BY_NAME)).toBeNull();
    expect(path.match(FILE_BY_ID)).toBeNull();
  });
});
