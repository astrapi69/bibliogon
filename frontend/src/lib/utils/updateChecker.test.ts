/**
 * Tests for the GitHub Releases update checker (#477).
 *
 * Pins the semver compare and the three checkForUpdate outcomes
 * (update-available / up-to-date / error) against a mocked fetch.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import {
  checkForUpdate,
  compareVersions,
  RELEASE_TAG_BASE_URL,
} from "./updateChecker";

function mockFetch(impl: () => Promise<Partial<Response>> | Partial<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compareVersions", () => {
  it("orders patch/minor/major and tolerates a leading v", () => {
    expect(compareVersions("v0.56.0", "v0.57.0")).toBe(-1);
    expect(compareVersions("v0.57.0", "v0.56.0")).toBe(1);
    expect(compareVersions("1.0.0", "0.99.0")).toBe(1);
    expect(compareVersions("0.99.0", "1.0.0")).toBe(-1);
    expect(compareVersions("0.56.0", "v0.56.0")).toBe(0);
  });

  it("treats missing segments as 0", () => {
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.1")).toBe(-1);
  });
});

describe("checkForUpdate", () => {
  it("reports update-available with the release url + notes for a newer tag", async () => {
    mockFetch(() => ({
      ok: true,
      json: async () => ({
        tag_name: "v0.57.0",
        html_url: "https://github.com/astrapi69/bibliogon/releases/tag/v0.57.0",
        body: "## What's new\n- stuff",
        published_at: "2026-06-20T00:00:00Z",
      }),
    }));
    const result = await checkForUpdate("0.56.0");
    expect(result.status).toBe("update-available");
    expect(result.latestVersion).toBe("v0.57.0");
    expect(result.releaseUrl).toContain("/releases/tag/v0.57.0");
    expect(result.releaseNotes).toContain("What's new");
    expect(result.publishedAt).toBe("2026-06-20T00:00:00Z");
  });

  it("reports up-to-date when the latest tag equals the current version", async () => {
    mockFetch(() => ({
      ok: true,
      json: async () => ({ tag_name: "v0.56.0" }),
    }));
    const result = await checkForUpdate("0.56.0");
    expect(result.status).toBe("up-to-date");
    expect(result.latestVersion).toBe("v0.56.0");
  });

  it("falls back to the tag URL when html_url is absent", async () => {
    mockFetch(() => ({
      ok: true,
      json: async () => ({ tag_name: "v0.57.0" }),
    }));
    const result = await checkForUpdate("0.56.0");
    expect(result.releaseUrl).toBe(`${RELEASE_TAG_BASE_URL}v0.57.0`);
  });

  it("reports error on a non-OK response", async () => {
    mockFetch(() => ({ ok: false, json: async () => ({}) }));
    const result = await checkForUpdate("0.56.0");
    expect(result.status).toBe("error");
    expect(result.currentVersion).toBe("0.56.0");
  });

  it("reports error on a network throw", async () => {
    mockFetch(() => {
      throw new Error("offline");
    });
    const result = await checkForUpdate("0.56.0");
    expect(result.status).toBe("error");
  });
});
